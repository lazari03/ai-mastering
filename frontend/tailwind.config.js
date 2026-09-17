/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        coal: "var(--coal)",
        ember: "var(--ember)",
        brass: "var(--brass)",
        mist: "var(--mist)",
        // Semantic aliases (globals.css) — see that file's comment. New
        // work reaches for these; ink/coal/ember/brass/mist above stay
        // for anything that wants the raw brand color directly.
        surface: "var(--surface)",
        "surface-elevated": "var(--surface-elevated)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
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
