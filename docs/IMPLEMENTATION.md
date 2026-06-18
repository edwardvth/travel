# Voyager — Implementation

**Companion to the vision spec:** `docs/superpowers/specs/2026-06-18-voyager-redesign-design.md`.
That doc is the vision (why + what it should feel like). **This doc is the build** (what to
ship, in what order, and how we know each piece is done).

**Definition of Done (every screen, all phases):**
- [ ] Matches the approved mockups / Identity Board tokens (color, type, spacing, radius).
- [ ] Passes the **Anti-Patterns / Kill AI Slop** check (spec §7) and the **Competitive Rule**
      ("what would Apple + Airbnb + Notion remove?", spec §6).
- [ ] Copy is in the **Voyager Voice** (spec §4).
- [ ] Accessibility & performance requirements met (spec §15): contrast, focus, 44px targets,
      reduced-motion, lazy images, 375/768/1024/1440.
- [ ] Works in **both light and dark**.
- [ ] No regression to the existing Supabase backend / data.

Per-phase, generate a detailed step-by-step plan via the `writing-plans` skill into
`docs/superpowers/plans/` when that phase begins.

---

## Build Priority (don't optimize early)

Work in this order, top to bottom. **Never sacrifice a higher item for a lower one** — never
trade functionality for polish.

1. **Correct behavior** (it works)
2. **Correct UX** (it's the right flow, fewest taps)
3. **Correct visuals** (matches tokens / mockups)
4. **Animation polish** (motion, micro-interactions)
5. **Performance optimization**

> Don't spend six hours tweaking shadows while a flow is still broken. Get to "correct,"
> then climb.

## Phase Gate (no ambitious skipping)

A phase **cannot begin** until the previous phase clears all of:

- [ ] Previous phase acceptance criteria pass.
- [ ] No major regression bugs remain.
- [ ] Legacy functionality parity verified (the new surface does everything the old one did).
- [ ] Visual QA approved (matches mockups / Identity Board, both light and dark).

If any gate fails, fix it before moving on — do not start the next phase.

---

## Phase 0 — Project scaffold (part of Phase 1 kickoff)

Scope: stand up the new front end without touching the backend.

- Vite + React + TypeScript app; Tailwind configured with the token theme (light/dark via
  CSS variables); fonts loaded (Fraunces, General Sans/Satoshi, JetBrains Mono).
- App shell + React Router routes (spec §11); base layout, theme toggle, error boundary.
- shadcn/ui installed; **21st.dev Magic MCP connected**; logo component from the backpack mark.
- Existing `@supabase/supabase-js` client + TanStack Query provider wired (read-only smoke test).
- Cloudflare Pages build serves the Vite output; PWA shell/service worker ported.

**Acceptance criteria**
- [ ] `npm run build` + deploy preview renders the app shell on Cloudflare Pages.
- [ ] Theme toggle flips light/dark using only tokens (no hard-coded colors).
- [ ] All three fonts render; no FOUT in production build.
- [ ] Supabase session + a trips read works through TanStack Query.

---

## Phase 1 — Foundation + first impression  ·  *ships the "wow"*

Surfaces: **Landing · Auth · Dashboard** (incl. new-trip sheet + sharing).

### Landing (`/`)
- [ ] Aspirational full-bleed hero with legibility scrims; glassy nav + "Get started".
- [ ] CTA is a destination search in the upper-center "sky."
- [ ] Below-fold *Plan · Walk · Remember* story with scroll-reveal (reduced-motion safe).
- [ ] **Metric:** a first-time visitor can state what Voyager is within seconds (no "what is this?").

### Auth (`/auth`)
- [ ] Email+password, Google OAuth, magic link, email-confirm, and URL-error handling all work.
- [ ] Single calm card; claret primary; clear loading/error/success states in Voyager Voice.

### Dashboard (`/trips`)
- [ ] Intent-led greeting ("Your next trip is in N days"); featured/next-trip hero with
      countdown and one-tap *Resume tour*.
- [ ] Upcoming/Past segmented control; featured editorial, rest scannable.
- [ ] Account menu, role/credits, share (invite link + email via `send-invite`), delete — all
      preserved and re-skinned.
- [ ] Beautiful empty state for zero trips.

### New trip
- [ ] 2-step sheet (*Where* → *When*) with date-range picker + live preview.
- [ ] Same slug/title/profanity/teaser rules; `create_trip` RPC; correct error messages.
- [ ] **Metric:** new user creates first trip in **under 60 seconds** (timed walkthrough).

**Phase 1 exit:** Landing + Auth + Dashboard are live, match the mockups, pass all
Definition-of-Done gates, and legacy `index.html` is routed through the new app.

---

## Phase 2 — Planner

Surfaces: **Itinerary · Stop detail · Search/Add · Maps · Settings · Hotel/Weather/Prebook.**

### Itinerary (`/trip/:id`)
- [ ] Day rail (chips mobile / vertical desktop); dense, scannable stop rows (planning-density rule).
- [ ] Drag-reorder; tap opens stop detail via shared-element transition.
- [ ] Inline add via smart search (existing AI + OSM); **add a stop in ≤3 taps.**
- [ ] Empty day → one-tap "Suggest a day for me."

### Stop detail (`/trip/:id/stop/:n`)
- [ ] Image, Fraunces title, AI history/facts/tips with skeletons (no fake delay).
- [ ] Map peek + Navigate + Mark-done; gallery; "not the right place?" correction; wikiTitle/coords preserved.

### Maps / Settings / extras
- [ ] Route map + all-map (Leaflet) in React; inline/split map on desktop.
- [ ] Settings: Trip · Data · AI · Units; members/invite + realtime + AI-proxy preserved.
- [ ] Hotel, weather strip, prebook re-skinned and compact.

**Phase 2 exit:** full planning flow works on the new stack; `Trip.html` planning views retired.

---

## Phase 3 — Live companion

Surfaces: **Live tour · Identify · Story · onboarding/PWA hardening.**

### Live tour (`/trip/:id/live`)
- [ ] Map-forward, big mono ETA/distance, bottom sheet of upcoming stops, approach alerts.
- [ ] GPS tracking, nearby OSM cards, walk history, high-accuracy shutter GPS preserved.
- [ ] **Metric:** a new user can navigate without reading instructions.

### Identify (`/trip/:id/identify`)
- [ ] Full-screen camera, single shutter, confident result card; refined correction picker.
- [ ] Landmark-vs-restaurant classification fixes preserved.

### Story (`/trip/:id/story`)
- [ ] Shareable editorial recap; polished read-aloud player; IG/FB captions preserved.
- [ ] **Metric:** users choose to share their recap unprompted.

### Hardening
- [ ] PWA/offline shell, onboarding/getting-started, performance pass.
- [ ] Remove all legacy single-file pages; final QA across devices and both themes.

**Phase 3 exit:** entire product on the new stack; legacy retired; all success metrics (spec §16) verified.
