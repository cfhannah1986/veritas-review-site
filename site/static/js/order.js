// Two-step order flow for the launch order form.
//
// Step 1: POST the form (including the manuscript) to /api/order, which
// validates the fields and counts the words server-side (max 100,000)
// BEFORE any payment. TXT/MD are also counted in the browser for instant
// feedback. If the manuscript is rejected, nothing is stored and the
// customer never sees the payment step.
//
// Step 2: once /api/order accepts the manuscript, the PayPal checkout
// button is rendered. The customer pays in PayPal's popup without leaving
// the page; our server creates and captures the payment via
// /api/paypal/create and /api/paypal/capture and verifies the amount
// and order binding server-side. The customer never handles a
// transaction ID.
(function () {
  var form = document.getElementById("order-form");
  if (!form) return;

  var btn = document.getElementById("order-submit");
  var err = document.getElementById("order-error");
  var fileInput = document.getElementById("manuscript-file");
  var wordCountDisplay = document.getElementById("word-count-display");
  var paymentStep = document.getElementById("payment-step");
  var acceptedNote = document.getElementById("accepted-note");
  var payError = document.getElementById("confirm-error");
  var MAX_BYTES = 15 * 1024 * 1024;
  var MAX_WORDS = 100000;
  var orderId = null;

  function fail(msg) {
    err.textContent = msg;
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = "Check my manuscript";
  }

  function payFail(msg) {
    payError.textContent = msg;
    payError.hidden = false;
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

  function renderPayPalButton() {
    var clientId = window.VERITAS_PAYPAL_CLIENT_ID || "";
    if (!clientId) {
      payFail("Payment is not available yet. Please contact us to complete your order.");
      return;
    }
    var sdk = document.createElement("script");
    sdk.src = "https://www.paypal.com/sdk/js?client-id=" +
      encodeURIComponent(clientId) + "&currency=USD&intent=capture";
    sdk.onload = function () {
      if (!window.paypal) {
        payFail("The PayPal button failed to load. Please refresh the page and try again.");
        return;
      }
      window.paypal.Buttons({
        createOrder: function () {
          return fetch("/api/paypal/create", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ order_id: orderId }),
          })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d && d.ok && d.paypal_order_id) return d.paypal_order_id;
              throw new Error((d && d.error) || "create failed");
            })
            .catch(function (e) {
              payFail(e.message || "PayPal could not start the payment. Please try again.");
              throw e;
            });
        },
        onApprove: function (data) {
          return fetch("/api/paypal/capture", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ order_id: orderId, paypal_order_id: data.orderID }),
          })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d && d.ok) {
                window.location.href = "/order-received";
              } else {
                payFail((d && d.error) || "The payment could not be completed. Please try again.");
              }
            })
            .catch(function () {
              payFail("Network error completing the payment. If you were charged, contact us and we will sort it out.");
            });
        },
        onError: function () {
          payFail("Something went wrong with PayPal. Please try again.");
        },
      }).render("#paypal-buttons");
    };
    sdk.onerror = function () {
      payFail("The PayPal button failed to load. Please check your connection and refresh the page.");
    };
    document.head.appendChild(sdk);
  }

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
          renderPayPalButton();
        } else {
          fail((data && data.error) || "Upload failed. Please try again.");
        }
      })
      .catch(function () {
        fail("Network error. Please check your connection and try again.");
      });
  });
})();
