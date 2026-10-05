// Fails loudly on an unsupported Node version, BEFORE anything native loads.
//
// better-sqlite3 (see jobsDb.js) declares engines.node >= 22. On Node 20 it
// does not throw an error — the process dies with SIGSEGV and prints
// nothing, and `node --watch` reports only "Failed running 'src/server.js'".
// That is an expensive thing to debug from scratch, and it is the exact
// failure a new machine or a CI runner on an older Node will hit.
//
// package.json's `engines` field only warns on install by default, so it
// documents the requirement without enforcing it at runtime. This does the
// enforcing.
//
// Imported FIRST in server.js on purpose: ESM evaluates imports in order,
// so this must come before any module that pulls in a native addon,
// otherwise the segfault happens before the check can run.
const MINIMUM_MAJOR = 22;
const major = Number(process.versions.node.split(".")[0]);

if (Number.isFinite(major) && major < MINIMUM_MAJOR) {
  console.error(
    `\nAuralith API requires Node >= ${MINIMUM_MAJOR}. This is Node ${process.versions.node}.\n\n` +
      `better-sqlite3 has no prebuilt binary for this version and will crash the\n` +
      `process with SIGSEGV and no error message rather than failing cleanly.\n\n` +
      `  nvm use ${MINIMUM_MAJOR}      (or: export PATH="$HOME/.nvm/versions/node/v${MINIMUM_MAJOR}.*/bin:$PATH")\n` +
      `  npm rebuild better-sqlite3\n`,
  );
  process.exit(1);
}
