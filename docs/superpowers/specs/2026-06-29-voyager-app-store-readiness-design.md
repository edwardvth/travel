# Voyager — App Store Readiness (iOS) — Design Spec

> **Status:** Draft for owner approval · **Date:** 2026-06-29
> Goal: get Voyager (Passage) submitted to and approved on the Apple App Store as a **free, no-paywall v1**.
> Read `CLAUDE.md` + `handoff.md` first. This spec defines *what* and *why*; the matching plan
> (`docs/superpowers/plans/2026-06-29-voyager-app-store-readiness.md`) defines *how / task order*.

## 1. The core problem this spec solves

Voyager is a **web app** (React + Vite, served as a website by a Cloudflare Worker). **Apple does not
accept websites** — only native apps built with Xcode. So shipping to the App Store is two problems, not one:

1. **Packaging** — wrap the existing web app in a native iOS shell so there is a real `.ipa` to submit.
2. **Compliance** — satisfy the specific App Review guidelines that apply to an account-based travel app.

We solve packaging with **Capacitor** (Ionic) — it wraps our existing `app/dist` build in a native
WKWebView container, exposes native plugins, and produces an Xcode project. **No rewrite.** The web app
remains the single source of truth; iOS is a thin native host around it.

### Non-negotiable external prerequisites (owner-owned, not code)
- **Apple Developer Program** — $99/yr. Required for TestFlight + submission.
- **A Mac with Xcode** — owner will borrow a friend's Mac. Needed only for: one-time iOS project
  generation, and each TestFlight/App Store build. **All web/React work continues on Windows.**
- **Hosted legal + support pages** — Privacy Policy, Terms of Service, support email (see §6).

## 2. Decisions locked

- **v1 is FREE, no paywall, no In-App Purchase.** AI stays founder/credits-gated as today; we do **not**
  sell credits in-app for v1. This sidesteps Apple Guideline 3.1.1 (IAP) entirely and keeps the first
  review minimal. Paid tiers + StoreKit IAP are an explicit **future** spec, not this one.
- **Packaging tech = Capacitor** (not React Native, not a hand-rolled WKWebView). Keeps one codebase.
- **Build cadence = batch the Mac.** Develop on Windows; produce signed builds in 2–3 Mac sessions.
- **OTA live updates (e.g. Capgo / Ionic Appflow) WILL be added** (Phase D) so web-only changes ship
  without a Mac and without App Store review. After this, only *native* changes need the Mac. This is the
  answer to "do I need a Mac for every update": **no — only for native changes.** (See §7 / Phase D.)
- **Bundle ID = `ai.mypassage.app`** (reverse of the owned domain `mypassage.ai`; permanent, never changes).
- **Store listing fields** (Apple's hard limits — each field has its own job; the title is NOT a tagline):
  - **Name (≤30)** = `Passage` *(placeholder — owner to refine later).*
  - **Subtitle (≤30)** = `Plan trips day-by-day with AI` (29 chars).
  - **Keywords (≤100, hidden)** = comma-list, set in Phase E (trip planner, itinerary, travel guide, vacation, AI, maps…).
  - **Description line 1 / promo** = `Passage — Plan personalized trips day-by-day with AI` (the owner's full tagline lives here, where length is fine).
- **Support = `support@mypassage.ai`** (chosen; owner to set up the mailbox).
- **Domain = `mypassage.ai` is LIVE** (the app was renamed Passage; worker still named `voyager`; also at
  voyager.edwardvth.workers.dev). Legal at `mypassage.ai/privacy-policy`, `/terms`, `/support` (in-app routes).
- **Sign in with Apple = platform-adaptive:** **native Sign in with Apple sheet on iOS (in the Capacitor app)**,
  **web OAuth flow on desktop/browser**. Phase B ships the web flow first (works everywhere incl. in-shell, unblocks
  Guideline 4.8); Phase D adds the native sheet + the platform switch (native on device, web on desktop).

## 3. The rejection risks we are explicitly designing against

These are the guidelines most likely to reject a first wrapped-web-app submission. Each maps to a build item.

| # | Guideline | Risk for us | Our mitigation |
|---|-----------|-------------|----------------|
| R1 | **4.2 / 4.2.3 Minimum Functionality** | "This is just a repackaged website." The #1 rejection for webview wrappers. | Route real native capability through Capacitor plugins — **native Geolocation** (the Guide live-companion is genuinely app-like), native Splash/Status Bar, app icon, offline resilience. Lean on the Guide as the app-native hero. |
| R2 | **4.8 Login Services** | We offer Google login → Apple **requires** Sign in with Apple as an equal option. | Add **Sign in with Apple** to the auth screen (§4). |
| R3 | **5.1.1(v) Account Deletion** | Any app with sign-up MUST offer in-app account deletion. We only delete *trips* today. | Build **in-app "Delete my account"** (§5). |
| R4 | **5.1.1 / 5.1.2 Privacy** | Missing/placeholder Privacy Policy → reject. App accesses **location** + collects account data. | Hosted Privacy Policy + ToS, linked in-app and in the listing. Location usage strings in Info.plist (§6, §7). |
| R5 | **2.1 / 2.3 Completeness & Accuracy** | Broken links, empty states, screenshots not matching the app, "coming soon" stubs. | Pre-submission QA pass; remove/hide placeholder UI (`AccountSettings` "coming soon" rows); screenshots from the real app. |
| R6 | **5.1.1(vii) Sign in with Apple data** | If using Apple login, must handle the private-relay email + name correctly. | Use Supabase Apple provider / native id-token flow; store name on first sign-in only (Apple sends it once). |

## 4. Sign in with Apple (R2) — design

**Current:** `AuthProvider.tsx` exposes `signInGoogle()` via `supabase.auth.signInWithOAuth({provider:'google'})`
(web redirect flow). `routes/Auth.tsx` renders a "Continue with Google" button under the email form.

**Add:** a `signInApple()` to the same provider with a **"Continue with Apple"** button above/below Google,
matching the existing glass-card aesthetic (claret/gold tokens, ≥44px, aria-labelled, the Apple logo mark
as SVG — never emoji, per anti-slop). Visual parity with the Google button.

**Final behaviour = platform-adaptive** (locked): **native Apple sheet on iOS device, web OAuth on desktop.**
A single `signInApple()` branches on `Capacitor.isNativePlatform()`.
- **Phase B (web flow first):** `supabase.auth.signInWithOAuth({ provider: 'apple', options:{ redirectTo } })`.
  Works in the browser **and** inside the Capacitor WebView for the first submittable build. Lowest effort,
  unblocks Guideline 4.8 immediately, and is the **permanent desktop path**.
- **Phase D (native flow — before final submit):** on iOS, the native **Sign in with Apple** sheet via
  `@capacitor-community/apple-sign-in`, exchanged into Supabase with `signInWithIdToken({ provider:'apple', token })`
  (the Face-ID sheet Apple expects on-device). `signInApple()` picks native vs web by platform.

**Supabase + Apple Developer setup (owner-assisted, one-time):** enable the Apple provider in Supabase;
in the Apple Developer portal create an **App ID** with the *Sign in with Apple* capability, a **Services ID**,
and a **Sign in with Apple key (.p8)**; paste the key/Service ID into Supabase. Documented as a checklist in the plan.

**Acceptance:** a user with no Google/email account can create an account and sign in entirely via Apple;
the Apple button matches house style + a11y; existing Google/email/magic-link flows untouched; tests cover
the new branch (mirror `Auth.test.tsx`).

## 5. In-app account deletion (R3) — design

**Current:** no account deletion. Trips delete via the owner-gated `delete_trip` RPC. Profiles table is
privilege-locked (`revoke update (role,credits)`).

**Design:** a **"Delete account"** action in the account surface (`AccountMenu` → `AccountSettings`), behind a
**typed/confirm `ConfirmDialog`** ("This permanently deletes your account, travels, and data. This cannot be
undone."). On confirm:

1. Client calls a new **`delete_account` Supabase Edge Function** (service-role; the client cannot delete an
   auth user directly, and `auth.admin.deleteUser` must run server-side). The function:
   - authenticates the caller from their JWT,
   - deletes the caller's `trips` (or transfers/cascades `trip_members`), their `profiles` row, and any owned
     rows keyed to their `user_id`,
   - calls `auth.admin.deleteUser(uid)`.
2. Client signs out + clears `sb-*` localStorage (reuse `signOut`'s teardown) → routes to `/`.

**Why an Edge Function (not client RLS):** account/auth-user deletion is privileged; doing it server-side is
the only correct + tamper-proof path, consistent with the existing `delete_trip` / `ai-proxy` server-side pattern.
Aligns with the owner's preference for **root-cause/structural** solutions over client-only band-aids.

**Acceptance:** a signed-in user can fully delete their account from inside the app; afterward they cannot sign
back in to the same account; their trips are gone; the flow is edit-gated, confirmed, and irreversible-by-design.

## 6. Legal + support assets (R4) — design

Three public, working URLs, linked **in-app** (account surface + auth screen footer) **and** in the App Store listing:

- **Privacy Policy** — must disclose: account data (email, name), trip content, **location** use (Guide), AI
  processing (prompts sent to Anthropic via `ai-proxy`), third-party processors (Supabase, Anthropic, Pexels,
  Photon/OSM, Resend, ElevenLabs), and analytics if any. Generate a first draft with **Termly**, then review
  for accuracy against what the app actually does (do not claim data we don't collect, don't omit location/AI).
- **Terms of Service** — Termly draft, reviewed.
- **Support** — a real, monitored email (e.g. `support@…`) and/or a simple support page.

**Hosting (locked):** in-app routes at `/privacy-policy`, `/terms`, `/support` (token-themed Markdown),
served from the production domain (`mypassage.ai` once migrated; `voyager.edwardvth.workers.dev` until then).
Listing + in-app links point at one canonical place and ship with the binary.

**Acceptance:** all three URLs return 200, contain no placeholder/"lorem ipsum", and are reachable from inside
the app (no dead ends — addresses R5).

## 7. Native shell (R1) — design

Capacitor wraps the existing build. Scope for v1:

- **Add Capacitor** to `app/`: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`; `capacitor.config.ts`
  with `appId` (e.g. `com.edwardvth.voyager` — owner confirms), `appName "Passage"`, `webDir: 'dist'`.
- **Native plugins for "app-likeness" (directly answers R1):**
  - `@capacitor/geolocation` — the Guide's live companion uses real native location (with permission prompt).
  - `@capacitor/splash-screen` + `@capacitor/status-bar` — native launch + themed status bar.
  - App **icon** + **launch screen** assets generated from the brand mark.
- **iOS project**: generated on the Mac (`npx cap add ios`), `Info.plist` usage strings:
  `NSLocationWhenInUseUsageDescription` ("Passage uses your location to guide you between stops on your travel.").
- **Routing note:** Capacitor serves the app from a local origin (e.g. `capacitor://localhost`). OAuth redirects
  (`redirectTo`) and Supabase deep links must be reviewed so Google/Apple/magic-link return into the app — this
  is the main integration gotcha and gets its own task (custom URL scheme / universal link or in-app browser).
- **Out of v1:** push notifications, offline tile bundling / Service Worker, App Tracking Transparency (no
  tracking SDKs), Android. All are explicit follow-ups.

**Acceptance:** the app runs in the iOS Simulator and on a device; location permission prompts and the Guide
gets a fix; sign-in (all methods) completes inside the native shell and returns the user to `/trips`.

## 8. Listing + submission (R5) — design

- **App Store Connect**: app record, bundle ID, name ("Passage"), subtitle, category (Travel), age rating,
  privacy "Nutrition Label" answers (declare: location, account/contact info, user content; no tracking).
- **Screenshots** from the **real app** (required iPhone sizes) — Home, Plan split view, a rich Stop, Guide.
  Must match actual UI (R5/§6 of the owner's guide).
- **Description** — accurate, no overhype, states what it does + who it's for; links to Privacy/Terms/Support.
- **TestFlight** self-test: install as a real user, exercise every flow (sign up, sign in via each provider,
  create a travel, plan, Guide w/ location, **delete account**, sign out) on device before submitting.
- **Review notes**: provide a demo account (founder-gated AI means the reviewer needs working AI — give them a
  founder/credited test account so "Suggest a day" works during review, else AI features look broken → R5/R6).

## 9. Phasing (summary; detail in the plan)

- **Phase A — Foundations (owner + light code):** Apple Developer enrollment; bundle ID; Capacitor scaffolding
  + config committed (no Mac needed for scaffolding).
- **Phase B — Apple compliance in-app (Windows, no Mac):** Sign in with Apple (web flow); Delete account
  (Edge Function + UI); Privacy/Terms/Support pages; remove placeholder "coming soon" UI.
- **Phase C — Native build (Mac session #1):** `npx cap add ios`; icons/splash; Info.plist; geolocation;
  fix OAuth-return-into-app; run in Simulator/device.
- **Phase D — Polish (Windows + Mac):** native Sign in with Apple flow; QA empty-states/links sweep.
- **Phase E — Submit (Mac session #2–3):** listing, screenshots, privacy labels, TestFlight, submit.

## 10. Open questions — RESOLVED 2026-06-29

1. ~~Bundle ID~~ → **`ai.mypassage.app`**.
2. ~~Display name~~ → **`Passage: AI Travel Planner`** (name) + subtitle/keywords for ASO.
3. ~~Support email~~ → **`support@mypassage.ai`** (owner to confirm it's monitored).
4. ~~Legal hosting~~ → **`mypassage.ai/privacy-policy`, `/terms`, `/support`**; recommend moving the
   production app to `mypassage.ai` (custom domain on the Worker).
5. ~~Apple flow~~ → **web flow first (Phase B) → native sheet before final submit (Phase D)**.

Remaining owner action: **acquire/confirm `mypassage.ai` DNS** and decide whether to migrate the Worker to it
now (recommended) or after v1.

## 11. Out of scope (explicit)

Android; push notifications; offline/Service-Worker bundling; In-App Purchase / paid tiers; App Tracking
Transparency / ad SDKs; deep marketing-site rebuild. Each is a candidate follow-up after v1 is approved.
