// Submit handler for the launch order form.
// POSTs the form (including the manuscript file) to the /api/order
// Pages Function, then sends the customer to the thank-you page.
//
// Word count validation: counts words in TXT/MD files directly in the browser
// before allowing submission. For DOCX/EPUB/PDF, shows a notice that the
// count will be verified server-side (max 100,000 words).
(function () {
  var form = document.getElementById("order-form");
  if (!form) return;

  var btn = document.getElementById("order-submit");
  var err = document.getElementById("order-error");
  var fileInput = document.getElementById("manuscript-file");
  var wordCountDisplay = document.getElementById("word-count-display");
  var MAX_BYTES = 15 * 1024 * 1024;
  var MAX_WORDS = 100000;
  var wordCountValid = false;

  function fail(msg) {
    err.textContent = msg;
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = "Upload manuscript";
  }

  function setWordCountStatus(words, isEstimate) {
    wordCountDisplay.hidden = false;
    if (words > MAX_WORDS) {
      wordCountDisplay.textContent = "Word count: " + words.toLocaleString() +
        " - OVER THE 100,000 WORD LIMIT. Please submit a shorter manuscript.";
      wordCountDisplay.style.color = "#ff8a8a";
      wordCountValid = false;
      btn.disabled = true;
    } else {
      var label = isEstimate ? " (estimated)" : "";
      wordCountDisplay.textContent = "Word count: " + words.toLocaleString() + label +
        " - within the 100,000 word limit. You may proceed to payment.";
      wordCountDisplay.style.color = "#7fdb8a";
      wordCountValid = true;
      btn.disabled = false;
    }
  }

  // Count words when a file is selected
  fileInput.addEventListener("change", function () {
    wordCountDisplay.hidden = true;
    wordCountValid = false;
    btn.disabled = true;

    if (!fileInput.files.length) return;
    var file = fileInput.files[0];
    var name = file.name.toLowerCase();

    // TXT and MD: count directly
    if (name.endsWith(".txt") || name.endsWith(".md")) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var text = e.target.result || "";
        var words = text.trim().split(/\s+/).filter(Boolean).length;
        setWordCountStatus(words, false);
      };
      reader.onerror = function () {
        wordCountDisplay.hidden = false;
        wordCountDisplay.textContent = "Could not read file. Word count will be verified after upload (max 100,000 words).";
        wordCountDisplay.style.color = "#888";
        wordCountValid = true; // allow, server will check
        btn.disabled = false;
      };
      reader.readAsText(file);
    } else {
      // DOCX/EPUB/PDF: can't count reliably in browser without heavy libraries.
      // Show notice; server-side check is the backstop.
      wordCountDisplay.hidden = false;
      wordCountDisplay.textContent = "Word count will be verified after upload. Maximum 100,000 words. " +
        "If your manuscript exceeds this, your upload will be rejected before payment is processed.";
      wordCountDisplay.style.color = "#888";
      wordCountValid = true; // allow, server will check
      btn.disabled = false;
    }
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    err.hidden = true;

    if (fileInput.files.length && fileInput.files[0].size > MAX_BYTES) {
      fail("That file is over 15 MB. Please email it to us instead.");
      return;
    }

    if (!wordCountValid) {
      fail("Please select a manuscript file and wait for the word count check.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Uploading...";

    fetch("/api/order", { method: "POST", body: new FormData(form) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          window.location.href = "/thanks";
        } else {
          fail((data && data.error) || "Upload failed. Please try again.");
        }
      })
      .catch(function () {
        fail("Network error. Please check your connection and try again.");
      });
  });

  // Start with submit disabled until a file is selected and checked
  btn.disabled = true;
})();
