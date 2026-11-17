// EUR — this Polar organization's default presentment currency (Polar
// rejects prices that don't include it).
const CURRENCY = "eur";
const cents = (eur) => Math.round(eur * 100);

const PLAN_TIERS = [
  {
    key: "planIndie",
    env: "POLAR_PLAN_INDIE",
    name: "Indie",
    monthly: 4.99,
    description: "15 full-length masters a month on the Standard engine, with codec preview and instant A/B.",
  },
  {
    key: "planStudio",
    env: "POLAR_PLAN_STUDIO",
    name: "Studio",
    monthly: 9.99,
    description: "50 full-length masters a month on the Standard and Professional engines.",
  },
  {
    key: "planPro",
    env: "POLAR_PLAN_PRO",
    name: "All-Access",
    monthly: 19.99,
    description: "250 full-length masters a month, everything in Studio, 20 stem separations a month and shareable download links.",
  },
];

export const POLAR_CATALOG = [
  ...PLAN_TIERS.flatMap((tier) => [
    {
      key: tier.key,
      envVar: `${tier.env}_PRODUCT_ID`,
      name: `${tier.name} (Monthly)`,
      description: tier.description,
      interval: "month",
      amount: cents(tier.monthly),
    },
    {
      key: `${tier.key}Annual`,
      envVar: `${tier.env}_ANNUAL_PRODUCT_ID`,
      name: `${tier.name} (Yearly)`,
      description: `${tier.description} Billed yearly — 12 months for the price of 10.`,
      interval: "year",
      amount: cents(tier.monthly) * 10,
    },
  ]),
  {
    key: "singleMaster",
    envVar: "POLAR_SINGLE_MASTER_PRODUCT_ID",
    name: "Single Master",
    description: "One extra full-length master, no subscription. Same Standard/Professional engine as your plan.",
    interval: null,
    amount: cents(2.99),
  },
  {
    key: "stemSeparation",
    envVar: "POLAR_STEM_SEPARATION_PRODUCT_ID",
    name: "Stem Separation Add-on",
    description: "Separate vocals and accompaniment for one master. Requires an available master allowance or Single Master credit. All-Access includes 20 separations/month.",
    interval: null,
    amount: cents(4.99),
  },
];

