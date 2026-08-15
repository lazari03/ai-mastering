# Firebase Auth Setup

Steps to follow in the Firebase console yourself — I can't create a project
or generate credentials from here. Once you've done this, hand me the two
things called out at the end and the integration (already built, see
`ARCHITECTURE.md` §7) will work.

## 1. Create the project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Name it (e.g. `ai-mastering` or whatever you want the project ID to be — the ID gets slugified from the name, you can edit it).
3. Google Analytics is optional — skip it unless you want it, it's not used by this integration.

## 2. Enable sign-in methods

1. In the left sidebar: **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable:
   - **Email/Password** — toggle it on, no further config needed.
   - **Google** — toggle it on, pick a support email (required), save.
3. Under **Settings → Authorized domains**, `localhost` is already there by
   default (covers local dev). Add your production domain here once you
   have one, or Google sign-in will fail on that domain with an
   `auth/unauthorized-domain` error.

## 3. Get the web app config (for the frontend)

1. **Project Overview → ⚙ Project settings → General**.
2. Scroll to **Your apps** → click the `</>` (web) icon → register an app
   (nickname doesn't matter, skip Firebase Hosting unless you want it).
3. It shows a `firebaseConfig` object — copy these six values into
   `frontend/.env.local` (see `.env.example` — I've already added the
   variable names, just fill in the values):
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
   NEXT_PUBLIC_FIREBASE_APP_ID=
   ```
   These are safe to expose client-side (that's what `NEXT_PUBLIC_` means
   and what they're designed for) — they identify the project, they don't
   grant access to anything by themselves.

## 4. Get a service account key (for the backend)

The backend needs to *verify* the ID tokens the frontend sends, which
requires admin credentials — a different, secret set of credentials that
must never reach the browser.

1. **Project settings → Service accounts** tab.
2. Click **Generate new private key** → confirm → a JSON file downloads.
3. Move that file somewhere safe **outside the git repo** (e.g.
   `~/secrets/ai-mastering-firebase.json`) — do not commit it, it grants
   full admin access to your Firebase project.
4. Point `backend-node/.env` at it:
   ```
   FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/ai-mastering-firebase.json
   ```

## 5. What to hand me

Once both of those are done, you don't need to hand me the actual secret
values — just confirm:
- "web config is in `frontend/.env.local`"
- "service account path is in `backend-node/.env`"

and I'll verify the integration boots and actually authenticates against
your real project (sign up, sign in, a protected API call succeeding/
failing correctly) before calling this done.
