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
      },
      boxShadow: {
        panel: "0 10px 32px rgba(0, 0, 0, 0.25)",
      },
    },
  },
  plugins: [],
};
