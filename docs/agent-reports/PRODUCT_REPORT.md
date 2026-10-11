# Product and Monetization Report: All-Access (€19.99/mo)

Author: product-specialist (discovery audit, read-only on code). Date: 2026-10-10. Code baseline: c88bc69.
Sources: `.claude/knowledge/PRODUCT_RULES.md` (verified matrix, not re-derived), `docs/audits/PRICING_AND_CLAIMS.md`, `docs/audits/PROFESSIONAL_ROADMAP.md`, `kb.py issues --all`, targeted reads of `frontend/src/app/pricing/page.js` and `frontend/src/lib/pricing.js`.

## 1. Verdict

**All-Access at €19.99 does not yet deliver enough differentiated recurring value. It is defensible on volume alone, but it is a weak ask for anyone whose need isn't volume.**

Evidence:
- Its three differentiators are 250 masters/month, 20 stems/month and share links. Everything else (Standard and Professional engines, reference mastering, A/B, codec preview, chord/key/BPM tools) is available on Studio (€9.99) or on every plan. All-Access is therefore 2x Studio's price for 5x the volume plus stems and links.
- Almost no one needs 250 masters a month. Studio's 50 already covers 2 to 3 albums (PROFESSIONAL_ROADMAP). Real demand for 250 is limited to studios, agencies and high-volume podcast or content shops.
- The Professional engine's measured advantage is nil to marginal (AURALITH-PRODUCT-001, P1 OPEN). Outputs were identical or within 0.1 dB on same-audio pairs, and the sub/punch band split mattered on 2 of 21 synthetic tracks. Studio's headline upsell ("Standard & Professional engines") and All-Access's "Everything in Studio" both lean on it.
- Audio quality has no listening evidence (AURALITH-QA-001, P0 BLOCKED). The honest claims policy rightly forbids "better than X" copy, so there is no quality-based reason to pay a premium.
- Album mastering is missing. It is roadmap item 1 and the most commonly cited paid feature at competitors.
- The monthly reset on a high-volume quota makes it a poor retention hook: unused masters give users no reason to stay, and nothing accumulates (files are deleted after the retention window; presets are the only stored asset).
- Stems are the only unusual premium item, but they are two-stem only (vocals plus accompaniment) and are not useful for mastering itself.

Where it works: studios and engineers who really do batch, and people who value share links for client review. Add-on pricing (Single Master €2.99, Stem €4.99) makes a light user's pay-per-use cheaper than a subscription up to about 3 masters a month.

## 2. Competitor snapshot (accessed 2026-10-10)

Caveat: WebSearch returned mostly aggregator and review pages that disagree with each other; direct fetches of LANDR returned no pricing, the eMastered help page returned 403 on fetch, and the iZotope fetch returned 404. **All figures are secondary and unverified; check vendor pages before any pricing decision.**

| Product | Reported pricing | Headline features | Source |
|---|---|---|---|
| LANDR | Sources conflict. Distribution plans about $24 to $45/yr; Studio plans reported at $12/mo or $23.99 to $99.99/yr; pay-per-release $9 single / $19 album. | Instant AI mastering plus distribution, promo links, collaboration, stats. | https://pricingsaas.com/companies/landr ; https://nemovideo.com/alternative/landr ; https://www.landr.com/pricing (no price shown) |
| eMastered | Official help centre via search: $19/mo on a 12-month commitment, $156 billed upfront (about $13/mo), or $39/mo month-to-month. Reviews quote $49/mo monthly. All plans unlimited masters. | Unlimited masters, same features on every plan. | https://help.emastered.com/hc/en-us/articles/5615662953101 (search snippet; fetch 403) |
| BandLab Mastering | Free, reportedly no watermark and no upload cap; judged below paid tools. | Free web mastering inside a free DAW and community. | https://fast.io/resources/best-ai-mastering-tools-2026.md |
| CloudBounce | Varies by source: about $4/track, or about $10 to 22/mo. | Per-track or subscription AI mastering. | https://fast.io/resources/best-ai-mastering-tools-2026.md ; https://dynamoi.com/es/learn/ai-music-distribution/ai-music-mastering-tools |
| iZotope Ozone 12 | One-time plugin, about $199 to $499 depending on edition. | Master Assistant, local DAW plugin, full manual control. | https://dynamoi.com/es/learn/ai-music-distribution/ai-music-mastering-tools (secondary) |
| Masterchannel | One uncorroborated source: free previews, $5/track, $15 to 20/mo unlimited. | AI mastering with human-style polish. | https://fast.io/resources/best-ai-mastering-tools-2026.md (single source) |

Implication: the market anchor for unlimited AI mastering is roughly $13 to 20/mo, and a free option exists (BandLab). Auralith's €19.99 buys a capped 250 masters with no album mode, so it sits at the top of the range for less headline value. Studio at €9.99 and Indie at €4.99 are better positioned against the field than All-Access.

## 3. Simulated customer profiles (SIMULATED, not research; no interviews took place)

| Profile (simulated) | Job to be done | Best plan | Reasons to subscribe | Reasons to cancel |
|---|---|---|---|---|
| Independent musician | Master 1 to 2 releases/month for streaming | Indie / Studio | Delivery targets, codec preview, A/B | Free tier or Single Master is enough between releases |
| Bedroom producer | Quick loudness-competitive demos | Indie | Cheap, previews are free | Quality unproven; BandLab is free |
| Professional producer | Deliver client masters | Studio / All-Access | Reference mastering, volume | No album mode, no manual depth versus Ozone, can't prove quality to clients |
| Mixing engineer | Hand mixes off with a master check | Studio | Reference matching, presets | Wants fine control; Professional engine ≈ Standard |
| Recording studio | Batch many clients' tracks | All-Access | 250/mo, share links for client review | No team seats, no batch or album job, no branding on links |
| Singer-songwriter | A few songs a year | Free / Single Master | 3 free masters | Cancels after the release; monthly reset has no value |
| Electronic producer | Loud, bass-heavy masters | Studio | Sub/punch split might help | Needs listening proof; no stem-aware mastering |
| Podcast creator | Loudness-normalize episodes | Indie / pay per use | LUFS targets | Voice-specific tuning is not marketed; free LUFS meter covers basics |
| Budget hobbyist | Cheapest acceptable result | Free | 30 s previews unlimited | Will not pay when BandLab is free |
| High-volume subscriber | Many files monthly | All-Access | Quota, stems | Unused quota; stems are two-stem only |

## 4. Missing premium functionality (ranked by buyer pull)

1. Album mastering (shared loudness and tone across 2 to 20 tracks); designed in PROFESSIONAL_ROADMAP #1, no new DSP needed.
2. Saved references plus a closeness report (roadmap #2).
3. Bounded manual controls on the adaptive engine (roadmap #3); manual mode exists as preset tweaks only.
4. Persistent library: files are deleted after the retention window, so there is no accumulating asset or history value to lose on cancel.
5. Batch upload and queue; team seats and branded or password-protected share links (studio use case).
6. Distribution or release hand-off, which is how LANDR bundles lock-in (build-vs-partner decision for the product owner).
7. Stems beyond vocals/accompaniment (roadmap #4, resource-limited today).

## 5. Reasons to subscribe / cancel (summary)

Subscribe: adaptive, analysis-first engine; reference mastering; level-matched A/B ("actually improved" verdict); codec preview; free analysis tools; annual saving (10 for 12); volume headroom; share links.
Cancel: nothing carries over month to month; unproven audio quality (no listening evidence); Professional engine indistinguishable; free competitor exists; pay-per-use is cheaper for light use; no album mode; quota resets unused.

## 6. Pricing concerns

- Value ladder is flat above Studio. Studio to All-Access doubles the price without a feature a typical buyer wants; "5x Studio's headroom" (current blurb) sells a quantity few can use.
- Studio is flagged as the featured plan, so All-Access is positioned as a volume add-on. This is probably right commercially, but then All-Access needs a non-volume reason to exist.
- Price conventions: competitors quote unlimited masters at about $13 to 20/mo; a capped 250 at €19.99 invites the comparison. Not a recommendation to cut prices (needs product-owner approval); recommendation is to add value or reposition.
- Single Master at €2.99 is cheaper than Indie (€4.99) only for one master a month; Indie wins from two upward, so the Free to Indie funnel logic in `pricing.js` is sound.
- The Professional engine is sold in the Studio feature list while AURALITH-PRODUCT-001 is open. Copy is factual, but the row still implies a premium difference.
- Prices are EUR only; competitor comparison is mostly USD.

## 7. Conversion friction

Observed in `app/pricing/page.js` and `lib/pricing.js`:
- The pricing page is server-rendered, English-only (AURALITH-PRODUCT-002), although the product supports Albanian.
- No plan recommendation or "which plan is for me" guidance; four plans with a comparison table only.
- No social proof, no audio before/after samples on the pricing page (blocked by lack of listening evidence).
- All-Access shows no differentiator beyond volume in its card; stems and share links are one-line bullets with no explanation.
- The pricing page shows no downgrade or cancel-flow reassurance beyond a single line, and "Cancel any time" links only to the refund policy.
- Free tier gives 3 lifetime masters, with the 30 s previews as the real taste. There is no in-flow nudge at the moment of quota exhaustion shown in the files reviewed (not verified in the console; recommend a follow-up check).
- Plan card CTAs route to signup (`planSignupHref`), which is correct.

## 8. Prioritized improvements (impact x effort)

| # | Improvement | Impact | Effort | Type | Owner | Evidence |
|---|---|---|---|---|---|---|
| 1 | Ship album mastering (shared target, album report) | High | M | Engineering | audio-dsp-engineer + backend-engineer, then frontend-engineer | PROFESSIONAL_ROADMAP #1; missing premium feature; Studio quota covers 2 to 3 albums |
| 2 | Produce listening evidence (real-music corpus, blind A/B) so quality can be claimed and shown on pricing | High | M | Engineering/QA | mastering-engineer | AURALITH-QA-001 (P0 BLOCKED); claims policy blocks quality copy |
| 3 | Saved references plus closeness report | High | S-M | Engineering | audio-dsp-engineer, frontend-engineer | Roadmap #2; reuses `reference_file` matching |
| 4 | Make All-Access justify itself: studio kit (batch upload, branded or password share links, longer file retention or a persistent library) | Medium-High | M | Engineering | backend-engineer, frontend-engineer | Cancel driver: nothing accumulates; studio persona |
| 5 | Resolve Professional-engine positioning: either deliver a measurable difference or reword the Studio row and All-Access "Everything in Studio" so the plan is sold on workflows | Medium | S (copy) / M (DSP) | Copy first | product-specialist (copy, with lead assignment), audio-dsp-engineer | AURALITH-PRODUCT-001; RELEASE_READINESS §5 |
| 6 | Pricing page clarity: "which plan" guidance, explain stems and share links, localize (sq), cancel reassurance, replace "5x headroom" blurb with a use-case line | Medium | S | Copy (plus SSR i18n engineering for sq) | product-specialist, frontend-engineer | pricing.js blurb; AURALITH-PRODUCT-002; Section 7 |

Copy-only items: 5 (reword), 6 (except sq server-rendering). Engineering items: 1 to 4. No price or entitlement changes are proposed; any repricing requires product-owner approval. Review of annual/monthly mix and an "annual only above Studio" test belong to a later experiment, not this audit.

## 9. Method and limits

- Competitor data are secondary and conflicting; direct vendor pages mostly failed to fetch. Treat the table as directional.
- Personas are simulated. No customer research, usage data or listening evidence was available.
- Upgrade prompt behaviour inside the console was not read (scope limited to `app/pricing` and `lib/pricing.js`).
- No `kb.py issue-add` calls were made, per instruction.
