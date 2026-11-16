"""SEO inventory of the server-rendered site (what a crawler sees, no JS).

    python3 scripts/seo_inventory.py http://localhost:4100 out.json
    python3 scripts/seo_inventory.py --diff before.json after.json

For every route (the sitemap plus known non-sitemap routes) it records
status, title, meta description, canonical, robots, H1/H2/H3, JSON-LD
types, FAQ questions, visible word count, internal links (with anchor
text) and inbound internal links. --diff reports every change that could
affect search: URL set, title, description, canonical, robots, H1, lost
H2/H3 headings, lost FAQ questions, lost schema types, lost internal
links, and body copy shrinking by more than 15%.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

# Routes that exist but are intentionally not in the sitemap (noindex or
# authenticated). Audited so their robots state is recorded too.
EXTRA_ROUTES = ["/login", "/app", "/thank-you", "/share", "/newsletter", "/this-route-does-not-exist"]


# The site's edge rejects Python's default "Python-urllib" user agent with
# 403, so identify the crawler explicitly.
USER_AGENT = "AuralithSEOAudit/1.0 (+https://auralithforge.app)"


def probe(url: str) -> tuple[int, str]:
    """Status and content type of a URL without keeping the body (GET, since
    some image endpoints don't answer HEAD)."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read(1024)
            return r.status, r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", "") if e.headers else ""
    except Exception as e:  # DNS, TLS, timeout: report, don't abort the crawl
        return 0, type(e).__name__


def fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def text_of(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()


def jsonld_types(soup) -> tuple[list[str], list[str]]:
    types, faq = [], []
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
        for item in items:
            t = item.get("@type")
            types.extend(t if isinstance(t, list) else [t])
            if t == "FAQPage":
                faq.extend(q.get("name", "") for q in item.get("mainEntity", []))
    return sorted(set(filter(None, types))), faq


def audit_page(base: str, path: str) -> dict:
    status, html = fetch(base + path)
    soup = BeautifulSoup(html, "html.parser")
    meta = lambda name, attr="name": (soup.find("meta", attrs={attr: name}) or {}).get("content")
    canonical = soup.find("link", rel="canonical")
    for junk in soup(["script", "style", "noscript", "svg"]):
        junk.decompose()
    main = soup.find("main") or soup.body or soup
    links = []
    for a in soup.find_all("a", href=True):
        href = urljoin(base + path, a["href"])
        u = urlparse(href)
        if u.netloc in (urlparse(base).netloc, "auralithforge.app"):
            links.append({"href": u.path.rstrip("/") or "/", "text": text_of(a)[:80]})
    # Rendered <img> sources (next/image emits /_next/image?url=...), so the
    # audit checks what browsers and crawlers actually request.
    images = sorted({urljoin(base + path, i["src"]) for i in soup.find_all("img", src=True) if not i["src"].startswith("data:")})
    types, faq = jsonld_types(BeautifulSoup(html, "html.parser"))
    return {
        "path": path,
        "status": status,
        "title": (soup.title.string or "").strip() if soup.title else None,
        "description": meta("description"),
        "canonical": canonical.get("href") if canonical else None,
        "robots": meta("robots"),
        "og_title": meta("og:title", "property"),
        "og_image": meta("og:image", "property"),
        "og_type": meta("og:type", "property"),
        "twitter_image": meta("twitter:image"),
        "h1": [text_of(h) for h in soup.find_all("h1")],
        "h2": [text_of(h) for h in soup.find_all("h2")],
        "h3": [text_of(h) for h in soup.find_all("h3")],
        "jsonld_types": types,
        "faq_questions": faq,
        "main_word_count": len(text_of(main).split()),
        "internal_links": links,
        "images": images,
        # Stock-photo licence credit under a blog post's hero image.
        "has_photo_credit": any("pexels.com" in a["href"] for a in main.find_all("a", href=True)),
    }


def build(base: str) -> dict:
    status, sitemap = fetch(base + "/sitemap.xml")
    paths = [urlparse(u).path or "/" for u in re.findall(r"<loc>([^<]+)</loc>", sitemap)]
    if status != 200 or not paths:
        # Fail loudly: an unreadable sitemap would otherwise look like every
        # indexed page had vanished.
        sys.exit(f"sitemap fetch failed: HTTP {status}, {len(paths)} URLs")
    pages = {}
    for path in paths + [p for p in EXTRA_ROUTES if p not in paths]:
        pages[path] = audit_page(base, path)
        pages[path]["in_sitemap"] = path in paths
    for page in pages.values():
        page["inbound_from"] = sorted({src for src, p in pages.items() if src != page["path"] and any(l["href"] == page["path"] for l in p["internal_links"])})
    return {"base": base, "pages": pages, "resources": check_resources(base, pages)}


def check_resources(base: str, pages: dict) -> dict:
    """Actually request every internal link target and every image a page
    references (rendered <img>, og:image, twitter:image), once each."""
    links = {l["href"] for p in pages.values() for l in p["internal_links"]}
    images = set()
    for p in pages.values():
        images.update(p.get("images", []))
        for key in ("og_image", "twitter_image"):
            if p.get(key):
                images.add(urljoin(base + p["path"], p[key]))
    out = {"links": {}, "images": {}}
    for href in sorted(links):
        if href in pages:  # already fetched during the crawl
            out["links"][href] = {"status": pages[href]["status"], "content_type": "text/html"}
            continue
        status, ctype = probe(base + href)
        out["links"][href] = {"status": status, "content_type": ctype}
    for url in sorted(images):
        status, ctype = probe(url)
        out["images"][url] = {"status": status, "content_type": ctype}
    return out


def diff(before: dict, after: dict) -> list[str]:
    out = []
    b, a = before["pages"], after["pages"]
    for path in sorted(set(b) - set(a)):
        out.append(f"REMOVED ROUTE {path}")
    for path in sorted(set(a) - set(b)):
        out.append(f"NEW ROUTE {path}")
    for path in sorted(set(a) & set(b)):
        x, y = b[path], a[path]
        for key in ("status", "title", "description", "canonical", "robots", "h1", "in_sitemap"):
            if x.get(key) != y.get(key):
                out.append(f"{path}: {key} changed\n    before: {x.get(key)}\n    after:  {y.get(key)}")
        for key in ("h2", "h3", "faq_questions", "jsonld_types"):
            lost = [v for v in x.get(key, []) if v not in y.get(key, [])]
            if lost:
                out.append(f"{path}: lost {key}: {lost}")
        lost_links = sorted({l["href"] for l in x["internal_links"]} - {l["href"] for l in y["internal_links"]})
        if lost_links:
            out.append(f"{path}: lost internal links to {lost_links}")
        if x["main_word_count"] and y["main_word_count"] < 0.85 * x["main_word_count"]:
            out.append(f"{path}: main copy shrank {x['main_word_count']} -> {y['main_word_count']} words")
    return out


if __name__ == "__main__":
    if sys.argv[1] == "--diff":
        report = diff(json.load(open(sys.argv[2])), json.load(open(sys.argv[3])))
        print("\n".join(report) if report else "No SEO-relevant differences.")
    else:
        data = build(sys.argv[1].rstrip("/"))
        json.dump(data, open(sys.argv[2], "w"), indent=1)
        print(f"{len(data['pages'])} routes audited -> {sys.argv[2]}")
