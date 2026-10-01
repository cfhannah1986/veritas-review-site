// Submit handler for the launch order form.
// POSTs the form (including the manuscript file) to the /api/order
// Pages Function, then sends the customer to the thank-you page.
(function () {
  var form = document.getElementById("order-form");
  if (!form) return;

  var btn = document.getElementById("order-submit");
  var err = document.getElementById("order-error");
  var fileInput = document.getElementById("manuscript-file");
  var MAX_BYTES = 15 * 1024 * 1024;

  function fail(msg) {
    err.textContent = msg;
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = "Upload manuscript";
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    err.hidden = true;

    if (fileInput.files.length && fileInput.files[0].size > MAX_BYTES) {
      fail("That file is over 15 MB. Please email it to us instead.");
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
})();
