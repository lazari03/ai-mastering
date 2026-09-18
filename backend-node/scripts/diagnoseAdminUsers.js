// One-off, read-only diagnostic for "the admin Users page shows no
// emails" — prints exactly what Firebase Auth's listUsers() actually
// returns in production, so the real cause (no users yet vs. a real bug
// in the merge/route path) is confirmed instead of guessed at.
import { getAuth } from "../src/config/firebase.js";

// Masked, not printed in full — this runs in a GitHub Actions log, which
// persists and is visible to anyone with repo access. The question this
// answers ("does listUsers() actually return email addresses") doesn't
// need the real address, just confirmation one is present.
function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = email.split("@");
  return `${local[0]}***@${domain}`;
}

async function main() {
  const auth = getAuth();
  const page = await auth.listUsers(20);
  console.log(`Total returned in this page: ${page.users.length}`);
  console.log(`Has next page: ${Boolean(page.pageToken)}`);
  for (const u of page.users) {
    console.log(
      JSON.stringify({
        uid: u.uid,
        email: maskEmail(u.email),
        providers: u.providerData.map((p) => p.providerId),
        disabled: u.disabled,
        creationTime: u.metadata?.creationTime || null,
      })
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Diagnostic failed:", error);
    process.exit(1);
  });
