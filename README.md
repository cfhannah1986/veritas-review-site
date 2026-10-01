# Veritas Review website

The public website for **Veritas Review**, a GlowPress service offering honest,
evidence-based manuscript reviews for indie authors.

- Live site: `https://theveritasreview.com` (or the free Netlify address until the domain is attached)
- Price: $14.99 launch pricing
- Zero dependencies. The generator is plain Python 3.

## Structure

```
site/
  build.py            # static site generator (no dependencies)
  config.json         # brand, pricing, links, AdSense ID, Stripe link
  templates/base.html # shared header/footer
  static/style.css    # all styling
  content/pages/*.md  # home, order, about, faq, contact, privacy, terms
  content/posts/*.md  # blog posts (one file = one post)
site/public/          # built output (what Netlify deploys)
```

## Building

```bash
python site/build.py            # builds into site/public/
python site/build.py --serve    # builds and serves on http://localhost:8000
```

## Publishing a blog post

Write a Markdown file in `site/content/posts/` named `YYYY-MM-DD-slug.md`
with frontmatter (`title`, `date`, `description`), rebuild, commit, push.
Netlify rebuilds automatically.

Review blurbs are generated automatically by the BookBot engine
(`scripts/publish_review_blurb.py` in the BookBot repo) whenever a finished
review is sent to a client. Blurbs are anonymized by default and only mention
a book with the author's explicit permission.

## Configuration (`site/config.json`)

| Key | Purpose |
|---|---|
| `stripe_payment_link` | Paste a Stripe Payment Link to enable one-click checkout on the order page. Until set, the order page shows an "order by email" button. |
| `adsense_client_id` | Paste your AdSense publisher ID (`ca-pub-...`) to enable the tasteful ad slots (home mid/bottom, blog top, in-article). Until set, slots render as nothing. |
| `contact_email` | Where order and contact emails go. |
| `price`, `max_words`, `turnaround` | Business facts shown across the site. |

## Deploying to Netlify (free)

1. Push this repo to GitHub.
2. In Netlify: **Add new site > Import an existing project**, pick the repo.
3. Build command `python site/build.py`, publish directory `site/public` (already in `netlify.toml`, so defaults work).
4. Your free address is `theveritasreview.netlify.app`. Attach `theveritasreview.com` later under **Domain settings** whenever you buy it. No rebuild needed.

## Notes

- The site never uses the name "BookBot" publicly. That name is internal only.
- No fake testimonials or sample reviews anywhere on the site. Blog blurbs only ever describe real delivered reviews, with permission.
