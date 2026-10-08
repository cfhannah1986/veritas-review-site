// POST /api/paypal/create — create a PayPal order for a validated manuscript.
//
// Called by the order page's PayPal button after /api/order accepted the
// manuscript (order.json status "awaiting_payment"). Creates a PayPal
// checkout order for exactly $14.99 USD with our order UUID bound as
// reference_id and custom_id, so the capture step can prove the payment
// belongs to this order and no other.
//
// Env (Pages project > Settings > Environment variables, set by Cory):
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE ("sandbox"|"live")

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
    if (!UUID_RE.test(orderId))
      return json({ ok: false, error: "Invalid order reference." }, 400);

    const obj = await env.MANUSCRIPTS.get("orders/" + orderId + "/order.json");
    if (!obj) return json({ ok: false, error: "Order not found." }, 404);
    const meta = JSON.parse(await obj.text());
    if (meta.status !== "awaiting_payment")
      return json({ ok: false, error: "This order is not awaiting payment." }, 409);

    const token = await getAccessToken(env);
    const r = await fetch(apiBase(env) + "/v2/checkout/orders", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: orderId,
            custom_id: orderId,
            description: "Veritas Review - Manuscript Review",
            amount: { currency_code: "USD", value: PRICE },
          },
        ],
      }),
    });
    if (!r.ok)
      return json({ ok: false, error: "PayPal could not start the payment. Please try again." }, 502);
    const created = await r.json();
    if (!created.id)
      return json({ ok: false, error: "PayPal could not start the payment. Please try again." }, 502);

    return json({ ok: true, paypal_order_id: created.id });
  } catch (e) {
    return json({ ok: false, error: "Something went wrong on our end. Please try again." }, 500);
  }
}
