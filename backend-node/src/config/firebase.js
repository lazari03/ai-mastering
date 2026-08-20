import fs from "node:fs";

// firebase-admin's default namespace import (admin.credential.cert(),
// admin.auth(), admin.firestore()) was dropped as of the v12+ modular
// API — cert/initializeApp live in firebase-admin/app now, auth/firestore
// each in their own subpath. Verified against the actual installed
// package's exports (Object.keys), not documentation guesswork, same
// discipline as every other SDK integration in this project.
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

// Two ways to supply the service account, since deployment targets differ
// in whether they support arbitrary file uploads: a path to the JSON file
// downloaded from the Firebase console (local dev, most VMs/containers), or
// the JSON content itself inline in an env var (common on PaaS platforms
// where only env vars are configurable, e.g. some serverless hosts).
function loadServiceAccount() {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    return JSON.parse(inlineJson);
  }

  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path) {
    if (!fs.existsSync(path)) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH is set to '${path}' but that file doesn't exist.`);
    }
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  }

  throw new Error(
    "Firebase Admin needs credentials — set FIREBASE_SERVICE_ACCOUNT_PATH (path to the service account JSON " +
      "from Firebase console > Project settings > Service accounts) or FIREBASE_SERVICE_ACCOUNT_JSON (the same " +
      "file's content, inline) in backend-node/.env. See FIREBASE_SETUP.md."
  );
}

let app = null;

// Lazy init, not at module load — a missing/misconfigured credential
// shouldn't crash every route that imports this module, only the ones that
// actually need to verify a token. requireAuth() (auth.js) is what
// triggers this on the first real request.
export function getFirebaseApp() {
  if (!app) {
    const serviceAccount = loadServiceAccount();
    app = initializeApp({ credential: cert(serviceAccount) });
  }
  return app;
}

export function getAuth() {
  return getAdminAuth(getFirebaseApp());
}

export function getFirestore() {
  return getAdminFirestore(getFirebaseApp());
}
