/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Auralith Forge minimal-premium palette — see globals.css's
        // :root comment. This is what new/migrated work uses.
        bg: "var(--bg)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "dark-bg": "var(--dark-bg)",
        "dark-surface": "var(--dark-surface)",
        "dark-text-primary": "var(--dark-text-primary)",
        "dark-text-secondary": "var(--dark-text-secondary)",
        "border-subtle": "var(--border-subtle)",
        "dark-border-subtle": "var(--dark-border-subtle)",
        accent: "var(--accent)",

        // Legacy dark/glassmorphic brand tokens — kept only for
        // components not yet migrated to the palette above (see
        // globals.css's comment). Do not reach for these in new work.
        ink: "var(--ink)",
        coal: "var(--coal)",
        ember: "var(--ember)",
        brass: "var(--brass)",
        mist: "var(--mist)",
        surface: "var(--surface)",
        "surface-elevated": "var(--surface-elevated)",
        "border-strong": "var(--border-strong)",
        void: "var(--void)",
        "void-elevated": "var(--void-elevated)",
        copper: "var(--copper)",
        cream: "var(--cream)",
        "cream-muted": "var(--cream-muted)",
      },
      boxShadow: {
        panel: "0 10px 32px rgba(0, 0, 0, 0.25)",
        "glow-ember": "0 0 24px rgba(232, 93, 42, 0.35)",
        "glow-brass": "0 0 24px rgba(223, 201, 90, 0.35)",
      },
    },
  },
  plugins: [],
};
