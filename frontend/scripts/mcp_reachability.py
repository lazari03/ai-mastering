"""Check that the ChatGPT/MCP integration is reachable from outside.

    python3 frontend/scripts/mcp_reachability.py [summary.md]

Cloudflare bot protection (Bot Fight Mode, "Block AI bots", a WAF or
Turnstile challenge) answers non-browser clients with a 403 or an HTML
challenge page. ChatGPT's servers can't solve those, so the app silently
stops working. Each endpoint below must answer with JSON and the expected
status; anything else fails the run.
"""

from __future__ import annotations

import sys
import urllib.error
import urllib.request

UA = "AuralithMCPCheck/1.0 (+https://auralithforge.app)"
CHECKS = [
    # (url, expected status, why)
    ("https://auralithforge.app/.well-known/oauth-protected-resource/mcp", 200, "protected-resource metadata"),
    ("https://api.auralithforge.app/.well-known/oauth-authorization-server", 200, "OAuth server metadata"),
    ("https://auralithforge.app/mcp", 401, "MCP endpoint (401 = asks ChatGPT for its token)"),
]


def probe(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return e.code, (e.headers.get("Content-Type", "") if e.headers else "")
    except Exception as e:
        return 0, type(e).__name__


def main() -> int:
    lines, failed = ["# ChatGPT / MCP reachability", ""], False
    for url, want, why in CHECKS:
        status, ctype = probe(url)
        ok = status == want and "json" in ctype
        failed |= not ok
        hint = "" if ok else " — likely a Cloudflare bot/WAF challenge" if status in (403, 503) or "html" in ctype else ""
        lines.append(f"- {'OK  ' if ok else 'FAIL'} {why}: HTTP {status} {ctype or '-'} (want {want} JSON){hint}")
    text = "\n".join(lines) + "\n"
    print(text)
    if len(sys.argv) > 1:
        with open(sys.argv[1], "a") as f:
            f.write(text)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
