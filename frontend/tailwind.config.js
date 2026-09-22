/**
 * Every color below is a CSS custom property holding a complete color
 * value (`--bg: #f6f5f1`), not the channel triplet Tailwind expects for
 * alpha support. The consequence is silent and severe: an opacity
 * modifier on one of these tokens — `bg-bg/80`, `border-text-primary/30`,
 * `bg-accent/[0.1]` — compiles to NOTHING. No error, no warning, no CSS
 * rule at all; the element just renders with no background, or with
 * Tailwind's default gray border instead of the intended one. A repo-wide
 * scan found 160+ such utilities already written across the app and
 * marketing site, every one of them dead on arrival.
 *
 * `color-mix()` fixes it without touching the variables themselves, so
 * every plain `var(--token)` reference in globals.css keeps working
 * exactly as before. Supported in all current browsers (Chrome/Edge 111+,
 * Safari 16.2+, Firefox 113+); a browser older than that falls back to
 * the same "no rule" behavior these classes already have today, so this
 * is strictly an improvement on the status quo.
 */
const alphaToken = (variable) => ({ opacityValue }) => {
  // Tailwind calls this in three different ways and only one of them
  // carries a real number:
  //   undefined                  -> plain `bg-bg`, no modifier
  //   "var(--tw-bg-opacity)"     -> plain `bg-bg` in the utilities where
  //                                 Tailwind emits its own opacity var
  //                                 (that var is 1, i.e. fully opaque)
  //   "0.8" / "0.15"             -> an actual `/80` or `/[0.15]` modifier
  // Feeding the middle case to Number() yields NaN and produces
  // `color-mix(... NaN%, transparent)` — invalid CSS that silently kills
  // the declaration. That one mistake broke 29 rules including `.bg-bg`
  // itself, so both non-numeric cases fall through to the plain color.
  if (opacityValue === undefined) return `var(${variable})`;
  const alpha = Number(opacityValue);
  if (!Number.isFinite(alpha)) return `var(${variable})`;
  return `color-mix(in srgb, var(${variable}) ${alpha * 100}%, transparent)`;
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Auralith Forge minimal-premium palette — see globals.css's
        // :root comment. This is what new/migrated work uses.
        bg: alphaToken("--bg"),
        "text-primary": alphaToken("--text-primary"),
        "text-secondary": alphaToken("--text-secondary"),
        "dark-bg": alphaToken("--dark-bg"),
        "dark-surface": alphaToken("--dark-surface"),
        "dark-text-primary": alphaToken("--dark-text-primary"),
        "dark-text-secondary": alphaToken("--dark-text-secondary"),
        // These two are already rgba() values, so an opacity modifier on
        // top would compound rather than set the alpha — left as plain
        // var() lookups deliberately.
        "border-subtle": "var(--border-subtle)",
        "dark-border-subtle": "var(--dark-border-subtle)",
        accent: alphaToken("--accent"),

        // Legacy dark/glassmorphic brand tokens — kept only for
        // components not yet migrated to the palette above (see
        // globals.css's comment). Do not reach for these in new work.
        ink: alphaToken("--ink"),
        coal: alphaToken("--coal"),
        ember: alphaToken("--ember"),
        brass: alphaToken("--brass"),
        mist: alphaToken("--mist"),
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
