import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

// Next 16 removed `next lint`; this is its flat-config replacement (Next's
// core-web-vitals rule set, incl. react-hooks).
export default defineConfig([
  ...nextVitals,
  {
    // eslint-config-next 16 ships react-hooks v7, whose React Compiler rules
    // flag patterns that are correct without the compiler (React 18 here,
    // compiler not enabled) and that `next lint` never checked. Kept visible
    // as warnings until the app moves to React 19 + the compiler.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "node_modules/**", "next-env.d.ts"]),
]);
