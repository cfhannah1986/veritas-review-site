// Two-step order flow for the launch order form.
//
// Step 1: POST the form (including the manuscript) to /api/order, which
// validates the fields and counts the words server-side (max 100,000)
// BEFORE any payment. TXT/MD are also counted in the browser for instant
// feedback. If the manuscript is rejected, nothing is stored and the
// customer never sees the payment step.
//
// Step 2: once /api/order accepts the manuscript, the payment section is
// revealed. The customer pays via the PayPal button, pastes the
// transaction ID, and POSTs JSON to /api/confirm to complete the order.
(function () {
  var form = document.getElementById("order-form");
  if (!form) return;

  var btn = document.getElementById("order-submit");
  var err = document.getElementById("order-error");
  var fileInput = document.getElementById("manuscript-file");
  var wordCountDisplay = document.getElementById("word-count-display");
  var paymentStep = document.getElementById("payment-step");
  var acceptedNote = document.getElementById("accepted-note");
  var confirmBtn = document.getElementById("confirm-submit");
  var confirmErr = document.getElementById("confirm-error");
  var txnInput = document.getElementById("paypal-txn");
  var MAX_BYTES = 15 * 1024 * 1024;
  var MAX_WORDS = 100000;
  var orderId = null;

  function fail(msg) {
    err.textContent = msg;
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = "Check my manuscript";
  }

  // Instant browser-side pre-check for plain-text formats only. The
  // server-side count at /api/order is authoritative for every format.
  fileInput.addEventListener("change", function () {
    wordCountDisplay.hidden = true;
    if (!fileInput.files.length) return;
    var file = fileInput.files[0];
    var name = file.name.toLowerCase();
    if (name.endsWith(".txt") || name.endsWith(".md")) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var text = e.target.result || "";
        var words = text.trim().split(/\s+/).filter(Boolean).length;
        wordCountDisplay.hidden = false;
        if (words > MAX_WORDS) {
          wordCountDisplay.textContent = "Word count: " + words.toLocaleString() +
            " - over the 100,000 word limit. Please submit a shorter manuscript.";
          wordCountDisplay.style.color = "#ff8a8a";
        } else {
          wordCountDisplay.textContent = "Word count: " + words.toLocaleString() +
            " - within the 100,000 word limit.";
          wordCountDisplay.style.color = "#7fdb8a";
        }
      };
      reader.readAsText(file);
    }
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    err.hidden = true;

    if (fileInput.files.length && fileInput.files[0].size > MAX_BYTES) {
      fail("That file is over 15 MB. Please email it to us instead.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Checking...";

    fetch("/api/order", { method: "POST", body: new FormData(form) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.order_id) {
          orderId = data.order_id;
          btn.textContent = "Manuscript accepted";
          form.querySelectorAll("input, select, button").forEach(function (el) {
            el.disabled = true;
          });
          acceptedNote.textContent =
            "Word count: " + Number(data.word_count || 0).toLocaleString() +
            " words - within the 100,000 word limit. Your reference: " + orderId;
          paymentStep.hidden = false;
          paymentStep.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          fail((data && data.error) || "Upload failed. Please try again.");
        }
      })
      .catch(function () {
        fail("Network error. Please check your connection and try again.");
      });
  });

  confirmBtn.addEventListener("click", function () {
    confirmErr.hidden = true;
    var txn = (txnInput.value || "").trim();
    if (!orderId) {
      confirmErr.textContent = "Your manuscript has not been accepted yet.";
      confirmErr.hidden = false;
      return;
    }
    if (!txn) {
      confirmErr.textContent = "Please enter your PayPal transaction ID.";
      confirmErr.hidden = false;
      return;
    }
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Completing...";
    fetch("/api/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: orderId, paypal_txn: txn }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          window.location.href = "/thanks";
        } else {
          confirmErr.textContent =
            (data && data.error) || "Could not complete the order. Please try again.";
          confirmErr.hidden = false;
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Complete my order";
        }
      })
      .catch(function () {
        confirmErr.textContent = "Network error. Please check your connection and try again.";
        confirmErr.hidden = false;
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Complete my order";
      });
  });
})();
