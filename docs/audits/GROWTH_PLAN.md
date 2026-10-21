# Growth Plan — first 10 paying customers

Date 2026-10-20, updated 2026-10-21 · owner: growth-marketer · budget: €0 · base `17accec` → `52c12b1`
Labels: **OBSERVED** (checked live or in code, source given), **MISSING** (no access), **HYPOTHESIS**.

## 0. Scoreboard (verified only)

| Metric | Value | Source |
|---|---|---|
| Verified paying customers acquired by this plan | **0** | no campaign has run yet |
| New MRR from this plan | **€0** | — |
| Total paying customers / MRR today | **MISSING** | Polar + `/admin/analytics` need owner login; no credentials in this session |
| Visitors, signups, masters, checkouts | **MISSING** | same; Plausible is off in prod (see B2) |
| Visitor→customer conversion | **MISSING** | — |
| CAC | **€0 cash** (time only) | no spend |
| Best channel | none measured yet | — |

Nothing here may be replaced with estimates. A customer counts only when a Polar `order.paid` / active subscription exists for that uid.

## 1. Inventory reused (nothing new installed)

- Agents in `.claude/agents/` (growth-marketer, seo-analytics-engineer, product-specialist, …) and the KB in `.claude/knowledge/`.
- **First-party analytics already exist**: `/analytics/collect` → admin dashboard (`frontend/src/app/admin/analytics/*`): overview (visitors, MRR, active subs), funnel (Visitors → Upload → Master → Pricing → Checkout → Paid), acquisition by referrer/UTM, sales, retention/churn, sessions; CSV/PDF export; daily Telegram summary (`telegramService.js`). This *is* the requested dashboard — no new one built (see §6 for the mapping).
- Polar (billing, discount codes), Brevo newsletter, share links (viral loop), free SEO tools (LUFS meter, key/BPM/chord finders), genre pages `/master/*`, `/vs/landr`, `/vs/emastered`.
- MCP connectors: Ahrefs, Amplitude, Similarweb, Slack, HubSpot need owner auth or failed to connect → not used.

## 2. Live audit — three most serious conversion barriers

### B1 · Every "try" path required an account, under copy that said otherwise — **FIXED (frontend, pending deploy)**
- OBSERVED (`HeroQuickTry.jsx` before this change): the hero panel says "Try it on your track · **No payment required**". "Try it with our sample" then downloaded the demo MP3 and opened the **sign-up dialog** before showing anything, even though the result is already stored in `DEMO_MASTER`. After the sample, the copy said "Now drop your own track in — **still no account needed**", but dropping a file opens the same dialog.
- Fix: the sample shows the engine's stored analysis instantly, with no account, no upload and no server compute. The badge now reads "Free account · no card". The follow-up line now says a free account measures your track and includes 3 full masters (en + sq).
- Verified: `next build` passes. In headless Chromium as a signed-out visitor, clicking the sample shows −15.9 LUFS / −2.9 dBTP / 2.2 LU with **0 dialogs**.
- E3 (2026-10-20): uploading your own file to the hero panel or `/lufs-meter` is now measured **in the browser**, with no account and no upload (`lib/loudness.js`, a port of the engine's BS.1770 meter). Only files the browser can't decode fall back to the account-gated server path. The key/BPM/chord finders still need an account, because they use server-only essentia/madmom.

### B2 · The owner can't see the funnel outside the admin panel; Plausible is dead in production — **DOCUMENTED (owner action)**
- OBSERVED: the shipped JS bundle contains the `"NEXT_PUBLIC_PLAUSIBLE_DOMAIN is not set"` branch, so Plausible never loads in production.
- Decision: **don't enable Plausible**. It is a paid service, and the brief is zero budget. The first-party dashboard covers the funnel.
- Risk: AURALITH-ANALYTICS-001 ("Paid" always 0 in the funnel) is READY_FOR_QA. Confirm on the live dashboard that a real payment shows up as Paid before trusting conversion rates.
- Owner action: open `/admin/analytics` weekly and paste the numbers into the §6 table. Cross-check paid counts against Polar, which is the source of truth for "customer".

### B3 · `www.auralithforge.app` does not resolve — **PARTIALLY FIXED (owner DNS action)**
- OBSERVED: Google DNS returns NXDOMAIN (Status 3) for `www.auralithforge.app`, while the apex resolves via Cloudflare. Anyone who types www, or clicks a www link someone wrote by hand in a bio or forum post, gets "site can't be reached".
- Fix in repo: a `www → apex` 301 block in `Caddyfile`.
- Owner action (2 min, free): in Cloudflare DNS, add `CNAME www → auralithforge.app` (proxied). Then either deploy the Caddy block or add a Cloudflare Redirect Rule `www.* → https://auralithforge.app/$1`.

### B4 · Masters run out → no direct way to buy — **FIXED (branch `growth/paywall-and-pay-per-track`, pending merge)** · AURALITH-GROWTH-001
- OBSERVED (`MasteringConsole.jsx` before): with a track loaded and quota 0, the Master button was disabled and the only path was an 11px link to the Plans tab, a second page with four plan cards and a table. If client entitlements were stale, the server's 402 had no `code`, so it showed as a red alert in English even to sq users.
- Fix: an inline paywall card with **"Master this track — €2.99"** (direct Polar checkout, the same call the Plans tab makes) plus "See plans". It also appears on a server 402. The gateway now sends stable codes (`trial_exhausted`, `monthly_quota_exhausted`, `professional_requires_plan`, `stems_require_purchase`, `stem_quota_exhausted`), all localized en + sq. Billing logic is unchanged.
- Verified: gateway 106/106 tests, including 2 new contract tests (a 402 carries `trial_exhausted`; a purchased credit unlocks the render); `next build` passes; 17 new i18n keys present in en + sq. **Not verified:** a live signed-in walkthrough (needs an account with a used-up trial, see §7 step 2b).
- Measure: `begin_checkout{checkout_source:"console_quota_paywall"}` → Polar `order.paid`.

### B5 · The €2.99 single master had no buy button anywhere public — **FIXED (same branch)** · AURALITH-GROWTH-002
- OBSERVED: `/pricing` "Pay per track instead" cards showed price + blurb only. The homepage pricing section didn't mention pay-per-track at all (only the FAQ did). For S1, someone releasing one single, this is the lowest-friction first payment.
- Fix: "Buy one master — €2.99" / "Buy one stem master — €4.99" buttons on `/pricing`, plus a one-track line under the homepage grid. Both go to signup → Plans tab with that add-on highlighted and scrolled into view. Checked in headless Chromium, desktop + mobile.

### B6 · The plan picked on a public page was forgotten after signup — **FIXED (same branch)** · AURALITH-GROWTH-003
- `planSignupHref` now carries `plan=`. The Plans tab highlights that card ("Your pick") and gives it the primary button style.

Also noted, not fixed (not conversion-critical or not in my permissions): the product has no social proof yet. Do not fabricate any. The first real customers' permission-based quotes are the fix (§5, E5).

## 3. Not verifiable from this session (blockers)

| Check | Status | What unblocks it |
|---|---|---|
| Signup → master → WAV download, live | NOT RUN: creating accounts on the live product without owner approval is off-limits | Owner runs the 10-min script in §7, or approves one labelled test account |
| Polar checkout + webhook → plan active | NOT RUN: real money | Owner buys Single Master €2.99 with own card, then refunds; or uses a Polar sandbox |
| Licensed before/after demos beyond the pop demo | Needs audio with redistribution rights | Owner supplies CC-BY / own tracks per genre, then `backend/scripts/render_homepage_demo.py` |
| Community rules | Rules change; the secondhand sources I found conflict (e.g. one 2026 guide says r/WeAreTheMusicMakers bans AI content) | Read each sidebar or message the mods before posting |

### Compliance constraint found 2026-10-21
`/privacy` limits marketing email to newsletter subscribers (Brevo, consent). **Don't send promo emails to signups who used their trial but never subscribed**: B4's in-product paywall is the compliant way to reach them. Also, the admin users list has no trial-usage field, so that cohort can't be listed without new code.

## 4. Segments and why they buy (HYPOTHESIS until interviews/payments confirm)

| # | Segment | Trigger moment | Why Auralith | Plan fit |
|---|---|---|---|---|
| S1 | Bedroom producers releasing singles (hip-hop/trap, pop, EDM) | Distributor upload deadline; "my track is quieter than references" | €2.99 a master vs a €30–80 human engineer; result in minutes; shows what it changed | Single Master → Indie €4.99 |
| S2 | Albanian-speaking artists (AL, XK, MK, diaspora) | Same, but every competitor's UI is English-only | Full sq UI; founder is local and reachable | Indie / Studio |
| S3 | Beatmakers selling beats (BeatStars/YouTube) | 10–30 beats a month need consistent loudness | Volume + artist profiles + share links | Studio €9.99 / All-Access |
| S4 | Podcasters / YouTubers | Loudness complaints, −16 LUFS targets | Podcast genre, LUFS meter | Indie |
| S5 | Mix engineers needing a quick client reference master | Client wants a loud preview today | Fast reference, share link | Studio |

Lead with **S1 + S2**: lowest price barrier, and the founder can personally reach S2.

## 5. First-customer campaign (approval needed before anything goes out)

Principle: value first, disclosed founder identity, one-to-one, no automation, no scraping beyond what a person publicly posted asking for feedback/mastering.

### Week 1 — owner network + Albanian scene (fastest path to payment)
- **Founder offer** (one Polar discount code, free): `FOUNDING10`, 50% off the first month of Indie/Studio for the first 10 users. Plus the founder personally reviews their first master and replies with notes. No fake scarcity: say "first 10" and mean it.
- List 30 people you already know who release music (studio contacts, bandmates, guitar circles, local producers). Message them personally (template M1). Target: 30 messages → 10 trials → 2–3 paid.
- Albanian channels: local producer Facebook groups, Instagram producer accounts that post in sq, music schools/studios in Tirana and Prishtina. Template M2. Offer a 20-minute free "master your next single live" session on IG Live or Discord (value + demo).

### Week 1 additions (2026-10-21)
- **Lead with the €2.99 single master, not a subscription.** A paid single master counts as a verified paying customer (Polar `order.paid`). It's the smallest ask, and B4/B5 make it one click. Keep FOUNDING10 for people who say they release monthly.
- **Owner prerequisite (5 min):** create `FOUNDING10` in Polar (50% off first month, Indie + Studio, max 10 redemptions). The code doesn't exist until you do this. Confirm the Polar checkout shows the discount-code field.
- **M1 list sources you already have:** your ~20 years of guitar/rock/Balkan circles (bandmates, rehearsal-room and gear-shop contacts), plus local producers you know. Name 30 people before sending anything.
- **M4 · DJs and event producers via Unwind's organizer contacts** (Enter Events, GoWild are already partnership targets). One personal message to each organizer, asking for an intro to 2–3 DJs who release edits/originals. The angle is the Club/DJ category and the free LUFS meter for checking their sets.
- **Demo asset already exists:** `video/out/auralith-reel-9x16.mp4` (16 s, 9:16, built from the real demo render). Before posting it anywhere new, confirm you own or have the rights to `frontend/public/audio/demos/pop-before.mp3`. Its provenance isn't documented in the repo.
- **Community rules are still unverified.** On 2026-10-21, web search only turned up third-party Reddit mirrors and 2019 pinned posts, nothing current. Read each sidebar logged in before posting; I didn't build a venue plan on secondhand rules.

### Week 2 — communities (value posts, rules checked first)
Candidate venues (verify the rules yourself; don't trust secondhand guides): r/mixingmastering (2019 rules capped self-promo at ~once a year, so prefer contributing answers), r/edmproduction / r/makinghiphop feedback threads, r/podcasting (loudness questions), Gearspace "Mastering forum" (no promo, answer questions only), KVR, the Mix Collective Discord (runs mixing contests), producer Discords with a #self-promo channel.
- Post P1 (education + real data, founder disclosed). It contains no ask beyond a link where the rules allow one.
- Reply-only playbook: search each venue weekly for "mastering", "too quiet", "LUFS", "loudness for Spotify". Answer the question fully first; mention the free LUFS meter only if it directly helps.

### Week 3 — SEO compounding + loop
- Publish 2 articles from the keyword map (`SEO_KEYWORD_MAP.md`): "How loud should I master for Spotify in 2026" and "Mastering for DistroKid/TuneCore: checklist". Each ends with the sample before/after and a "Master a track free" link.
- Share-link loop: add a "Mastered with Auralith Forge — master your own free" footer on `/shared/*` pages (verify it exists; product change needs approval).

### Drafts

**M4 — event organizer intro request (sq)**
> Përshëndetje {emri}! Jam Fonsi, i Unwind. Kam ndërtuar edhe Auralith Forge (auralithforge.app), një mjet për masterizim online në shqip. Analizon këngën, korrigjon vetëm atë që duhet dhe të tregon çfarë ndryshoi. A njeh 2–3 DJ ose producentë që nxjerrin muzikë të tyre dhe do ta provonin? 3 masterë falas pa kartë, dhe unë e dëgjoj vetë rezultatin. Pa asnjë detyrim për ty, vetëm një prezantim nëse të duket me vend.

**F1 — single follow-up, day 4, only if they tried it** (check `/admin/analytics` or ask them; never more than one follow-up)
> Hey {name}, did the master on {track} hold up on your speakers/phone? If it's ready to release, the next one is €2.99 with no subscription, or use FOUNDING10 if you put out music monthly. If something sounded off, tell me what. That's more useful to me than the sale.


**M1 — personal network (en)**
> Hey {name} — I've been building a mastering tool, Auralith Forge (auralithforge.app). It measures your mix first and then only fixes what needs fixing, and it shows you exactly what it changed. Since you're putting out {their release/project}, would you try it on one track? You get 3 full masters free, no card. If you like it, I'll give you 50% off your first month (code FOUNDING10), and I'll personally listen to the result and send you notes. Brutal feedback welcome.

**M2 — Albanian scene (sq)**
> Përshëndetje {emri}! Jam Fonsi, kam ndërtuar Auralith Forge (auralithforge.app), një mjet për masterizim online, plotësisht në shqip. Analizon miksin tënd, korrigjon vetëm atë që duhet dhe të tregon çfarë ndryshoi. Do ta provoje në një këngë? 3 masterë falas, pa kartë. Nëse të pëlqen, kodi FOUNDING10 të jep 50% zbritje muajin e parë, dhe unë e dëgjoj vetë rezultatin e të dërgoj shënime.

**M3 — reply to a public "need mastering / track too quiet" post** (only when the post asks for help or services)
> {Specific answer to their problem first: e.g. "your track is about −18 LUFS integrated; most of the gap to commercial loudness is peak control, not EQ…"}. Disclosure: I build an automated mastering tool. If you want, you can run this track through it free (3 masters, no card) and A/B it at matched loudness: auralithforge.app. Happy to look at the result with you.

**P1 — community value post** (title: "I logged every decision an adaptive mastering chain made on one pop mix — numbers inside")
> I'm the developer of an automated mastering tool, so take this with that bias. I wanted to show what "AI mastering" actually does to a mix, without marketing. On one pop mix: −15.9 → −11.3 LUFS, true peak −2.9 → −2.0 dBTP, crest factor 16.2 → 11.7 dB. It made 5 corrections (+1.0 dB at 35 Hz, +0.9 dB at 134 Hz, −1.5 dB dynamic cut at 1.1 kHz, −0.7 dB at 11.2 kHz, limiter ~3.9 dB on the hits). It left 3 areas untouched (low mids, air, stereo). It flagged its own 5.4 dB limiter peak as worth checking for pumping. Before/after at matched loudness: {link if allowed}. Questions I'd love opinions on: would you have cut at 1.1 kHz? Is 5.4 dB GR on pop acceptable to you?

(Every number above comes from `frontend/src/content/demoMaster.js`, the engine's real render of the homepage demo.)

## 6. Dashboard / weekly scorecard (fill from `/admin/analytics` + Polar every Monday)

| Week | Visitors | Signups | Completed masters | Checkout starts | New paying | Total paying | MRR € | Churned | Notes / channel |
|---|---|---|---|---|---|---|---|---|---|
| 2026-W43 (baseline) | | | | | | | | | owner to fill |

Sources: Visitors/Checkout = Overview + Funnel. Signups = server `sign_up` events (the session funnel has no Signup step; ANALYTICS-002). Masters = `master_completed` excluding previews. Paying/MRR = Polar (the dashboard's MRR is estimated from plan prices). Churn = Retention page plus Polar cancellations.
Attribution: every outreach link carries UTMs, e.g. `?utm_source=reddit&utm_medium=community&utm_campaign=p1`, `?utm_source=network&utm_medium=dm&utm_campaign=founding`. The Acquisition page breaks these out.

## 7. Owner smoke test (10 min, run once after deploy)
1. Incognito → `/` → "Try it with our sample": result shows without a sign-up dialog.
2. Sign up with Google → upload a track → 30 s preview plays → full master → download WAV opens and plays.
2b. On a test account that has used all 3 free masters: load a track → step 3 shows the paywall card → "Master this track — €2.99" opens Polar checkout (cancel there). Switch to Shqip and check the card is translated. Then `/pricing` → "Buy one master" → after signup, the Single Master card is highlighted.
3. `/pricing` → Single Master €2.99 → pay → master credit appears → refund in Polar.
4. `/admin/analytics/funnel` shows the visit, upload, master, checkout **and Paid** for that session (confirms ANALYTICS-001 is fixed live).
5. `https://www.auralithforge.app` redirects to the apex.
Record pass/fail per step in §8.

## 8. Experiment log

| ID | Hypothesis | Change / channel | Metric | Status | Result |
|---|---|---|---|---|---|
| E1 | Instant sample result raises hero engagement → signups | B1 fix | `cta_click try_sample` → `free_tool_analysis_completed{input:sample}` → `sign_up` | Shipped in branch, **not deployed** | — |
| E2 | Founder network converts fastest | M1/M2 + FOUNDING10 | paid orders with code | **Awaiting approval** | — |
| E3 | Free tool pages without an account increase tool → signup | in-browser LUFS/true-peak/LRA on `/lufs-meter` + hero upload | `free_tool_analysis_completed{method:browser}` → `free_tool_master_cta_clicked` → `sign_up` | Shipped in branch, **not deployed**. Matches the engine within 0.0005 LU / 0.000002 dB on 6 signals; Chromium MP3 decode reproduces the demo's −15.9 / −2.9 / 2.2 | — |
| E4 | Value posts drive qualified traffic | P1 in 1–2 venues | UTM sessions → signups → paid | Awaiting rules check + approval | — |
| E6 | Direct buy at quota 0 converts better than the Plans-tab detour | B4 inline paywall | `begin_checkout{checkout_source:console_quota_paywall}` → `order.paid`; compare to `app_plans_tab` | Shipped in branch, **awaiting merge** | — |
| E7 | Visible €2.99 option lifts first payments from one-release visitors | B5 CTAs | signups with `redirect` containing `buy=single_master` → single-master orders | Shipped in branch, **awaiting merge** | — |
| E5 | Real quotes lift pricing-page conversion | ask paying users for permission to quote | pricing → checkout | After first payers | — |

Failed experiments: none run yet.

## 9. Next highest-impact action
1. **Merge the `growth/paywall-and-pay-per-track` PR** so the €2.99 path is one click before any outreach traffic arrives.
2. **Create `FOUNDING10` in Polar**, then run the §7 smoke test (with step 2b).
3. **Approve and send M1/M2 to 30 named people**, plus M4 to the two event organizers. Ask for the €2.99 single master first.

This is still the only channel that can plausibly produce verified payments this week.
