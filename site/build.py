#!/usr/bin/env python3
"""Veritas Review static site generator.

Builds the site from Markdown content into plain HTML. No dependencies.

Usage:
    python site/build.py            # builds into site/public/
    python site/build.py --serve     # builds and serves on localhost:8000

Content:
    site/content/pages/*.md   -> public/<name>.html   (index.md -> public/index.html)
    site/content/posts/*.md   -> public/blog/<slug>/index.html

A new blog post is just a Markdown file. The review engine's blurb
publisher (BookBot repo, scripts/publish_review_blurb.py) writes one
automatically whenever a finished review is sent to a client.
"""
import argparse
import html
import json
import os
import re
import shutil
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(HERE, "content")
TEMPLATES = os.path.join(HERE, "templates")
STATIC = os.path.join(HERE, "static")
PUBLIC = os.path.join(HERE, "public")


def load_config():
    with open(os.path.join(HERE, "config.json"), encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- markdown

def _inline(text):
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    return text


def render_markdown(md):
    """Small Markdown renderer: headings, lists, quotes, hr, raw HTML blocks."""
    out = []
    para = []
    list_kind = None
    quote = []

    def flush_para():
        if para:
            out.append("<p>" + _inline(" ".join(para)) + "</p>")
            para.clear()

    def flush_list():
        nonlocal list_kind
        if list_kind:
            out.append("</ul>" if list_kind == "ul" else "</ol>")
            list_kind = None

    def flush_quote():
        if quote:
            out.append("<blockquote>" + _inline(" ".join(quote)) + "</blockquote>")
            quote.clear()

    for raw in md.split("\n"):
        line = raw.rstrip()
        stripped = line.strip()

        if not stripped:
            flush_para()
            flush_list()
            flush_quote()
            continue
        if stripped == "---":
            flush_para()
            flush_list()
            flush_quote()
            out.append("<hr>")
            continue
        if stripped.startswith("<"):
            flush_para()
            flush_list()
            flush_quote()
            out.append(line)
            continue
        m = re.match(r"^(#{1,3})\s+(.*)$", stripped)
        if m:
            flush_para()
            flush_list()
            flush_quote()
            level = len(m.group(1))
            out.append(f"<h{level}>" + _inline(m.group(2)) + f"</h{level}>")
            continue
        if stripped.startswith("> "):
            flush_para()
            flush_list()
            quote.append(stripped[2:])
            continue
        m = re.match(r"^[-*]\s+(.*)$", stripped)
        if m:
            flush_para()
            flush_quote()
            if list_kind != "ul":
                flush_list()
                out.append("<ul>")
                list_kind = "ul"
            out.append("<li>" + _inline(m.group(1)) + "</li>")
            continue
        m = re.match(r"^\d+\.\s+(.*)$", stripped)
        if m:
            flush_para()
            flush_quote()
            if list_kind != "ol":
                flush_list()
                out.append("<ol>")
                list_kind = "ol"
            out.append("<li>" + _inline(m.group(1)) + "</li>")
            continue
        flush_list()
        flush_quote()
        para.append(stripped)

    flush_para()
    flush_list()
    flush_quote()
    return "\n".join(out)


def parse_frontmatter(text):
    meta = {}
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            for line in text[3:end].strip().split("\n"):
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip().strip('"')
            text = text[end + 4:].lstrip("\n")
    return meta, text


# ---------------------------------------------------------------- templates

def load_template(name):
    with open(os.path.join(TEMPLATES, name), encoding="utf-8") as f:
        return f.read()


def adsense_head(cfg):
    client = cfg.get("adsense_client_id", "").strip()
    if not client:
        return "<!-- AdSense: set adsense_client_id in site/config.json to enable ads -->"
    return (
        f'<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
        f'?client={client}" crossorigin="anonymous"></script>'
    )


def ad_slot(cfg, name):
    client = cfg.get("adsense_client_id", "").strip()
    if not client:
        return ""
    return (
        f'<div class="ad-slot">\n'
        f'<ins class="adsbygoogle" style="display:block" data-ad-client="{client}"\n'
        f'     data-ad-slot="{name}" data-ad-format="auto" data-full-width-responsive="true"></ins>\n'
        f'<script>(adsbygoogle = window.adsbygoogle || []).push({{}});</script>\n'
        f"</div>"
    )


def order_button(cfg):
    link = cfg.get("payment_url", "").strip()
    label = cfg.get("payment_label", "Pay online").strip() or "Pay online"
    price = html.escape(cfg.get("price", "$14.99"))
    if link:
        return (
            f'<p><a class="btn" href="{html.escape(link)}">'
            f"{html.escape(label)}, {price}</a></p>\n"
            f'<p class="tiny muted">Secure checkout. We never see or store '
            f"your payment details.</p>"
        )
    return (
        f'<p><a class="btn" href="mailto:{html.escape(cfg["contact_email"])}'
        f'?subject=Review%20order">Order by email</a></p>\n'
        f'<p class="tiny muted">Online checkout opens at launch. '
        f"Email us to place your order today.</p>"
    )


def nav_links(cfg):
    return [
        ("Home", "/"),
        ("Order", "/order.html"),
        ("Blog", "/blog/"),
        ("FAQ", "/faq.html"),
        ("About", "/about.html"),
    ]


def render_page(cfg, title, description, body_html, path, prefix=""):
    tpl = load_template("base.html")
    nav = "".join(
        f'<a href="{href}">{label}</a>' for label, href in nav_links(cfg)
    )
    page = tpl
    page = page.replace("{{title}}", html.escape(title))
    page = page.replace("{{description}}", html.escape(description))
    page = page.replace("{{brand}}", html.escape(cfg["brand"]))
    page = page.replace("{{nav}}", nav)
    page = page.replace("{{content}}", body_html)
    page = page.replace("{{year}}", str(date.today().year))
    page = page.replace("{{contact_email}}", html.escape(cfg["contact_email"]))
    page = page.replace("{{adsense_head}}", adsense_head(cfg))

    def slot(m):
        return ad_slot(cfg, m.group(1))

    page = re.sub(r"\{\{ad_slot:([\w-]+)\}\}", slot, page)
    page = page.replace("{{order_button}}", order_button(cfg))
    # Make the site work from a subpath (e.g. GitHub Pages project pages).
    # With prefix="" (domain root) this is a no-op.
    if prefix:
        page = page.replace('href="/', f'href="{prefix}/')
        page = page.replace('src="/', f'src="{prefix}/')
    return page


# ---------------------------------------------------------------- build

def build(prefix=""):
    cfg = load_config()
    if os.path.exists(PUBLIC):
        shutil.rmtree(PUBLIC)
    os.makedirs(PUBLIC)
    shutil.copytree(STATIC, os.path.join(PUBLIC, "static"))

    # Pages
    pages_dir = os.path.join(CONTENT, "pages")
    for fname in sorted(os.listdir(pages_dir)):
        if not fname.endswith(".md"):
            continue
        with open(os.path.join(pages_dir, fname), encoding="utf-8") as f:
            meta, body = parse_frontmatter(f.read())
        name = fname[:-3]
        out_name = "index.html" if name == "index" else f"{name}.html"
        body_html = render_markdown(body)
        title = meta.get("title", cfg["brand"])
        desc = meta.get("description", cfg["tagline"])
        html_out = render_page(cfg, title, desc, body_html, out_name, prefix)
        with open(os.path.join(PUBLIC, out_name), "w", encoding="utf-8") as f:
            f.write(html_out)

    # Posts
    posts_dir = os.path.join(CONTENT, "posts")
    posts = []
    for fname in sorted(os.listdir(posts_dir), reverse=True):
        if not fname.endswith(".md"):
            continue
        with open(os.path.join(posts_dir, fname), encoding="utf-8") as f:
            meta, body = parse_frontmatter(f.read())
        slug = fname[:-3]
        meta.setdefault("date", slug[:10])
        meta.setdefault("title", slug[10:].replace("-", " ").title())
        body_html = render_markdown(body)
        post_dir = os.path.join(PUBLIC, "blog", slug)
        os.makedirs(post_dir)
        article = (
            f'<article class="post">\n'
            f'<p class="post-date">{html.escape(meta["date"])}</p>\n'
            f"<h1>{html.escape(meta['title'])}</h1>\n"
            f"{{{{ad_slot:post-mid}}}}\n"
            f"{body_html}\n"
            f"{{{{ad_slot:post-bottom}}}}\n"
            f'<p class="post-more"><a href="/blog/">&larr; All posts</a></p>\n'
            f"</article>"
        )
        desc = meta.get("description", cfg["tagline"])
        html_out = render_page(cfg, meta["title"], desc, article, f"blog/{slug}/", prefix)
        with open(os.path.join(post_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(html_out)
        posts.append({"slug": slug, "title": meta["title"],
                      "date": meta["date"], "description": desc})

    # Blog index
    items = []
    for p in posts:
        items.append(
            f'<article class="post-card">\n'
            f'<p class="post-date">{html.escape(p["date"])}</p>\n'
            f'<h2><a href="/blog/{p["slug"]}/">{html.escape(p["title"])}</a></h2>\n'
            f"<p>{html.escape(p['description'])}</p>\n"
            f'<p><a href="/blog/{p["slug"]}/">Read more &rarr;</a></p>\n'
            f"</article>"
        )
    blog_dir = os.path.join(PUBLIC, "blog")
    os.makedirs(blog_dir, exist_ok=True)
    blog_body = (
        '<div class="page-head"><h1>Blog</h1>\n'
        "<p>Notes on honest reviewing, plus a short blurb for every review "
        "we deliver (with the author's permission).</p></div>\n"
        + "{{ad_slot:blog-top}}\n"
        + "\n".join(items)
    )
    with open(os.path.join(blog_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(render_page(cfg, "Blog", "Notes from Veritas Review.", blog_body, "blog/", prefix))

    # Latest-posts snippet for the home page
    latest = "".join(
        f'<article class="post-card">\n'
        f'<p class="post-date">{html.escape(p["date"])}</p>\n'
        f'<h3><a href="/blog/{p["slug"]}/">{html.escape(p["title"])}</a></h3>\n'
        f"<p>{html.escape(p['description'])}</p>\n"
        f"</article>"
        for p in posts[:3]
    )
    for fname in ("index.html",):
        path = os.path.join(PUBLIC, fname)
        with open(path, encoding="utf-8") as f:
            content = f.read()
        content = content.replace("{{latest_posts}}", latest)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

    print(f"Built {len(posts)} posts into {PUBLIC}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", default="", help="subpath prefix, e.g. /veritas-review-site")
    ap.add_argument("--serve", action="store_true")
    ns, _ = ap.parse_known_args()
    build(ns.prefix)
    if "--serve" in sys.argv:
        import http.server
        import functools

        handler = functools.partial(
            http.server.SimpleHTTPRequestHandler, directory=PUBLIC
        )
        print("Serving at http://localhost:8000")
        http.server.ThreadingHTTPServer(("127.0.0.1", 8000), handler).serve_forever()
