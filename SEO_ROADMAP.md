# SEO Roadmap — Auralith Forge

Product-led SEO: acquire musicians through problems they're already solving, funnel them through a free tool into a real master, and measure the whole thing through to paid conversion. Traffic alone is never the KPI — see `SEO_KEYWORD_MAP.md` for the per-page intent map that keeps new pages from cannibalizing existing ones.

## Current status — 2026-11-16

The sections below the line are the original plan; this block is what is true now.

**Live inventory (sitemap):** homepage, `/ai-mastering-online`, `/mastering-loudness-targets`, `/pricing`, `/tools`, `/lufs-meter`, `/chord-detector`, `/bpm-finder`, `/song-key-finder`, `/chord-progression-finder`, 8 × `/master/[genre]`, 4 × `/vs/[competitor]` (LANDR, eMastered, BandLab, Waves), 7 blog articles.

**Shipped since the original plan:** `/blog/lufs-for-spotify-apple-music-youtube` (covers both P1 Spotify/Apple Music posts), `/blog/mixing-vs-mastering-what-to-fix-before-release`, `/blog/how-to-prepare-a-mix-for-mastering`, `/blog/stem-mastering-with-ai-stem-separation`, `/vs/bandlab`, `/vs/waves`, `/pricing`.

**This sprint (conversion + technical SEO):**
- Studio article rewritten: Artist Profiles are adaptive (direction, re-analyzed per track); JSON import is the fixed, verbatim chain. Matches the homepage FAQ and in-app copy.
- Homepage demo loudness shows one value (−20.3 LUFS): `masteringDecisions.round1` now rounds half away from zero like `toFixed`.
- `/vs/*`: Auralith cost-per-master table generated from `lib/pricing.js` (monthly + annual, plus Single Master). Competitor prices deliberately not published — their pricing pages render client-side and third-party figures conflict; readers are told how to compute theirs.
- Blog: in-article CTA mid-article and after the takeaway (`cta_click`, `location: blog_mid|blog_end`, `article: <slug>`), Pexels photographer credit under every hero image, `dateModified` in Article JSON-LD, `og:type=article` (already in code; verify after deploy).
- Shorter meta descriptions on `/`, `/ai-mastering-online`, `/mastering-loudness-targets` (≤150 chars).
- Contact email rendered inside Cloudflare `<!--email_off-->` markers (`components/site/EmailLink.jsx`) so crawlers see `mailto:` instead of `/cdn-cgi/l/email-protection`.
- Daily SEO workflow now requests every internal link target and every image (rendered `<img>`, `og:image`, `twitter:image`) and fails on non-200 or non-image responses, `/cdn-cgi/` links, wrong `og:type`, or missing photo credit. Results go to the job summary and `seo-report.json` in the `seo-inventory` artifact — the scheduled daily SEO report should read that rather than crawl the site itself.

**Open items:**
- 3 hero photos (`34538640`, `30807699`, `32215665`) are credited as "Photo on Pexels" because the photographer name could not be verified from the build environment; add the names to `imageCredit.photographer` in `content/posts.js`.
- Turn off Cloudflare Scrape Shield → Email Address Obfuscation for the zone (the markers handle our own links; the setting would still rewrite any address added later without `EmailLink`).
- Over-length titles/descriptions on other pages are reported as warnings by the daily check; fix opportunistically, not as a project.
- Priority is conversion (visitors → first completed master → paid), not more articles. New posts only where Search Console shows demand an existing page doesn't serve.

---

## Audit summary (full detail in the delivery report)

**Already existed, working well:**
- `/chord-detector` — real standalone tool, free, anonymous-friendly, signup-gated result, `Master This Song` handoff into Studio.
- `/bpm-finder`, `/song-key-finder`, `/chord-progression-finder` — SEO landing pages (not standalone analyzers; they funnel to Chord Detector for the actual analysis).
- `/ai-mastering-online` — broad-intent mastering hub (priority 0.9 in sitemap).
- `/mastering-loudness-targets` — genuinely strong reference content: genre-by-genre LUFS targets, streaming normalization explanation, FAQ. This already answers most of what a `/blog/what-is-lufs` post would.
- `/master/[genre]` (8 pages), `/vs/[competitor]` (2 pages), `/blog` (3 posts) — all indexed, sitemap is a clean explicit allowlist (fails the build if it drifts from actual content).
- Analytics: first-party pipeline already tracks `free_tool_opened`/`free_tool_analysis_completed`/`free_tool_master_cta_clicked` with `source_tool` — no new events needed for the funnel this roadmap cares about.

**Did not exist (gaps closed in this pass):**
- `/lufs-meter` — did not exist. Now built as a real tool (not a landing page), reusing the *exact* DSP analysis (`/analyze`) Studio's live preview already runs — no new backend work.
- `/tools` hub — did not exist.
- SEO-specific admin reporting (organic-only funnel/revenue) — did not exist.

**Confirmed absent, deliberately NOT built this pass:** `/key-finder` (exists as `/song-key-finder`, no reason to duplicate), `/mastering`, `/ai-mastering`, `/master-a-song` — see "Intentionally not created" below.

## P0 — Implemented this pass

- [x] `/lufs-meter` — real tool (Integrated LUFS, True Peak, LRA), contextual (not bare-number) result copy, `Master This Track` CTA preserving the uploaded file into Studio, SEO metadata + `SoftwareApplication`/`FAQPage`/`BreadcrumbList` JSON-LD.
- [x] `/tools` free-tools hub, linked from `/lufs-meter`, `/chord-detector`, and every `ToolLandingPage.jsx` tool.
- [x] Reciprocal internal linking: `/mastering-loudness-targets` ↔ `/lufs-meter`, all tool pages ↔ `/lufs-meter`/`/tools`.
- [x] Sitemap updated (`/lufs-meter`, `/tools`), robots/admin isolation reconfirmed.
- [x] Admin `SEO` dashboard tab — organic-only visitor/master/customer/revenue rollup + per-landing-page breakdown.
- [x] Keyword map documented (`SEO_KEYWORD_MAP.md`) to prevent future cannibalization.

## P1 — Next opportunities (real, not yet built)

- **`/blog/lufs-for-spotify` and `/blog/lufs-for-apple-music`** — `/mastering-loudness-targets` covers the general streaming-normalization point but not platform-specific pages, which have their own search demand and a clean link target (`/lufs-meter`, `/mastering-loudness-targets`).
- **`/blog/mixing-vs-mastering`** and **`/blog/how-to-prepare-a-mix-for-mastering`** — genuine informational gap, high product relevance (readers are pre-mastering, i.e., about to need this product), doesn't yet exist in any form.
- **`/master-a-song`** — a task-oriented "how do I master a song with Auralith" page has different intent from `/ai-mastering-online`'s broad hub framing. Worth building once there's a clear content angle that doesn't just restate the homepage.
- **True Peak / Dynamic Range / Stereo Width as their own SEO entry points** — the data already comes back from the same `/analyze` call `/lufs-meter` uses (`true_peak_db`, `dynamic_range_db`, `stereo_width_estimate`, `stereo_correlation`). Don't build four separate tool *pages* around one endpoint; if search demand justifies it, add dedicated anchors/sections on `/lufs-meter` itself first (e.g. `/lufs-meter#true-peak`) before ever considering a standalone URL.
- **Custom date-range picker + segmentation filters on admin dashboard UI** — backend (`resolveRange`, filters in `getFunnel`/`listSessions`) already accepts them; only the UI controls are missing.

## P2 — Future, requires search-demand validation first

- `/mastering` and `/ai-mastering` as dedicated pages — **not created**. The homepage already *is* the product's primary mastering page (hero, pricing, before/after, features), and `/ai-mastering-online` already owns the broad "AI mastering" hub intent. Adding two more pages about the same general concept risks exactly the keyword cannibalization the brief warns against, for unclear incremental value. Revisit only if Search Console shows the homepage/`/ai-mastering-online` genuinely underperforming on a *specific* query cluster the existing pages don't address.
- Distribution-adjacent content (`WAV settings for distribution`, `true peak for streaming` as standalone posts) — real intersection with mastering per the brief's own framing, but should follow the LUFS/Spotify/Apple Music posts above, not precede them; those platform-specific pages already cover most of this ground.
- DAU/WAU/MAU and per-subscriber retention correlation in the admin dashboard (tracked as a known limit from the analytics build, not SEO-specific).
- Deterministic Insights/anomaly detection panel (e.g. "upload failure rate increased") — not built; would sit on top of the existing Errors/Overview data, no new tracking needed.

## Explicitly rejected (do not revisit without new evidence)

- Programmatic city/genre/instrument page generation ("Master Hip Hop Online," "Master Rock Online," etc.) — the brief explicitly rules this out, and the existing `/master/[genre]` pages already cover genre-specific mastering intent without duplicating it per-keyword-variation.
- Generic music-production content ("what is music production," "best DAWs," "history of recording studios") — high search volume, weak product relevance, weak commercial intent. Not worth the writing effort against this app's actual conversion goal.
