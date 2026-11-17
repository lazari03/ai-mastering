# Pricing presentation and free-trial rollout

- New signup offer: one full-length Standard master, including WAV export; unlimited 30-second previews remain free.
- Accounts created before 2026-11-17 00:00 UTC retain three lifetime masters. Legacy usage documents without a timestamp also retain three. A server-owned freeMasterTrialLimit pins the grant when a render is reserved; refunds and account deletion retain it.
- Monthly and annual prices and paid allowances are unchanged.
- One-off purchases are visible directly below public plan cards and above the in-app comparison table. Their CTA carries the chosen item through login and scrolls to the existing purchase buttons; it does not automatically charge.
- Single Master is €2.99. Stem Separation is a €4.99 add-on, and still requires a master allowance or credit (€7.98 total when both must be purchased).
- No customer quotes were invented. The existing empty testimonial source still renders nothing; approved future entries appear next to the audio demonstration.

## Polar

Subscription prices remain unchanged. The seeded stem product name/description now state the add-on requirement. Live Polar changes require the pending Polar connection. No live Polar products have been changed by this commit.

## Measurement

Existing cta_click events now distinguish single_master and stem_separation from homepage_pricing and pricing_page. Existing begin_checkout and server-authoritative purchase events remain in place. Compare completed purchases and revenue per signup for cohorts before and after rollout; separate old three-master accounts from new one-master accounts. Do not interpret this sequential rollout as a randomized A/B test.
