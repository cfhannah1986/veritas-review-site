// POST /api/order — launch order intake for Veritas Review.
//
// Receives the order form (multipart): validates the fields, stores the
// manuscript in the MANUSCRIPTS R2 bucket under orders/<uuid>/, and saves
// order.json metadata next to it. Payment itself is handled by PayPal;
// Cory matches the PayPal transaction ID to the order manually.
//
// Required binding (Pages project settings -> Functions -> R2 bucket
// bindings): variable name MANUSCRIPTS -> bucket veritas-manuscripts.

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXT = new Set(["pdf", "docx", "txt", "md", "epub"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cleanFileName(name) {
  const base = name.replace(/\.[^.]+$/, "");
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return (safe || "manuscript");
}

export async function onRequestGet() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.MANUSCRIPTS) {
      return json(
        { ok: false, error: "Upload storage is not configured yet. Please try again later." },
        503
      );
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ ok: false, error: "Could not read the submitted form." }, 400);
    }

    // Honeypot: silently "succeed" for bots.
    if (form.get("bot-field")) return json({ ok: true });

    const str = (k) => (form.get(k) || "").toString().trim();
    const name = str("name");
    const email = str("email");
    const txn = str("paypal_txn");
    const bookTitle = str("book_title");
    const file = form.get("manuscript");

    if (!name) return json({ ok: false, error: "Please enter your name." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json({ ok: false, error: "Please enter a valid email address." }, 400);
    if (!bookTitle) return json({ ok: false, error: "Please enter your book title." }, 400);
    if (!txn) return json({ ok: false, error: "Please enter your PayPal transaction ID." }, 400);
    if (!file || typeof file === "string" || !file.size)
      return json({ ok: false, error: "Please attach your manuscript file." }, 400);
    if (file.size > MAX_BYTES)
      return json(
        { ok: false, error: "That file is over 15 MB. Please email it to us instead." },
        400
      );

    const origName = file.name || "manuscript";
    const ext = (origName.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext))
      return json({ ok: false, error: "Accepted formats: PDF, DOCX, TXT, MD, or EPUB." }, 400);

    const orderId = crypto.randomUUID();
    const safeName = cleanFileName(origName) + "." + ext;
    const keyBase = "orders/" + orderId;

    await env.MANUSCRIPTS.put(keyBase + "/" + safeName, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    const meta = {
      order_id: orderId,
      name: name,
      email: email,
      paypal_txn: txn,
      book_title: bookTitle,
      author_name: str("author_name"),
      genre: str("genre"),
      author_notes: str("author_notes"),
      spotlight_consent: form.get("spotlight_consent") === "yes",
      filename: safeName,
      file_size: file.size,
      status: "received",
      created_at: new Date().toISOString(),
    };
    await env.MANUSCRIPTS.put(keyBase + "/order.json", JSON.stringify(meta, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });

    return json({ ok: true, order_id: orderId });
  } catch (e) {
    return json({ ok: false, error: "Something went wrong on our end. Please try again." }, 500);
  }
}
