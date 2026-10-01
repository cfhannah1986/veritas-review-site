<!-- DRAFT - DO NOT BUILD YET. At launch: copy this file to site/content/pages/order.md
     (replacing the waitlist version), rebuild, push. Netlify will register the
     "manuscript-upload" form on that deploy. Requires: payment_url set in
     site/config.json, and Form Detection enabled in Netlify (Project
     configuration > Forms). -->
---
title: Order your manuscript review
description: Order a thorough, evidence-based manuscript review for $14.99. Upload your manuscript and receive your review as PDF and DOCX.
---

<div class="page-head">
<p class="eyebrow">Order</p>
<h1>Get your review, $14.99</h1>
<p class="lede">Three steps. Pay, upload your manuscript, and receive an honest review back in your inbox.</p>
</div>

<div class="order-steps">
<div class="order-step">
<h3>1. Pay securely</h3>
<p>Checkout is handled securely by PayPal. We never see or store your card details.</p>
{{order_button}}
</div>
<div class="order-step">
<h3>2. Upload your manuscript</h3>
<p>Use the upload form below after paying. Include your PayPal transaction ID so we can match your payment to your manuscript.</p>
</div>
<div class="order-step">
<h3>3. Receive your review</h3>
<p>Your manuscript goes through our structured review process, gets a final careful read, and arrives as PDF and DOCX.</p>
</div>
</div>

<h2>Upload your manuscript</h2>
<p>Accepted formats: DOCX, EPUB, TXT, or PDF. Maximum file size: 8 MB. If your file is larger, email it to <a href="mailto:{{contact_email}}">{{contact_email}}</a> with your transaction ID.</p>

<form name="manuscript-upload" method="POST" data-netlify="true" netlify-honeypot="bot-field" enctype="multipart/form-data" class="waitlist-form">
<input type="hidden" name="form-name" value="manuscript-upload" />
<input type="hidden" name="subject" value="New manuscript upload - Veritas Review" />
<p class="hidden"><label>Don't fill this out: <input name="bot-field" /></label></p>
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
<p><label>PayPal transaction ID<br /><input type="text" name="paypal_txn" required placeholder="e.g. 8RC12345AB6789012" /></label></p>
<p><label>Manuscript file (DOCX, EPUB, TXT, PDF, max 8 MB)<br /><input type="file" name="manuscript" accept=".docx,.epub,.txt,.pdf" required /></label></p>
<p><label>Anything we should know? (optional)<br /><input type="text" name="author_notes" /></label></p>
<p><button type="submit" class="btn">Upload manuscript</button></p>
</form>

<p>Questions? See the <a href="/faq.html">FAQ</a> or <a href="/contact.html">contact us</a>.</p>
