// POST /api/order — Veritas Review order intake, step 1: validate.
//
// Validates the form fields and counts the manuscript's words BEFORE any
// payment happens. Supported counts:
//   TXT/MD  - exact, from the raw text
//   DOCX    - exact, from word/document.xml inside the ZIP
//   EPUB    - exact, from the XHTML content files inside the ZIP
//   PDF     - best effort, from FlateDecode content streams; PDFs whose
//             text cannot be extracted are rejected with instructions to
//             upload DOCX/TXT/MD/EPUB instead.
//
// On success the manuscript is stored in the MANUSCRIPTS R2 bucket under
// orders/<uuid>/ with order.json status "awaiting_payment". No PayPal
// transaction is accepted here; the customer pays next and completes the
// order via POST /api/confirm. Orders left in "awaiting_payment" are
// purged by scripts/cleanup_unpaid.py after 48 hours.
//
// Required binding (Pages project settings -> Functions -> R2 bucket
// bindings): variable name MANUSCRIPTS -> bucket veritas-manuscripts.

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_WORDS = 100000;
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
  return safe || "manuscript";
}

function countWords(text) {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

// Minimal read-only ZIP parser: returns { entryName: Uint8Array }.
async function unzipEntries(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  const scanFloor = Math.max(0, bytes.length - 22 - 65536);
  for (let i = bytes.length - 22; i >= scanFloor; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip");
  const cdOffset = view.getUint32(eocd + 16, true);
  const cdCount = view.getUint16(eocd + 10, true);
  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < cdCount; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.slice(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const out = {};
  for (const e of entries) {
    const lp = e.localOffset;
    if (view.getUint32(lp, true) !== 0x04034b50) continue;
    const lNameLen = view.getUint16(lp + 26, true);
    const lExtraLen = view.getUint16(lp + 28, true);
    const dataStart = lp + 30 + lNameLen + lExtraLen;
    const comp = bytes.slice(dataStart, dataStart + e.compSize);
    if (e.method === 0) {
      out[e.name] = comp;
    } else if (e.method === 8) {
      const ds = new DecompressionStream("deflate-raw");
      const stream = new Blob([comp]).stream().pipeThrough(ds);
      out[e.name] = new Uint8Array(await new Response(stream).arrayBuffer());
    }
  }
  return out;
}

async function countDocxWords(buffer) {
  const entries = await unzipEntries(buffer);
  const xmlBytes = entries["word/document.xml"];
  if (!xmlBytes) return null;
  const xml = new TextDecoder().decode(xmlBytes);
  // Paragraphs and runs become spaces so adjacent words never fuse.
  const text = xml.replace(/<[^>]+>/g, " ");
  return countWords(text);
}

async function countEpubWords(buffer) {
  const entries = await unzipEntries(buffer);
  let total = 0;
  let found = false;
  for (const name of Object.keys(entries)) {
    if (/\.(xhtml|html|htm)$/i.test(name)) {
      found = true;
      const html = new TextDecoder().decode(entries[name]);
      total += countWords(html.replace(/<[^>]+>/g, " "));
    }
  }
  return found ? total : null;
}

// Best-effort PDF count: inflate FlateDecode streams and count words in
// the text-showing string fragments. Returns null when no readable text
// can be extracted (scanned images, exotic font encodings).
async function countPdfWords(buffer) {
  const bytes = new Uint8Array(buffer);
  const raw = new TextDecoder("latin1").decode(bytes);
  let total = 0;
  let fragments = 0;
  const marker = /stream\r?\n/g;
  let m;
  while ((m = marker.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const chunk = bytes.slice(start, end);
    let content;
    try {
      const ds = new DecompressionStream("deflate");
      const stream = new Blob([chunk]).stream().pipeThrough(ds);
      const inflated = new Uint8Array(await new Response(stream).arrayBuffer());
      content = new TextDecoder("latin1").decode(inflated);
    } catch {
      continue; // not a flate stream
    }
    const strRe = /\((?:\\.|[^\\()])*\)/g;
    let s;
    while ((s = strRe.exec(content)) !== null) {
      const inner = s[0]
        .slice(1, -1)
        .replace(/\\([()\\])/g, "$1")
        .replace(/\\[0-7]{1,3}/g, " ");
      fragments++;
      total += countWords(inner);
    }
  }
  if (!fragments || total < 10) return null;
  return total;
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
    const bookTitle = str("book_title");
    const file = form.get("manuscript");

    if (!name) return json({ ok: false, error: "Please enter your name." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json({ ok: false, error: "Please enter a valid email address." }, 400);
    if (!bookTitle) return json({ ok: false, error: "Please enter your book title." }, 400);
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

    // Word count gate: max 100,000 words, enforced BEFORE payment and
    // BEFORE anything is stored. Over-limit files are never uploaded to R2.
    const buffer = await file.arrayBuffer();
    let words = null;
    try {
      if (ext === "txt" || ext === "md") {
        words = countWords(new TextDecoder().decode(buffer));
      } else if (ext === "docx") {
        words = await countDocxWords(buffer);
      } else if (ext === "epub") {
        words = await countEpubWords(buffer);
      } else if (ext === "pdf") {
        words = await countPdfWords(buffer);
      }
    } catch {
      words = null;
    }
    if (words === null) {
      return json(
        {
          ok: false,
          error:
            "We could not read the text of that file to verify its word count. " +
            "Please upload a DOCX, TXT, MD, or EPUB version, or email us for help.",
        },
        400
      );
    }
    if (words > MAX_WORDS) {
      return json(
        {
          ok: false,
          error:
            "Your manuscript has " + words.toLocaleString() +
            " words; the maximum is 100,000 words. Please submit a shorter manuscript.",
        },
        400
      );
    }

    const orderId = crypto.randomUUID();
    const safeName = cleanFileName(origName) + "." + ext;
    const keyBase = "orders/" + orderId;

    await env.MANUSCRIPTS.put(keyBase + "/" + safeName, buffer, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    const meta = {
      order_id: orderId,
      name: name,
      email: email,
      paypal_txn: "",
      book_title: bookTitle,
      author_name: str("author_name"),
      genre: str("genre"),
      author_notes: str("author_notes"),
      spotlight_consent: form.get("spotlight_consent") === "yes",
      filename: safeName,
      file_size: file.size,
      word_count: words,
      status: "awaiting_payment",
      created_at: new Date().toISOString(),
    };
    await env.MANUSCRIPTS.put(keyBase + "/order.json", JSON.stringify(meta, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });

    return json({ ok: true, order_id: orderId, word_count: words });
  } catch (e) {
    return json({ ok: false, error: "Something went wrong on our end. Please try again." }, 500);
  }
}
