# Passage — App Store Readiness (iOS) — Implementation Plan

> Plan for spec `docs/superpowers/specs/2026-06-29-passage-app-store-readiness-design.md`.
> Build method: **subagent-driven-development** (opus implementer per task, spec + code-quality review,
> commit per task, push at checkpoints, keep the suite green). v1 = **free, no paywall**.
> 🖥️ = needs the Mac. 🪟 = Windows-only, do anytime. ⚙️ = owner action (account/portal), not code.

Legend for each task: **Goal · Files · Done-when**. Commit message ends with the Co-Authored-By trailer.

---

## Phase A — Foundations

### A1 ⚙️ Apple Developer + IDs  — *(decisions locked)*
- **Goal:** unblock everything downstream.
- **Do:** enroll in Apple Developer Program ($99/yr). Create the App ID with **bundle ID `ai.mypassage.app`**;
  store name **`Passage`** (placeholder), subtitle **`Plan trips day-by-day with AI`**. (`mypassage.ai` is live;
  owner to set up the `support@mypassage.ai` mailbox.)
- **Done-when:** developer account active; App ID `ai.mypassage.app` created.

### A2 🪟 Capacitor scaffolding (no Mac)
- **Goal:** add Capacitor to the repo without building iOS yet.
- **Do:** in `app/`, install `@capacitor/core @capacitor/cli @capacitor/ios`; create `capacitor.config.ts`
  (`appId:'ai.mypassage.app'`, `appName:'Passage'`, `webDir:'dist'`); add `cap:sync`/`cap:open` npm scripts;
  `.gitignore` the generated `ios/App/Pods` etc. Document the build flow in `handoff.md`.
- **Files:** `app/package.json`, `app/capacitor.config.ts`, `app/.gitignore`, `handoff.md`.
- **Done-when:** `npm run build` still clean; `npx cap --version` works; config committed. (iOS folder added in C1.)

---

## Phase B — Apple compliance in-app (all 🪟 Windows)

### B1 🪟 Sign in with Apple — web flow (R2)
- **Goal:** satisfy Guideline 4.8.
- **Do:** add `signInApple()` to `AuthProvider.tsx` (`signInWithOAuth({provider:'apple', options:{ redirectTo: getAuthRedirectTo() }})` — see B1.5);
  add a "Continue with Apple" button to `routes/Auth.tsx` matching the Google button (SVG Apple mark, claret/gold
  tokens, ≥44px, aria-label, reduced-motion); update `Auth.test.tsx` to cover the new branch.
- **⚙️ companion (owner+me):** enable Apple provider in Supabase; create Services ID + Sign in with Apple key
  (.p8) in the Apple portal; paste into Supabase. (Checklist below.)
- **Done-when:** Apple button renders + initiates OAuth; suite green; `tsc -b` clean; visual parity verified in `npm run dev`.

### B1.5 🪟 Auth redirect abstraction (designed NOW, not in the Mac phase)
- **Why:** the native deep-link strategy touches `AuthProvider.tsx`, Supabase allowed-redirect URLs, the Apple
  Services ID return URL, magic links, AND Google OAuth — so it must be decided while wiring B1, not deferred to
  C3. (Supabase requires deep linking for native OAuth/magic-link redirects; Capacitor recommends Universal Links
  with a custom-scheme fallback for v1.)
- **Do:** add a shared `getAuthRedirectTo()` helper (e.g. `app/src/auth/redirect.ts`) that returns the **web
  callback** in a browser and the **native callback target** under Capacitor (`Capacitor.isNativePlatform()`).
  Route `signIn*`/`magicLink` through it. Document the web + native callback URLs (custom scheme `ai.mypassage.app://`
  and/or Universal Link `https://mypassage.ai/auth/callback`) so Supabase URL config + the Apple Services ID return
  URL can be set up before the native build. **Decide scheme-vs-Universal-Link here** (recommend custom scheme for v1
  speed; Universal Link as a follow-up).
- **Files:** `app/src/auth/redirect.ts` (new), `AuthProvider.tsx`, unit test for the branch.
- **Done-when:** all auth entry points use `getAuthRedirectTo()`; web behaviour unchanged; native callback URLs
  documented in this plan + the Apple/Supabase checklist; `tsc -b` clean; suite green. (On-device verification is C3.)

### B2.5 🪟 Deletion data inventory + Apple revoke design (do BEFORE B2's function)
- **Why:** Apple requires deletion to remove the **entire account record + associated personal data** (not
  deactivate), and apps using Sign in with Apple must **revoke the Apple token** on account deletion. Build the
  map before the code so nothing is missed.
- **Do:** enumerate every user-owned row/asset keyed to the account and the deletion order (FK-safe):
  `trips` · `trip_members` · `profiles` · user-owned **storage** assets (cover images / uploaded photos) ·
  **invite** rows · onboarding / preference rows · any AI- or user-generated rows tied to the account.
  **Exclude** shared global caches that are not personal (e.g. `video_cache`, trip-agnostic enrichment cache).
  Define the **Apple token revocation** step (`https://appleid.apple.com/auth/revoke`, when provider==apple).
- **Files:** `docs/superpowers/notes/delete-account-data-map.md` (artifact B2 implements).
- **Done-when:** the inventory is reviewed + complete; deletion order + Apple-revoke path documented.

### B2 🪟 Delete account (R3)
- **Goal:** satisfy Guideline 5.1.1(v) — full account-record removal, not deactivation.
- **Do:**
  1. New Edge Function `supabase/functions/delete-account/index.ts` (service-role): auth caller from JWT →
     **if the user signed in with Apple, revoke the Apple token** (`auth/revoke`) where available →
     delete **all rows/assets from the B2.5 inventory** (FK-safe order) → `auth.admin.deleteUser(uid)`.
  2. Client: "Delete account" action in `AccountSettings.tsx` behind a `ConfirmDialog`; on confirm call the
     function, then reuse `signOut` teardown (clear `sb-*`, route to `/`).
- **Files:** `supabase/functions/delete-account/index.ts`, `app/src/components/AccountSettings.tsx`,
  `app/src/auth/AuthProvider.tsx` (export a small `deleteAccount()` helper).
- **⚙️ deploy:** `supabase functions deploy delete-account` against ref `wnpanbjzmcsvhfyjdczv`.
- **Done-when:** a test user deletes their account in-app; cannot sign back in; **every B2.5 table/asset is gone**
  (verified by query); **Apple token revoked** for Apple-auth users; tests cover the client branch.

### B3.5 🪟 Privacy data inventory (do BEFORE generating any copy)
- **Why:** Apple requires the privacy policy + App Privacy labels to identify **what data is collected, its
  uses, third-party processors, retention/deletion, and the deletion/revocation path.** Map the real data flows
  first; only then write copy — so we never claim data we don't collect or omit something we do.
- **Do:** produce the data map covering exactly what Passage does in production:
  - **Account info:** email, name, auth provider.
  - **Location:** only when using Guide/location features (foreground).
  - **User content:** trips, destinations, itinerary items, prompts/preferences.
  - **AI processing:** the actual provider (Anthropic via `ai-proxy`) — what prompt content is sent.
  - **Processors:** Supabase, Pexels, Photon/OSM, Resend, ElevenLabs — **include only those actually live in prod**.
  - **Deletion:** the in-app delete-account path (B2) + Apple token revoke.
  - **Tracking:** none (no ad/tracking SDKs) — confirm before claiming it.
- **Files:** `docs/superpowers/notes/privacy-data-map.md`.
- **Done-when:** map reviewed; matches actual code; ready to drive both the policy copy and the E1 privacy labels.

### B3 🪟 Privacy / Terms / Support pages (R4, R5)
- **Goal:** hosted, linked, no placeholders — accurate to the B3.5 inventory.
- **Do:** add `/privacy-policy`, `/terms`, `/support` routes in `App.tsx` rendering token-themed Markdown content;
  link them from `AccountSettings` and the Auth screen footer. Generate a Termly first draft, then **reconcile it
  line-by-line against the B3.5 data map** (location, AI/Anthropic, live processors only, deletion + Apple revoke).
- **Files:** `app/src/App.tsx`, new `app/src/routes/{Privacy,Terms,Support}.tsx`, `AccountSettings.tsx`, `Auth.tsx`.
- **Done-when:** three routes return 200, real content matching B3.5, reachable in-app, no dead ends.

### B4 🪟 Remove placeholder UI (R5)
- **Goal:** nothing reads "coming soon" / unfinished to a reviewer.
- **Do:** remove or properly wire the `COMING_SOON` rows in `AccountSettings.tsx` (Subscription/Privacy/Help) —
  Privacy/Help now point at the real B3 pages; Subscription row removed for the free v1. Sweep for other stubs.
- **Done-when:** no placeholder affordances in any user-reachable screen.

**Checkpoint:** push Phase B to `origin/main`; suite green; `npm run build` clean. *(Web app fully Apple-compliant even before native shell.)*

---

## Phase C — Native build (🖥️ Mac session #1)

### C1 🖥️ Generate iOS project
- **Do:** `npm run build && npx cap add ios && npx cap sync`. Open in Xcode, set team/signing, bundle ID from A1.
- **Done-when:** app launches in the iOS Simulator showing the live web app.

### C2 🖥️/🪟 Native plugins + assets
- **Do:** add `@capacitor/geolocation`, `@capacitor/splash-screen`, `@capacitor/status-bar`; wire the Guide to
  use native geolocation when on-device; generate **app icon** + **launch screen** from the brand mark;
  add `NSLocationWhenInUseUsageDescription` to `Info.plist`.
- **Done-when:** native splash + icon show; location permission prompts; Guide gets a fix on device.

### C3 🖥️/🪟 OAuth return-into-app (the gotcha)
- **Goal:** Google/Apple/magic-link redirects land back **inside** the native app, not a stranded browser.
- **Do:** configure a custom URL scheme / universal link (or use `@capacitor/browser` in-app flow); align
  Supabase `redirectTo` + allowed redirect URLs; test each sign-in method end-to-end in the shell.
- **Done-when:** all sign-in methods complete inside the app and route to `/trips`.

### C4 🖥️/🪟 Native Sign in with Apple — platform-adaptive (moved up from Phase D)
- **Why moved before the checkpoint:** Supabase recommends native platforms use the native Apple capability, and
  **Apple returns the user's full name only on the FIRST authorization** — so this must be tested on-device before
  reviewer/demo-account setup, not after.
- **Goal:** native Apple sheet on iOS, web OAuth on desktop (locked decision).
- **Do:** add `@capacitor-community/apple-sign-in` → `supabase.auth.signInWithIdToken({provider:'apple',token})`;
  `signInApple()` branches on `Capacitor.isNativePlatform()` → native sheet on device, the B1 web flow on
  desktop/browser. **Capture + persist the Apple-provided name on first sign-in only** (R6).
- **Done-when:** the native Apple sheet (Face ID) signs the user in on a device and the name is stored on first
  auth; desktop still uses the web flow.

**Checkpoint:** a TestFlight-able build runs all core flows on a physical device — **including native Sign in
with Apple (first-auth name capture) and full account deletion (with Apple token revoke).**

---

## Phase D — Polish

### D1 — Native Sign in with Apple → **moved to C4** (now before the TestFlight checkpoint).

### D2 🪟/🖥️ OTA live updates — **OPTIONAL, recommend POST-approval**
- **Goal:** ship *safe* web-bundle changes to installed apps without a Mac. Defer until after v1 is approved
  unless genuinely needed sooner — it adds review surface area, so don't risk the first submission on it.
- **Allowed scope (Apple 3.3.2 / Guideline 2.5.2):** OTA may ship **only** JS/asset changes that **do not change
  Passage's primary purpose, do not unlock new paid functionality, do not bypass App Review, and do not introduce
  materially new native-facing features.** Use for: bug fixes, copy, UI polish, small React changes, content.
  **Still require a full App Store build:** native plugins, new permissions, payment/auth-capability changes, or
  any major feature change.
- **Do:** add a Capacitor live-update layer (**Capgo** self-serve, or Ionic Appflow Live Updates); publish the new
  web bundle to a channel on `npm run build`; app fetches on next launch.
- **Done-when:** a compliant web-only change deployed to the channel appears on a device build without an Xcode
  rebuild. (One-time native plugin setup needs the Mac; after that, in-scope releases are Mac-free.)

### D3 🪟 QA sweep (R5)
- **Do:** walk every screen for empty states, broken links, dead ends; verify reduced-motion, a11y, light/dark.
- **Done-when:** no broken/empty/placeholder states; checklist in handoff ticked.

---

## Phase E — Submit (🖥️ Mac session #2–3, ⚙️ owner)

### E1 ⚙️ App Store Connect record + privacy labels
- App record, category Travel, age rating; privacy "Nutrition Label": declare **location**, **account/contact
  info**, **user content**; **no tracking**.

### E2 ⚙️ Screenshots + description
- Real-app screenshots (required iPhone sizes): Home, Plan, a rich Stop, Guide. Accurate description; links to
  Privacy/Terms/Support.

### E3 🖥️ Build, upload, TestFlight, submit
- Archive in Xcode → upload → TestFlight self-test (sign up, **every** sign-in provider, create travel, plan,
  Guide+location, **delete account**, sign out) → submit for review.
- **Review notes:** provide a **founder/credited demo account** so AI ("Suggest a day") works for the reviewer.

---

## Apple-portal / Supabase checklist (for B1 + A1, do once)
1. Apple Developer → **Identifiers → App ID**: enable *Sign in with Apple*.
2. **Services ID** (for web OAuth) with return URL = Supabase auth callback.
3. **Keys → Sign in with Apple key** (.p8) → note Key ID + Team ID.
4. Supabase → Auth → Providers → **Apple**: paste Services ID, Team ID, Key ID, .p8.
5. Supabase → Auth → URL config: add the native redirect (custom scheme `ai.mypassage.app://` / Universal Link)
   **decided in B1.5**; on-device verification happens in C3.

## Risks / watch-items
- **OAuth returning to Safari instead of the app** is the #1 native snag — mitigated by designing the redirect
  abstraction in **B1.5** (not deferring to the Mac phase), shipping the web flow in B1, and upgrading to native
  Apple in **C4**. On-device verification is C3.
- **Incomplete account deletion** — guarded by the B2.5 inventory + Apple token revoke verified at C4 checkpoint.
- **OTA over-reach** — D2 is optional/post-approval and scope-limited; never ship feature/auth/payment changes OTA.
- **AI during review (E3)** — without a credited demo account, founder-gated AI looks broken → reject (R5/R6).
- **Worktree coordination** — other agents work on `main`; Phase B touches `Auth.tsx`/`AuthProvider.tsx`/
  `AccountSettings.tsx`/`App.tsx`. Coordinate or branch to avoid clobbering concurrent edits.
- **Bundle ID + name** are hard to change later — lock A1 before C1.

## Definition of done (v1)
App approved on the App Store: native shell, Sign in with Apple, in-app account deletion, hosted+linked
Privacy/Terms/Support, no placeholders, accurate listing, free (no IAP), AI working for the reviewer.
