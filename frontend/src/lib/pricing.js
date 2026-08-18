// Mirrors PRICING.md / backend-node's settings.polarProducts keys — kept
// here once so Settings, MasteringConsole, and ChordsPanel all show the
// same numbers instead of each hardcoding its own copy.
// EUR — matches the Polar organization's default presentment currency.
export const PRICING = {
  subscription: { item: "subscription", label: "All-Access", price: "€19/mo", blurb: "Unlimited Standard & Professional mastering, unlimited Chord Detection, stem separation included." },
  masterStandard: { item: "master_standard", label: "Standard Master", price: "€2.99", blurb: "One full-length Standard-tier render." },
  masterProfessional: { item: "master_professional", label: "Professional Master", price: "€4.99", blurb: "One full-length Professional-tier render." },
  stemAddon: { item: "stem_addon", label: "Stem Separation", price: "€1.99", blurb: "Adds stem-aware processing to your next master." },
  chords: { item: "chords", label: "Chord Detection", price: "€1.49", blurb: "One full chord/key/BPM analysis." },
};
