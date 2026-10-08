// POST /api/paypal/capture — capture and verify a PayPal payment.
//
// Called by the order page after the customer approves payment in the
// PayPal popup. We capture the PayPal order server-side and verify every
// detail against PayPal's own response before accepting anything:
//   - PayPal order status is COMPLETED
//   - the purchase unit's custom_id is OUR order UUID (bound at create)
//   - the capture is COMPLETED for exactly $14.99 USD
// Only then is order.json updated: paypal_txn = the capture ID,
// status = "payment_submitted", payment_verified = true. The intake
// imports the order as unpaid; Cory's payment check (and later the
// automated verifier) uses payment_verified plus the capture ID.
//
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE ("sandbox"|"live")

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICE = "14.99";

function apiBase(env) {
  return env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken(env) {
  const creds = btoa(env.PAYPAL_CLIENT_ID + ":" + env.PAYPAL_CLIENT_SECRET);
  const r = await fetch(apiBase(env) + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + creds,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error("paypal auth failed");
  const d = await r.json();
  return d.access_token;
}

export async function onRequestGet() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.MANUSCRIPTS)
      return json({ ok: false, error: "Order storage is not configured yet." }, 503);
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET)
      return json({ ok: false, error: "Payment is not configured yet. Please try again later." }, 503);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Could not read the request." }, 400);
    }
    const orderId = (body.order_id || "").toString().trim();
    const paypalOrderId = (body.paypal_order_id || "").toString().trim();
    if (!UUID_RE.test(orderId))
      return json({ ok: false, error: "Invalid order reference." }, 400);
    if (!paypalOrderId)
      return json({ ok: false, error: "Missing PayPal order reference." }, 400);

    const key = "orders/" + orderId + "/order.json";
    const obj = await env.MANUSCRIPTS.get(key);
    if (!obj) return json({ ok: false, error: "Order not found." }, 404);
    const meta = JSON.parse(await obj.text());
    if (meta.status === "payment_submitted" && meta.payment_verified) {
      return json({ ok: true, order_id: orderId, already: true });
    }
    if (meta.status !== "awaiting_payment")
      return json({ ok: false, error: "This order is not awaiting payment." }, 409);

    const token = await getAccessToken(env);
    const r = await fetch(
      apiBase(env) + "/v2/checkout/orders/" + encodeURIComponent(paypalOrderId) + "/capture",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
      }
    );
    const captured = await r.json().catch(() => null);
    if (!r.ok || !captured)
      return json({ ok: false, error: "PayPal could not complete the payment." }, 502);

    // Verify against PayPal's response, never the client's word.
    const unit = (captured.purchase_units || [])[0] || {};
    const captures =
      (unit.payments && unit.payments.captures) || [];
    const cap = captures[0] || {};
    const checks = {
      order_status_completed: captured.status === "COMPLETED",
      custom_id_matches: unit.custom_id === orderId,
      capture_status_completed: cap.status === "COMPLETED",
      amount_matches: !!(cap.amount && cap.amount.value === PRICE),
      currency_usd: !!(cap.amount && cap.amount.currency_code === "USD"),
    };
    const verified = Object.values(checks).every(Boolean);
    if (!verified) {
      // Record the raw PayPal response so the mismatch can be diagnosed
      // from storage instead of guessed at. Deleted once resolved.
      try {
        await env.MANUSCRIPTS.put(
          "orders/" + orderId + "/capture-debug.json",
          JSON.stringify(
            { at: new Date().toISOString(), checks: checks, captured: captured },
            null, 2
          ),
          { httpMetadata: { contentType: "application/json" } }
        );
      } catch { /* diagnostics must never block the response */ }
      return json(
        { ok: false, error: "The payment could not be verified. If you were charged, contact us and we will sort it out." },
        422
      );
    }

    meta.paypal_txn = cap.id || "";
    meta.paypal_order_id = paypalOrderId;
    meta.payer_email =
      (captured.payer && captured.payer.email_address) || "";
    meta.status = "payment_submitted";
    meta.payment_verified = true;
    meta.payment_verified_at = new Date().toISOString();
    meta.payment_mode = env.PAYPAL_MODE === "live" ? "live" : "sandbox";
    await env.MANUSCRIPTS.put(key, JSON.stringify(meta, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });

    return json({ ok: true, order_id: orderId });
  } catch (e) {
    return json({ ok: false, error: "Something went wrong on our end. Please try again." }, 500);
  }
}
