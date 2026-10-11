# Frontend audit report (Step 1, read-only discovery)

Agent: frontend-engineer. Scope: mastering console (`app/ui/MasteringConsole.jsx`, `store/masteringStore.js`, `domain/mastering/masteringDomain.js`, `components/audio`, `lib/masteringErrors.js`).

## 1. Build
`cd frontend && npm ci && NEXT_PUBLIC_SITE_URL=https://auralithforge.app npm run build` -> **PASS** (all routes generated; `npm audit` reports vulnerabilities in deps, not triaged here).
Browser e2e / workflow verification: **BLOCKED** (no Firebase/Node/Python stack in this session). Everything below is static code tracing.

## 2. Control inventory (console -> request field -> honoured?)
Request built in `masteringDomain.runMasteringJob` -> Node `POST /master` (`masteringRoutes.js:725`) -> Python `/master` form (`mastering.py:188`).

| Control | Field | Honoured? |
|---|---|---|
| Audio file dropzone | `file` | Yes |
| Reference track dropzone | `reference_file` | Yes (Node passes through, Python accepts). In reference mode genre/style defaults substituted, tags emptied, Pro knobs ignored (intended) |
| Genre chips | `genre` | Yes (null allowed server-side) |
| Style chips | `style` | Yes |
| Delivery target chips | `delivery` (default "auto") | Yes (Node + Python) |
| Objective (category) chips | `category` | Yes; not sent for literal-chain preset or Pro mode (intended) |
| Flavour chips | `flavour` (only if category) | Yes |
| Tag chips | `tags` (JSON) | Yes |
| Direction / tone / fine tweaks (AdaptiveControlsPanel, DirectionControls) | `tweaks` (JSON, clamped -1..1) | Yes |
| Preset select | `mix_preset` | Yes |
| Engine select (Standard/Professional) | `tier` | Yes; Professional option disabled unless studio/pro (matches server 402 gate, `planUnlocksProfessional`). Preview forces standard server-side |
| Stem separation checkbox | `use_stem_separation` | Yes; enabled only when plan=pro with stem quota left, or stem credit held. Matches server gate. Note: for non-pro plans without a credit server ignores gating on that branch (only plan==="pro" is checked at 845), so UI is stricter than server, not looser |
| Quick/Pro mode toggle + ProParamsPanel knobs | `processing` (JSON) | Yes for final master only. **Ignored on preview** (`useProProcessing = !preview ...`; Node also `!preview && body.processing`), so previews never reflect manual Pro knobs |
| Preview (30 s) button | `preview=true` (client slices WAV head, server also cuts excerpt) | Yes |
| Master button | `preview=false` | Yes; disabled when quota 0 and no credit (agrees with server) |
| Output format | `output_format` hardcoded "wav" | No UI control (not dead; but Pro "Bit depth" lives in `processing`) |
| Codec preview select + button (result) | `POST /codec-preview {job_id, codec}` | Yes (Node route line ~1209) |
| Share link manager (MyMasters) | `/share` expiry/max_downloads | Yes; UI gate `planUnlocksShare` = pro, server 402 for non-pro: consistent |
| Buy single stem / master | checkout item | Not traced further |
| Pro mode (manual knobs) availability | n/a | UI and server both allow any plan (no gate); tier=professional is the gated item. Naming "Pro mode" vs "Professional engine" is confusing but not a bypass |

No fully dead controls found. Gap: controls give no feedback that Pro-knob changes do not affect the 30 s preview.

## 3. i18n re-verification (AURALITH-PRODUCT-002) -> STILL OPEN
`lib/i18n.js` has en+sq for console strings (MasteringConsole, MasteringDecisions, PresetSaveBar, Direction/Adaptive panels use `t()`). Remaining hard-coded English in the mastering path:
- `components/audio/ProParamsPanel.jsx`: no `useI18n` at all, ~31 literals (section titles/subtitles lines 129-260, "Bit depth" 187, hint line 122).
- `components/audio/ProcessingSummary.jsx`: no `t()`, ~20 literals ("Parameter" 58, "What the engine actually did" 168, "Track Analysis" 206, "Frequency Balance..." 207, "Threshold" 238).
- `components/audio/ChordGrid.jsx:142` "Tap any bar to jump there."
- `components/audio/ABMasterPlayer.jsx`: aria-labels "Compare" 591, "Seek" 639, "Play"/"Pause" 678, default `unavailableLabel` 122 (English fallback prop).
- `app/app/AppClient.jsx:431` title="Auralith Forge" (brand, fine).
- Store fallbacks English: `masteringStore.js:171,229,283,470,579,595,696` ("Mastering failed", "Couldn't refresh live preview.", ...).
- Server-sourced English surfaced verbatim: every UI catch uses `err?.message || t(...)` (SettingsPanel:54, ShareLinkManager:45/64/78, MyMastersPanel:79/90/110, PlansPanel:141/163/175, MasterResultView:71, MasteringConsole:198/916, codec preview). Node `/master` emits ~12 English `detail` strings: 402 Professional (829), stem quota (849, 862), trial/monthly quota (887, 893), 403 EMAIL_NOT_VERIFIED (741), ACCOUNT_REQUIRED (750), 400 "file is required" (729), "processing must be valid JSON" (764), band limit (772), plus share-link 402 (289) and checkout 400s (504, 549, 554). The 402/403 ones have no `code` (or an unmapped code), so they cannot be localized: sq users see English for every plan-limit message.
Totals: ~51+ literal strings in 4 audio components, ~7 store fallbacks, ~15 Node detail strings reaching users.

## 4. Error mapping (lib/masteringErrors.js + i18n `masterError.*`, en+sq present)
| Code | Mapped + localized |
|---|---|
| invalid_audio, too_long, render_failed, processing_timeout, at_capacity, queue_timeout, stems_too_long, billing_unavailable, master_reservation_conflict, stem_reservation_conflict, reservation_expired | Yes (also cancelled, worker_crashed, too_large_for_server, stems_unavailable, duplicate_job, no_file, no_genre) |
| EMAIL_NOT_VERIFIED, ACCOUNT_REQUIRED (Node 403) | **No** - English detail shown |
| stems_not_run (Node, line 1048) | **No** |
| Node 402 plan/quota gates (no code) | **No** - English detail |
All listed requested codes are mapped. Mapping is applied only in `MasteringConsole.jsx:846` and `NotificationBanner.jsx:77`; other surfaces use raw `err.message`.

## 5. Accessibility quick pass
Good: ABMasterPlayer has radiogroup A/B, `role=switch` level-match, `role=slider` seek with aria-value* + keyboard handler + tabIndex, play/pause aria-label, `role=alert` unavailable notice; Knob is a keyboard slider with typed-entry; loader overlay has `role=status`, `progressbar`; InlineAlert `role=alert`; DirectionControls radiogroups; labelled selects and dropzones.
Gaps: (a) genre/style/delivery/category/flavour/tag chip buttons (MasteringConsole 485-556) have no `aria-pressed` (only 2 uses in file) so selection is visual only; (b) wizard step buttons (308-316) lack `aria-current="step"`; (c) ABMasterPlayer aria-labels are English-only; (d) `<canvas>` waveform has no text alternative; (e) disabled Professional option conveys reason only via visible suffix (OK).
