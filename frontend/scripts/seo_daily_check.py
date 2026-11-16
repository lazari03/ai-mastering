"""Validate a seo_inventory.py crawl and write a report.

    python3 scripts/seo_daily_check.py seo-daily.json seo-report.json [summary.md]

Exit status 1 when any *error* is found; warnings are reported but don't
fail the run. seo-report.json is the machine-readable result the scheduled
daily audit reads (from the workflow's artifact) instead of re-crawling the
site in a browser.
"""

from __future__ import annotations

import json
import sys
from urllib.parse import urlparse

SITE = "https://auralithforge.app"
# Google truncates descriptions around 155-160 characters (~920px) and
# titles around 60-70 (~600px). Over-length is a warning, not a failure.
DESCRIPTION_MAX = 160
TITLE_MAX = 70


def check(inventory: dict, site: str = SITE) -> dict:
    pages = inventory["pages"]
    resources = inventory.get("resources", {"links": {}, "images": {}})
    errors: list[str] = []
    warnings: list[str] = []

    indexed = {path: p for path, p in pages.items() if p.get("in_sitemap")}
    for path, p in sorted(indexed.items()):
        if p.get("status") != 200:
            errors.append(f"{path}: HTTP {p.get('status')}")
        if not p.get("title"):
            errors.append(f"{path}: missing title")
        elif len(p["title"]) > TITLE_MAX:
            warnings.append(f"{path}: title {len(p['title'])} chars (> {TITLE_MAX})")
        desc = p.get("description")
        if not desc:
            errors.append(f"{path}: missing meta description")
        elif len(desc) > DESCRIPTION_MAX:
            warnings.append(f"{path}: meta description {len(desc)} chars (> {DESCRIPTION_MAX})")
        if not p.get("h1"):
            errors.append(f"{path}: missing H1")
        canonical = p.get("canonical") or ""
        if canonical.rstrip("/") != f"{site}{path}".rstrip("/"):
            errors.append(f"{path}: canonical mismatch ({canonical or 'none'})")
        if "noindex" in (p.get("robots") or "").lower():
            errors.append(f"{path}: sitemap URL is marked noindex")
        for link in p.get("internal_links", []):
            if link["href"].startswith("/cdn-cgi/"):
                errors.append(f"{path}: crawler sees Cloudflare utility link {link['href']} (email obfuscation?)")
            elif link["href"].startswith("/blog/") and link["href"] not in pages:
                errors.append(f"{path}: broken or unsitemapped article link {link['href']}")

    blog = {path: p for path, p in indexed.items() if path.startswith("/blog/")}
    if not blog:
        errors.append("No blog articles found in live sitemap")
    for path, p in sorted(blog.items()):
        if not p.get("og_title"):
            errors.append(f"{path}: missing Open Graph title")
        if not p.get("og_image"):
            errors.append(f"{path}: missing social preview image")
        if not p.get("twitter_image"):
            errors.append(f"{path}: missing Twitter preview image")
        if p.get("og_type") != "article":
            errors.append(f"{path}: og:type is {p.get('og_type')!r}, expected 'article'")
        if p.get("has_photo_credit") is False:
            errors.append(f"{path}: hero photo has no photographer credit")

    # Actual responses, not just presence of a URL in the HTML.
    for href, r in sorted(resources.get("links", {}).items()):
        if href.startswith("/cdn-cgi/"):
            continue  # reported per page above
        if r["status"] >= 400 or r["status"] == 0:
            sources = sorted(src for src, p in indexed.items() if any(l["href"] == href for l in p.get("internal_links", [])))
            if not sources:
                continue  # only linked from non-indexed routes (e.g. the 404 probe)
            errors.append(f"broken internal link {href} (HTTP {r['status']}) from {', '.join(sources[:5])}")
    for url, r in sorted(resources.get("images", {}).items()):
        if r["status"] != 200:
            errors.append(f"image {short(url)} returned HTTP {r['status']}")
        elif not r.get("content_type", "").startswith("image/"):
            errors.append(f"image {short(url)} served as {r.get('content_type') or 'unknown type'}")

    return {
        "routes_crawled": len(pages),
        "indexed_routes": len(indexed),
        "links_checked": len(resources.get("links", {})),
        "images_checked": len(resources.get("images", {})),
        "errors": errors,
        "warnings": warnings,
        "ok": not errors,
    }


def short(url: str) -> str:
    u = urlparse(url)
    return (u.path + ("?" + u.query if u.query else ""))[:120]


def summary_md(report: dict) -> str:
    lines = [
        "# Daily SEO audit",
        f"Crawled {report['routes_crawled']} routes ({report['indexed_routes']} indexed), "
        f"checked {report['links_checked']} link targets and {report['images_checked']} images.",
        f"Errors: {len(report['errors'])} · Warnings: {len(report['warnings'])}",
        "",
    ]
    if report["errors"]:
        lines += ["## Errors", *[f"- {e}" for e in report["errors"]], ""]
    if report["warnings"]:
        lines += ["## Warnings", *[f"- {w}" for w in report["warnings"]], ""]
    if not report["errors"] and not report["warnings"]:
        lines.append("No SEO issues detected.")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    inventory = json.load(open(sys.argv[1]))
    report = check(inventory)
    json.dump(report, open(sys.argv[2], "w"), indent=1)
    md = summary_md(report)
    if len(sys.argv) > 3:
        with open(sys.argv[3], "a") as f:
            f.write(md)
    print(md)
    sys.exit(0 if report["ok"] else 1)
