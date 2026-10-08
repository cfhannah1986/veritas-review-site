// POST /api/confirm — Veritas Review order intake, step 2: payment link.
//
// Called after the customer has (1) uploaded a manuscript that passed the
// word-count gate at /api/order and (2) paid via the PayPal button. The
// customer pastes their PayPal transaction ID here; we attach it to the
// order stored in R2 and flip order.json status from "awaiting_payment"
// to "payment_submitted". The intake script only imports orders in
// "payment_submitted" (or legacy "received") state, and Cory still
// verifies the PayPal payment manually before marking an order paid.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequestGet() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.MANUSCRIPTS) {
      return json(
        { ok: false, error: "Order storage is not configured yet. Please try again later." },
        503
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Could not read the request." }, 400);
    }

    const orderId = (body.order_id || "").toString().trim();
    const txn = (body.paypal_txn || "").toString().trim();
    if (!UUID_RE.test(orderId))
      return json({ ok: false, error: "Invalid order reference." }, 400);
    if (!txn)
      return json({ ok: false, error: "Please enter your PayPal transaction ID." }, 400);

    const key = "orders/" + orderId + "/order.json";
    const obj = await env.MANUSCRIPTS.get(key);
    if (!obj) return json({ ok: false, error: "Order not found." }, 404);

    const meta = JSON.parse(await obj.text());
    if (meta.status === "payment_submitted") {
      // Idempotent: same order confirmed twice is not an error.
      return json({ ok: true, order_id: orderId, already: true });
    }
    if (meta.status !== "awaiting_payment") {
      return json(
        { ok: false, error: "This order is no longer awaiting payment." },
        409
      );
    }

    meta.paypal_txn = txn;
    meta.status = "payment_submitted";
    meta.payment_submitted_at = new Date().toISOString();
    await env.MANUSCRIPTS.put(key, JSON.stringify(meta, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });

    return json({ ok: true, order_id: orderId });
  } catch (e) {
    return json({ ok: false, error: "Something went wrong on our end. Please try again." }, 500);
  }
}
