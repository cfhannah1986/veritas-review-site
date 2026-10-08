---
title: Order your manuscript review
description: Order a thorough, evidence-based manuscript review for $14.99. Upload your manuscript and receive your review as PDF and DOCX.
---

<div class="page-head">
<p class="eyebrow">Order</p>
<h1>Get your review, $14.99</h1>
<p class="lede">Upload first, pay second. Your manuscript is checked against the 100,000 word limit before you pay anything, and your finished review arrives within 14 days of purchase.</p>
</div>

<div class="order-steps">
<div class="order-step">
<h3>1. Upload your manuscript</h3>
<p>Use the form below. We count the words on the spot: if the manuscript is over 100,000 words, you will know before paying, and nothing is stored.</p>
</div>
<div class="order-step">
<h3>2. Pay securely</h3>
<p>Once your manuscript is accepted, the PayPal checkout button appears right on this page. Click it, pay in PayPal's secure window, and you are done. Checkout is handled by PayPal; we never see or store your card details.</p>
</div>
<div class="order-step">
<h3>3. Receive your review</h3>
<p>Your manuscript goes through our structured review process, gets a final careful read, and arrives as PDF and DOCX.</p>
</div>
</div>

<h2>Upload your manuscript</h2>
<p>Accepted formats: DOCX, EPUB, TXT, MD, or PDF. Maximum file size: 15 MB. <strong>Maximum 100,000 words.</strong> Questions before you order? Email <a href="mailto:{{contact_email}}">{{contact_email}}</a>.</p>

<form id="order-form" class="waitlist-form" enctype="multipart/form-data">
<p class="hidden"><label>Don't fill this out: <input name="bot-field" tabindex="-1" autocomplete="off" /></label></p>
<p><label>Your name<br /><input type="text" name="name" required /></label></p>
<p><label>Email address<br /><input type="email" name="email" required /></label></p>
<p><label>Book title<br /><input type="text" name="book_title" required /></label></p>
<p><label>Author name<br /><input type="text" name="author_name" required /></label></p>
<p><label>Genre (optional)<br />
<select name="genre">
<option value="">Choose one</option>
<option>Novel</option>
<option>Novella</option>
<option>Short stories</option>
<option>Memoir</option>
<option>Something else</option>
</select></label></p>
<p><label>Manuscript file (DOCX, EPUB, TXT, MD, PDF, max 15 MB, max 100,000 words)<br /><input type="file" id="manuscript-file" name="manuscript" accept=".docx,.epub,.txt,.md,.pdf" required /></label></p>
<p id="word-count-display" class="tiny" hidden></p>
<p><label>Anything we should know? (optional)<br /><input type="text" name="author_notes" /></label></p>
<p><label><input type="checkbox" name="spotlight_consent" value="yes" /> If my book scores highly, Veritas Review may feature it on the blog with my name and the book's title.</label></p>
<p><button type="submit" class="btn" id="order-submit">Check my manuscript</button></p>
<p id="order-error" class="tiny" style="color:#ff8a8a" hidden></p>
</form>

<div id="payment-step" hidden>
<h2>Your manuscript is accepted</h2>
<p id="accepted-note" class="tiny"></p>
<p>One step left: pay $14.99 with the PayPal button below. A secure PayPal window opens right here; when the payment completes, your order is finished. No codes to copy, nothing else to fill in.</p>
<div id="paypal-buttons"></div>
<p id="confirm-error" class="tiny" style="color:#ff8a8a" hidden></p>
</div>

<script>window.VERITAS_PAYPAL_CLIENT_ID = "{{paypal_client_id}}";</script>
<script src="/static/js/order.js"></script>

<p>Questions? See the <a href="/faq.html">FAQ</a> or <a href="/contact.html">contact us</a>.</p>
