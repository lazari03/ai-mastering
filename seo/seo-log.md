# SEO log — Auralith Forge

Running state for the daily SEO run. Read this first; newest run on top.

## Content plan checklist

Feature posts (priority until complete):
- [x] Loudness / LUFS for Spotify, Apple Music, YouTube → `/blog/lufs-for-spotify-apple-music-youtube` (2026-10-23)
- [x] Stem separation → `/blog/stem-mastering-with-ai-stem-separation` (2026-11-05; verified engine = Demucs `--two-stems vocals`, htdemucs_ft→htdemucs; only vocals/accompaniment)
- [ ] Multiband compression
- [ ] Mid/side EQ
- [ ] Genre presets — Radio Glue / Stream Safe / Club Ready. **Open question:** these names do not appear anywhere in the frontend code (2026-10-23 grep); UI exposes Delivery targets (Genre best practice / Streaming -14 / Apple Music -16 / Loud club-DJ) and genre styles. Confirm with Fonsi before writing posts under those names.
- [ ] Prompt-based mastering (describe the sound) — verify the UI feature name before writing
Tutorials:
- [x] Mixing vs mastering → `/blog/mixing-vs-mastering-what-to-fix-before-release` (2026-11-04, outside this routine)
- [ ] How to master a track for Spotify (careful: overlaps LUFS post — make it a step-by-step HowTo, link to LUFS post)
- [ ] What LUFS should I master to (covered by LUFS post + `/mastering-loudness-targets` — likely skip, extend instead)
- [x] How to prepare a mix for mastering → `/blog/how-to-prepare-a-mix-for-mastering` (2026-11-04, outside this routine)
- [ ] How to master vocal-heavy tracks
- [ ] Genre guides (extend `/master/[genre]` rather than duplicate)
Comparison / alternatives (exist: `/vs/landr`, `/vs/emastered`, `/vs/bandlab`, `/vs/waves`):
- [ ] `/vs/cloudbounce`, `/vs/masterchannel`, `/vs/ozone` (Ozone/iZotope online)

## Open issues (from audits)

- Meta descriptions too long (truncate in SERP, ~155–160 chars): `/` 229, `/mastering-loudness-targets` 240, `/ai-mastering-online` 209, `/chord-progression-finder` 207, `/song-key-finder` 187. Front-load the offer; trim.
- Blog posts emit `og:type=website`, should be `article` + `article:published_time` (`buildMetadata` in `src/lib/seo.js` has no type param).
- Blog post titles get " — Auralith Forge" appended; "Automated Fader Rides vs. Manual Mixing…" renders at 94 chars.
- `/vs/*` pages have only FAQPage + BreadcrumbList JSON-LD (no SoftwareApplication on the decision-stage page).
- `/tools` and `/blog` have only BreadcrumbList (could add ItemList/CollectionPage).
- Blog post template has no FAQ/HowTo support — needed for tutorial series (HowTo).
- `npm test` script doesn't exist; run `node --test tests/*.mjs` (bare `node --test tests/` fails to resolve). Build needs `NEXT_PUBLIC_SITE_URL` set.
- Mobile Lighthouse (local lab run, 2026-11-05) on `/`: perf 0.67, LCP 3.3 s, **TBT 1,180 ms**, CLS 0 — main-thread JS is the bottleneck. Candidate for the performance audit day.
- Blog template emits only Article + BreadcrumbList; posts with a "Quick answers" section (stem post) could carry FAQPage — needs a `faq` field in the template.
- `/vs/waves` is not in the footer (4 inlinks vs 31 for the other /vs pages).
- Pushing from the scheduled routine is blocked: no add_repo tool in the session and the git proxy doesn't authorize lazari03/ai-mastering. 2026-11-05 commits exist only as a patch (see run entry).
- Live site 403s non-browser user agents (Python urllib) — Cloudflare bot rule. curl works. Check that it isn't blocking legitimate crawlers (Googlebot/Bingbot/AI bots allowed in robots.txt).

## Backlink opportunities (outreach drafts for Fonsi — nothing sent)

See per-run entries below.

---

## 2026-11-05 — Audit: internal linking + orphan check

**Push blocked:** the session had no `add_repo` tool and the git proxy refused lazari03/ai-mastering (not in authorized repos). Work was done in a public clone; two commits were built and verified but **not pushed** — `seo/2026-11-05.patch` holds them (`git am seo/2026-11-05.patch` from main @ 72952ec).

**Audit (live site, all 32 sitemap URLs fetched, link graph built):** all 200, 0.3–0.9 s. No broken internal links; nothing linked that's missing from the sitemap except `/app`, `/login` (expected). Main finding: **guides are siloed** — every blog post is linked only from `/blog` and the other posts (6–10 inlinks each vs 31 for nav/footer pages). No landing, tool or comparison page linked to any guide; `/lufs-meter` didn't link to the LUFS guide. Home gallery only shows the 3 captioned posts. Also: `/blog/what-ai-mastering-actually-automates` claimed the engine splits "vocals, drums, bass" — wrong (two-stem only); corrected. All blog posts still `og:type=website`; meta descriptions on `/` (229), `/mastering-loudness-targets` (240), `/ai-mastering-online` (209), `/chord-progression-finder` (207) unchanged.

**Fix (commit 71aeeee, not pushed):** `PAGE_GUIDES` + `guideLinksFor()` in `frontend/src/lib/internalLinks.js` (slugs validated at import), rendered as "Mastering guides" on `/ai-mastering-online` (5 guides), "Read more" on `/lufs-meter` (LUFS guide + export checklist), "Before you choose a tool" on every `/vs/*` page (3 guides). Build, lint and `node --test tests/*.mjs` pass.

**Article (commit 8acabcc, not pushed):** "Stem Mastering with AI Stem Separation: A Vocal-First Guide" → `/blog/stem-mastering-with-ai-stem-separation` (~1,650 words, 8 H2s, Article + BreadcrumbList via template). Primary: stem mastering; secondary: stem separation mastering, stem mastering vs stereo mastering, ai stem separation, demucs mastering. New file `frontend/src/content/featurePosts.js` (pulls plan/price from lib/pricing + lib/product). Facts from code: presence band 1–4 kHz, section lift = half the gap capped +1 dB (tolerance 1.5 dB), accompaniment presence cut ≤1.2 dB, moves <0.25 dB dropped, no section moves when sections unreliable, no reverb added. Demucs SDR ~9.0 dB MUSDB-HQ from PyPI demucs 4.0.0. Links out: mixing-vs-mastering, prepare-a-mix, inside-the-engine, /ai-mastering-online, /master/pop, /master/hiphop, /lufs-meter, LUFS guide, signup, /pricing. Links in: what-ai-mastering-actually-automates (inline), /ai-mastering-online, /vs/*, /blog, More guides, sitemap. Sitemap `CONTENT_LAST_MODIFIED` → 2026-11-05.

**Competitor insight ("stem mastering"):** SERP = iZotope ("Stem mastering: How and when to use stems…", ~1,700 w, no FAQ), eMastered ("Stem Mastering: The Definitive Guide for Beginners", ~1,800 w, 10-question FAQ, 2021), Sage Audio (stereo vs stem — title tag is just "Sage Audio", a gap), Abbey Road (short interview: "not a mix fixing service"), Boris FX/Imagineer, Mastering The Mix. All assume you *have* stems; none cover mastering from a stereo file via separation — our angle. "AI stem separation" SERP is splitters (LANDR Stems, LALAL.AI, Music.ai, StemSplit) selling stems, not mastering.

**Metrics:** Search Console / GA not reachable from this session. PageSpeed API quota exhausted (429). Local Lighthouse mobile lab run on `/`: perf 0.67, FCP 1.4 s, LCP 3.3 s, TBT 1,180 ms, CLS 0, SI 3.5 s (cloud container, simulated throttling — lab only, not field data). No SERP positions observed for auralithforge.app in today's searches.

**Backlink opportunities added (drafts for Fonsi — nothing sent):**
1. **guideflow.com/blog/audio-mastering-software** (Aug 2026; lists WaveLab, LANDR, Mixea, Waves, Ozone…). Page states: "Want your tool listed … Reach us at content@guideflow.com — include a product link and one line on who it's for." Draft: "Subject: Tool suggestion for your audio mastering software guide — Hi Guideflow team, for your audio mastering software list: Auralith Forge — https://auralithforge.app — an online mastering engine for independent musicians and producers who want to see what was changed: it measures loudness (ITU-R BS.1770), spectrum and dynamics first, offers Streaming −14 / Apple Music −16 LUFS targets, optional vocal stem separation and a codec preview. Free tier: 3 full masters, no card. — Fonsi"
2. **pluginerds.com/11-best-websites-online-mixing/** (May 2026, author Viliam; lists LANDR, eMastered, RoEx, Masterchannel, Cryo Mix, Waves, SoundBoost, Mixea…). Invites suggestions via pluginerds.com/contact/ (paid placement also exists at /advertise — not recommended). Draft: "Hi Viliam — your 2026 list of online mixing & mastering sites is one of the better ones because it separates marketplaces from automated tools. One you might add next update: Auralith Forge (auralithforge.app), an online mastering engine that analyzes the mix before processing, can separate the vocal from the accompaniment to fix a buried chorus vocal from a stereo file, and previews MP3/AAC/Opus encoding before download. 3 masters free, so it's quick to test. Happy to answer questions. — Fonsi"
3. **musicianwave.com/best-online-mastering-services/** (title says 2026 but last updated Apr 2023; author Brian Clark; lists Abbey Road, Metropolis, LANDR, BandLab, CloudBounce). Contact: contact@musicianwave.com. Draft: "Hi Brian — I noticed your best online mastering services article still carries an April 2023 update date while the title says 2026. If you refresh it, Auralith Forge (auralithforge.app) might be worth testing alongside LANDR and BandLab: automated online mastering with explicit LUFS delivery targets, optional vocal stem separation and a free tier (3 full masters, no card). Glad to give you extended access for testing. — Fonsi"
(Skipped lalal.ai's roundup: no contact path, and they sell stem separation.)

**Tomorrow:** audit focus = conversion paths/CTAs (signup CTA placement on guides, /pricing → signup, blog post end CTAs). Fix candidates: trim the over-long meta descriptions, or og:type=article for posts. Next article: multiband compression feature post. If push is still blocked, Fonsi needs to apply `seo/2026-11-05.patch` and authorize the repo for the routine.

---

## 2026-10-23 — Audit: structured data + on-page metadata across all 29 sitemap URLs

**Audit (live site, all sitemap URLs fetched):** every page has 1 H1, canonical, OG (9 tags) + Twitter (4), no images missing alt. robots.txt/sitemap.xml 200, 29 URLs. JSON-LD present everywhere (home: WebSite/Organization/SoftwareApplication/FAQPage; tools: SoftwareApplication or Service + FAQPage + BreadcrumbList; blog: Article + BreadcrumbList). Issues found → "Open issues" above. Highest-impact: `/vs/*` titles were "Auralith Forge vs LANDR | Auralith Forge" — brand duplicated, and missing the query people actually type ("LANDR alternative"); these are the decision-stage pages closest to signup.

**Fix shipped:** `seoTitle` per comparison page, lead-with-query, no duplicated brand (`frontend/src/content/comparisonPages.js`, `frontend/src/app/vs/[competitor]/page.js`):
- `/vs/landr` → "LANDR Alternative for Online Mastering — Auralith Forge vs LANDR"
- `/vs/emastered` → "eMastered Alternative — Auralith Forge vs eMastered Compared"
- `/vs/bandlab` → "BandLab Mastering Alternative — BandLab vs Auralith Forge"
- `/vs/waves` → "Waves Online Mastering Alternative — Waves vs Auralith Forge"
- LANDR/eMastered meta descriptions rewritten to open with "Looking for a … alternative?" and end with "3 masters free" (≤160 chars). H1s unchanged.

**Article:** "LUFS for Spotify, Apple Music & YouTube: What to Master To" → `/blog/lufs-for-spotify-apple-music-youtube` (~1,770 words, 10 H2 sections, Article + BreadcrumbList JSON-LD via template). Primary: lufs for spotify. Facts sourced from Spotify's artist support page (-14 LUFS ITU 1770; Loud -11 / Quiet -19; -1 dBTP, -2 dBTP if louder than -14; 1 dB headroom rule for positive gain; album normalization; web player not normalized), YouTube "doesn't turn up" (productionadvice.co.uk), other platforms hedged as "widely reported". Internal links out: `/mastering-loudness-targets`, `/master/hiphop`, `/master/edm`, `/lufs-meter`, `/blog/what-happens-inside-an-ai-mastering-engine`, `/ai-mastering-online`, signup. Links in: `/mastering-loudness-targets` (inline + "Also useful"), `/blog` index, "More guides" on every post, sitemap (auto from POSTS). HomeClient gallery now filters to posts with `captionKey` so new posts don't break the 3-image gallery.

**Competitor insight:** "LANDR alternative" SERP is aggregators (alternativeto.net, nemovideo) + reviews (xlr8r, musosoup eMastered-vs-LANDR); titles lead with "LANDR Alternatives". "What LUFS for Spotify" SERP: RoEx ("What LUFS Should I Master At? (Depends on Your Genre)"), Waves, musicguymixing, Music Gateway, RecordJet FAQ — winning pattern is a question title, a short-answer opener, per-platform values, a true-peak section and an FAQ. RoEx argues genre-dependent targets (same angle as ours). Roundups listing competitors (fast.io, violetrecording) feature LANDR, eMastered, Masterchannel, Ozone 12, RoEx Automix, CloudBounce, Cryo Mix, BandLab — Auralith absent from all.

**Metrics:** Search Console / GA not reachable (only connector available is Meta Ads). PageSpeed Insights API quota exhausted (shared unauthenticated quota) — no CWV numbers today. Live response times via curl: 0.4–1.1 s total for key pages. No ranking positions observed for auralithforge.app in today's SERPs (the domain did not appear in the top results for "LANDR alternative" or "what LUFS for Spotify").

**Backlink opportunities added:**
1. **alternativeto.net/software/landr** — top result for "LANDR alternative". Submit Auralith Forge as an alternative to LANDR / eMastered (free account needed — Fonsi to do). Draft listing blurb: "Auralith Forge is an online mastering service built on adaptive DSP rather than a one-click 'AI' preset: it measures your mix (ITU-R BS.1770 loudness, spectrum, dynamics, stereo) and changes only what needs it. Delivery targets for Streaming (-14 LUFS), Apple Music (-16) or club, stem-aware vocal rebalancing, and a codec preview that shows what MP3/AAC/Opus encoding does to your master. 3 full masters free, no card."
2. **fast.io/resources/best-ai-mastering-tools-2026** (author Tom Langridge; contact via fast.io/contact) — 8-tool roundup, Auralith missing. Draft: "Hi Tom — enjoyed your 2026 AI mastering roundup. One tool you may want to test for the next update: Auralith Forge (auralithforge.app). It's DSP-based rather than a black-box model — it shows what it measured and changed, offers -14/-16 LUFS delivery targets and a codec preview of the MP3/AAC/Opus result. There's a free tier (3 full masters, no card) so it's quick to evaluate. Happy to answer any technical questions. — Fonsi"
3. **violetrecording.com/emastered-alternatives** (updated 2026-08-06; contact form violetrecording.com/contact) — lists LANDR, Ozone, CloudBounce, BandLab, Masterchannel. Draft: "Hi Violet Recording team — your eMastered alternatives piece is one of the clearest I've read. If you update it, Auralith Forge might be worth a look: an online mastering engine with stem-aware vocal/accompaniment rebalancing, explicit Streaming/Apple Music loudness targets, and a codec preview. Free to try (3 masters, no card). Glad to set you up with extended access for testing. — Fonsi, Auralith Forge"
4. **musosoup.com/write-for-us-music** — accepts music guest posts; already ranks for "eMastered vs LANDR". Pitch: "Hi Musosoup — I'd like to pitch a practical guest piece for independent artists: 'Why your master sounds quieter on Spotify (and how to fix it)' — normalization at -14 LUFS, the -1/-2 dBTP true-peak rule, and how to check a master with free tools. Vendor-neutral, ~1,200 words, with one author bio link. — Fonsi"
5. **Product Hunt** — free browser LUFS meters (LufsMaster, mastering.to) launched there and rank for "lufs meter". Launch `/lufs-meter` (no signup, in-browser) as a free tool. Tagline draft: "Free LUFS meter — integrated loudness, true peak & LRA in your browser, no upload." Fonsi to create the launch (requires account).

**Tomorrow:** audit focus = internal linking + orphan check (blog posts only reachable from /blog + home gallery; genre pages ↔ new post), fix candidate = og:type article for blog posts or the over-long meta descriptions on `/` and `/mastering-loudness-targets`. Next article: stem separation feature post (verify stems the engine actually outputs first).

---


## 2026-10-22 — Google Trends realignment

Source: Google Trends top + rising queries, worldwide, 2026-10-15 → 2026-10-22 (see `SEO_KEYWORD_MAP.md` demand table).

- `/` retitled to lead with **free online mastering** (the 98–100 interest cluster; homepage previously targeted "AI mastering software"). Description states the actual free offer (3 masters + unlimited 30s previews, no card). Hero eyebrow now "Free Online Mastering · Adaptive DSP Engine" (EN + SQ). Root layout default title matched.
- `/ai-mastering-online` retitled "Free AI Mastering Online — Online Mastering Service"; keywords cover rising "ai mastering"/"mastering ai"/"ai mastering free" and "online mastering service(s)". Two FAQ entries (+ FAQPage JSON-LD) added for "online mastering service" and "best online mastering service".
- New `/vs/bandlab` (bandlab mastering, +50%) and `/vs/waves` (waves online mastering). Same no-unverifiable-competitor-claims rule as existing comparisons. BandLab linked from footer; both auto-listed on `/ai-mastering-online` and in sitemap.
- Sitemap `CONTENT_LAST_MODIFIED` bumped to 2026-10-22.

Next: `/blog/mixing-vs-mastering` (22-interest "mixing and mastering" gap — HomeClient's gallery maps POSTS 1:1, so slice it before adding a 4th post); localized ES/IT page for "mastering online gratis".
