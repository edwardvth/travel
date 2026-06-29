# Voyager — App Store Readiness (iOS) — Implementation Plan

> Plan for spec `docs/superpowers/specs/2026-06-29-voyager-app-store-readiness-design.md`.
> Build method: **subagent-driven-development** (opus implementer per task, spec + code-quality review,
> commit per task, push at checkpoints, keep the suite green). v1 = **free, no paywall**.
> 🖥️ = needs the Mac. 🪟 = Windows-only, do anytime. ⚙️ = owner action (account/portal), not code.

Legend for each task: **Goal · Files · Done-when**. Commit message ends with the Co-Authored-By trailer.

---

## Phase A — Foundations

### A1 ⚙️ Apple Developer + IDs  — *(decisions locked)*
- **Goal:** unblock everything downstream.
- **Do:** enroll in Apple Developer Program ($99/yr). Create the App ID with **bundle ID `ai.mypassage.app`**;
  store display name **`Passage: AI Travel Planner`**. Confirm `mypassage.ai` DNS is owned + `support@mypassage.ai` is monitored.
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
- **Do:** add `signInApple()` to `AuthProvider.tsx` (`signInWithOAuth({provider:'apple', options:{redirectTo}})`);
  add a "Continue with Apple" button to `routes/Auth.tsx` matching the Google button (SVG Apple mark, claret/gold
  tokens, ≥44px, aria-label, reduced-motion); update `Auth.test.tsx` to cover the new branch.
- **⚙️ companion (owner+me):** enable Apple provider in Supabase; create Services ID + Sign in with Apple key
  (.p8) in the Apple portal; paste into Supabase. (Checklist below.)
- **Done-when:** Apple button renders + initiates OAuth; suite green; `tsc -b` clean; visual parity verified in `npm run dev`.

### B2 🪟 Delete account (R3)
- **Goal:** satisfy Guideline 5.1.1(v).
- **Do:**
  1. New Edge Function `supabase/functions/delete-account/index.ts` (service-role): auth caller from JWT →
     delete their trips/`trip_members`/`profiles` rows → `auth.admin.deleteUser(uid)`.
  2. Client: "Delete account" action in `AccountSettings.tsx` behind a `ConfirmDialog`; on confirm call the
     function, then reuse `signOut` teardown (clear `sb-*`, route to `/`).
- **Files:** `supabase/functions/delete-account/index.ts`, `app/src/components/AccountSettings.tsx`,
  `app/src/auth/AuthProvider.tsx` (export a small `deleteAccount()` helper).
- **⚙️ deploy:** `supabase functions deploy delete-account` against ref `wnpanbjzmcsvhfyjdczv`.
- **Done-when:** a test user deletes their account in-app; cannot sign back in; trips gone; tests cover the client branch.

### B3 🪟 Privacy / Terms / Support pages (R4, R5)
- **Goal:** hosted, linked, no placeholders.
- **Do:** add `/privacy-policy`, `/terms`, `/support` routes in `App.tsx` rendering token-themed Markdown content;
  link them from `AccountSettings` and the Auth screen footer. Draft copy via Termly, then review for accuracy
  (location, AI/Anthropic, Supabase/Pexels/Photon/Resend/ElevenLabs processors).
- **Files:** `app/src/App.tsx`, new `app/src/routes/{Privacy,Terms,Support}.tsx`, `AccountSettings.tsx`, `Auth.tsx`.
- **Done-when:** three routes return 200, real content, reachable in-app, no dead ends.

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

**Checkpoint:** a TestFlight-able build runs all core flows on a physical device.

---

## Phase D — Polish

### D1 🪟/🖥️ Native Sign in with Apple (recommended before final submit)
- **Do:** `@capacitor-community/apple-sign-in` → `supabase.auth.signInWithIdToken({provider:'apple',token})`;
  fall back to the B1 web flow on web. Store the Apple-provided name on first sign-in only (R6).
- **Done-when:** the native Apple sheet (Face ID) signs the user in on device.

### D2 🪟/🖥️ OTA live updates (removes the Mac for web-only changes)
- **Goal:** ship web/React changes to installed apps **without a Mac and without App Store review** — only
  *native* changes (plugins, icon, iOS config) then need a resubmission.
- **Do:** add a Capacitor live-update layer (**Capgo** self-serve, or Ionic Appflow Live Updates); on each
  `npm run build`, publish the new web bundle to the update channel; app fetches it on next launch. Confirm
  compliance with Apple 3.3.2 (interpreted-code updates that don't change the app's primary purpose — fine).
- **Done-when:** a web change deployed to the channel appears on a device build without rebuilding in Xcode.
- **Note:** one-time native setup (the plugin) needs the Mac; after that, releases are Mac-free.

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
5. Supabase → Auth → URL config: add native redirect (custom scheme / universal link) for C3.

## Risks / watch-items
- **OAuth-in-WebView (C3)** is the most likely integration snag — budget time; it's why B1 ships the web flow
  first (works in-shell) and D1 upgrades to native.
- **AI during review (E3)** — without a credited demo account, founder-gated AI looks broken → reject (R5/R6).
- **Worktree coordination** — other agents work on `main`; Phase B touches `Auth.tsx`/`AuthProvider.tsx`/
  `AccountSettings.tsx`/`App.tsx`. Coordinate or branch to avoid clobbering concurrent edits.
- **Bundle ID + name** are hard to change later — lock A1 before C1.

## Definition of done (v1)
App approved on the App Store: native shell, Sign in with Apple, in-app account deletion, hosted+linked
Privacy/Terms/Support, no placeholders, accurate listing, free (no IAP), AI working for the reviewer.
