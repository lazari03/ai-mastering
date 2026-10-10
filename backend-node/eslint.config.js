import globals from "globals";

// Deliberately narrow: catch identifiers that don't exist (no-undef), not
// style. node --check only proves syntax; an undefined variable in a rarely
// taken branch passes it and throws in production. That is how /master
// returned an error instead of a finished master whenever stem separation
// failed (a `jobId` that was never defined in that handler).
export default [
  {
    files: ["src/**/*.js", "scripts/**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node } },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: { "no-undef": "error" },
  },
];
