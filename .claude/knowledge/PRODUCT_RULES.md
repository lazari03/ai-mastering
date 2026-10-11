# Product rules (Level 2)

validated_commit: c88bc69 · owner: product-specialist · reviewer: frontend-engineer
Sources of truth (code wins): `frontend/src/lib/pricing.js` (display), `backend-node/src/services/entitlementsService.js` (enforcement),
`masteringRoutes.js` `/master` (gates). Verified matrix + claims audit: `docs/audits/PRICING_AND_CLAIMS.md`.

## Plans (EUR; annual = 10 × monthly) — **do not change prices without product-owner approval**
| Plan key | Label | Price | Masters | Engines | Stems | Share links |
|---|---|---|---|---|---|---|
| free | Free | €0 | 3 lifetime trial + unlimited 30 s previews | Standard | €4.99 each | no |
| indie | Indie | €4.99/mo · €49.90/yr | 15/mo | Standard | €4.99 each | no |
| studio | Studio | €9.99/mo · €99.90/yr | 50/mo | Standard + Professional | €4.99 each | no |
| pro | **All-Access** | **€19.99/mo** · €199.90/yr | 250/mo | Standard + Professional | 20/mo incl. | yes |
Add-ons: Single Master €2.99 (credit used after quota), Stem Separation €4.99.
The €19.99 target tier is **All-Access** (`pro`). Its distinguishing value today: volume, stems, share links. Professional engine ≈ Standard (AURALITH-PRODUCT-001).

## Feature inventory (exists in code at c88bc69)
Adaptive mastering (20 genres, styles, tags, 9 categories × flavours, delivery targets), Standard/Professional engines,
reference mastering, mix presets + custom presets (import/export), 30 s previews, A/B with gain match + "actually improved" verdict,
codec preview, stem separation (Demucs), chord/key/BPM detection, LUFS meter tool, share links, job history ("My Masters"),
PDF export, account deletion / sign-out-everywhere, admin analytics.
**Not present** (do not market): album mastering, bounded manual controls beyond preset tweaks (roadmap: `docs/audits/PROFESSIONAL_ROADMAP.md`).

## Claims policy
Mastering claims are qualified (commit 02048d5). No "professional quality" / "better than X" claims until listening evidence exists (AURALITH-QA-001).
Never present simulated personas as customer research; label them "simulated".

## Localization
Languages: English (`en`) and Albanian (`sq`). Client strings via `frontend/src/lib/i18n.js`; plan copy carries `{en, sq}` objects in `pricing.js`;
mastering errors mapped in `frontend/src/lib/masteringErrors.js`. Every new user-facing string needs both languages.
