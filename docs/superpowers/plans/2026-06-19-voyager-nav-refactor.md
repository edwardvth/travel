# Voyager Three-Tab Nav Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Fresh subagent per task (opus), two-stage review (spec → quality), commit per task. Anti-slop discipline: **SVG icons only (no emoji)**, tokens light+dark, a11y (44px, aria, focus mgmt), immutable saves, no `any`. Push at the checkpoints noted.

**Goal:** Refactor in-Voyage navigation from `Plan · Bookings · Map · Settings` (4 feature-tabs) to **`Plan · Guide · Trip`** (3 intent-tabs), reorganizing existing functionality under them without losing capability.

**Spec:** `docs/superpowers/specs/2026-06-19-voyager-nav-refactor-design.md` (Approved). Read it — especially the 5 product principles, the "Trip must never become a planning surface" guardrail, the UI language contract ("Need to reserve" / "Reserved" only), and the minimal-account-stopgap decision.

**Architecture:** Plan = build (today's split itinerary+map, unchanged) · Guide = live (aspirational teaser; Phase 3 builds it) · Trip = manage (new logistics dashboard, absorbs Bookings + trip-scoped Settings). Stops/stays are the single source of truth; Plan and Trip are read/write projections. Global settings (AI/units/theme) move to a Dashboard account menu. All additive in JSONB `data`/`config`; no backend/schema change.

**Tech stack:** Vite + React 18 + TS + Tailwind (token theming), React Router (nested), TanStack Query, Framer Motion, Leaflet, lucide-react. Tests: vitest. Branch: `voyager-redesign`.

**Verified context (don't re-derive):**
- Nav lives in `app/src/trip/PlannerLayout.tsx` (`sectionItems()` + desktop sidebar + mobile bottom bar; Plan is the index route, days are a sidebar list driven by `?day=N` via outlet `setActiveDay`).
- Routes in `app/src/App.tsx`: `/trip/:id` index=`Itinerary`, `bookings`=`Bookings`, `stop/:day/:n`=`StopDetail`, `map`=`TripMap`, `settings`=`Settings`.
- Reservation today = `stop.booking { status:'to_book'|'booked'; time?; note? }`; helpers in `app/src/trip/booking.ts` (`bookingStatus`, `setBooking`, `allBookings`); UI in `StopRow`/`StopDetail`/`StopList`/`Bookings.tsx`.
- Stay = `data.hotel`; typed/normalized in `app/src/trip/hotel.ts` (`normalizeHotel`, `hotelCoords`); shown via `StayCard.tsx`.
- `Settings.tsx` tabs: **Trip** (title/subtitle/dates/stay), **Data** (export/import/reset), **AI** (model + per-trip key, stored in `trip.config.aiModel`/`aiKey`), **Units** (`trip.config.units`). Helpers in `settings-helpers.ts` (`applyTripBasics`, `daysBetween`, `endDateFor`, `droppingDaysWithStops`, `parseImportedTrip`, `resetTripData`).
- **`aiModel`/`aiKey`/`units` are referenced only in `Settings.tsx` + `types.ts`** — no runtime consumer (AI key is server-side in the `ai-proxy` edge function). Moving them to a global store is therefore non-breaking.
- `app/src/components/AccountMenu.tsx` already exists on the Dashboard (avatar → name/email/role/credits/sign-out) — the natural home for global settings. `ThemeToggle.tsx` already handles theme.
- `app/src/trip/Itinerary.tsx` (the Plan view) uses `TripMapView` directly for its split map; `TripMap.tsx` is only the standalone Map-tab wrapper.

---

## Task order & push checkpoints

NR1 shell → NR2 reservation model → **push** → NR3 Guide → NR4 Trip(Stay+reservations) → NR5 Trip(Details+Manage) → **push** → NR6 Account menu → NR7 review+gate → **push + tag**.

---

### NR1 — Three-tab nav shell (structural; no behavior change yet)

**Files:** `PlannerLayout.tsx`, `App.tsx`; rename `Bookings.tsx`→`Trip.tsx`; new `Guide.tsx` (stub); delete `TripMap.tsx` + `TripMap.test.tsx`.

- In `PlannerLayout.tsx`, change `sectionItems()` to **Guide · Trip** (Plan stays implicit/index; the Day list stays nested under Plan in the sidebar and as mobile chips). Icons: Guide → `Compass`, Trip → `Briefcase` (or `Luggage`) from lucide. Update both the desktop sidebar and the mobile bottom bar (Plan · Guide · Trip). Keep `aria-current`, claret active state, 44px mobile targets.
- In `App.tsx`: index = `Itinerary` (Plan); add `guide` = `Guide`; rename `bookings`→`trip` = `Trip`; keep `stop/:day/:n`. **Remove** `map` and `settings` routes. Add **single-meaning redirects** (no dual routes): `bookings` → `../trip` (`<Navigate replace>`), `map` → index (`/trip/:id`), `settings` → `/trips` (Dashboard, where global settings now live).
- **Account affordance reachable in-trip:** render `AccountMenu` in `TripHeader.tsx` (it already receives the trip/user context path — wire `email`/`profile` like the Dashboard does via `useAuth` + `useProfile`). This gives a global account entry on both desktop and mobile without a nav slot.
- Create `Guide.tsx` as a minimal stub (`export default function Guide(){ return <div/> }`) — NR3 fills it. Rename `Bookings.tsx`→`Trip.tsx` keeping its current checklist working (update the component name + the `App.tsx` import; it still compiles against `booking.ts`).
- Delete `TripMap.tsx` + `TripMap.test.tsx` (the split map in Plan uses `TripMapView` directly; the standalone Map tab is gone).

**Guardrails:** Plan view unchanged; SVG only; tokens light+dark; redirects single-meaning; build/test/tsc green. Commit: `refactor(nav): three-tab shell (Plan·Guide·Trip), drop Map/Settings tabs, redirects`.

---

### NR2 — Reservation model & "Reserved" language (booking → reservation)  *(push after)*

**Files:** rename `booking.ts`→`reservation.ts` (+ `booking.test.ts`→`reservation.test.ts`); `types.ts`; `StopRow.tsx`, `StopDetail.tsx`, `StopList.tsx`, `Trip.tsx` (the renamed list); update imports in `App.tsx`/`PlannerLayout.tsx` if any.

- **Type** (`types.ts`, additive): `Stop.reservation?: { status: 'to_reserve' | 'reserved'; time?: string; confirmation?: string; note?: string }`. Keep `Stop.booking?` in the type for legacy reads.
- **Helpers** (`reservation.ts`, pure, unit-tested): `reservationStatus(stop): 'to_reserve' | 'reserved' | null` — read `stop.reservation`, else map legacy `stop.booking` (`to_book`→`to_reserve`, `booked`→`reserved`); `setReservation(stop, patch): Stop` (immutable merge; `null` clears, and also clears any legacy `booking`); `allReservations(trip): { dayIndex; stopIndex; stop; status }[]` (replaces `allBookings`). Update all tests.
- **UI language contract** — every user-facing string uses exactly **"Need to reserve"** / **"Reserved"** (and "Add to reservations" / "Reservation"). Remove all "book / booked / booking / commitment" from user-facing copy in `StopRow`, `StopDetail`, `StopList`, `Trip.tsx`. Add an optional **confirmation #** field in `StopDetail`'s reservation editor.
- Plan's per-stop reservation chip + actions now read/write via the new helpers (immutable `save`, edit-gated).

**Guardrails:** legacy `booking` still reads correctly (back-compat test); immutable; edit-gated; **grep proves no "book/booked/booking/commitment" remain in user-facing JSX**; build/test/tsc green. Commit: `feat(reservations): Reserved language + reservation model (legacy booking read-compat)`. **Push** after review.

---

### NR3 — Guide teaser

**File:** `Guide.tsx`.

- Build the **aspirational teaser** with the locked copy: heading **Guide**, "Your live travel companion.", "Guide becomes active while you're exploring your Voyage.", and a tasteful **"Coming in Phase 3"** treatment. Lead with an editorial hero; optionally a faint, non-interactive mock of the future live-guide UI (a styled "next stop" card + route line) to sell the dream. It must feel aspirational, **not** "unavailable/broken".
- SVG icons only (e.g. `Compass`/`Navigation`/`Footprints`), tokens light+dark, `prefers-reduced-motion` respected, no functionality. Reachable at `/trip/:id/guide`.

**Guardrails:** no dead/blank tab; a11y (headings, alt/aria); no emoji. Commit: `feat(guide): aspirational Phase-3 teaser surface`.

---

### NR4 — Trip dashboard ①: Stay + reservations

**Files:** `Trip.tsx` (rebuild), `hotel.ts` (extend), `types.ts` (Hotel), `StayCard.tsx` (show check-in/out in Plan).

- **Hotel type** (`types.ts` + `hotel.ts`): add `checkIn?: string`, `checkOut?: string`; keep `normalizeHotel` tolerant of legacy/string shapes; unit-test the new fields.
- **`Trip.tsx`** — rebuild as the logistics dashboard, sections **in this order**:
  1. **Stay** — editable hotel (name, address, **check-in / check-out** date inputs, notes), written immutably to `data.hotel` (this is the source-of-truth; preserve existing `lat/lng`). Empty state (edit): **"Add your hotel"**.
  2. **Upcoming** — `allReservations(trip)` sorted by date+time (use `dayDate(trip, dayIndex)` + `reservation.time`); during the trip lead with a **"Today"** group, else chronological. Each row: stop name · day label (`dayLabel`) · time; tap → `setActiveDay(dayIndex)` then navigate to `/trip/:id/stop/:day/:n`. Empty state: **"Your schedule is still empty"**.
  3. **Still to arrange** — reservations with status `to_reserve`; one-tap to mark **Reserved** (edit-gated). Empty state: **"Nothing reserved yet"**.
- **`StayCard.tsx`** (Plan): show check-in/out read-only when present (edited in Trip).
- **GUARDRAIL (critical):** Trip is a reflection + management layer only — **no stop reordering, no add-stop, no AI-suggest, no itinerary editing.** Toggling reservation status and editing Stay/details is allowed; shaping the itinerary is not.

**Guardrails:** immutable saves; edit-gated; view-only users see read-only state; meaningful empty states; SVG only; tokens light+dark; build/test/tsc green. Commit: `feat(trip): Stay + Upcoming + Still-to-arrange dashboard`.

---

### NR5 — Trip dashboard ②: Trip Details + Manage  *(push after)*

**Files:** `Trip.tsx` (add sections), `types.ts`/config (`notes`), reuse `settings-helpers.ts`.

- **Trip Details** — a read/edit **projection over `config`** (no second store): dates (first/last day), length (derived), **travel notes** (new `config.notes`), and an **Edit trip…** action opening a small editor for **title + dates** (reuse `applyTripBasics` + `daysBetween`/`endDateFor` + the `droppingDaysWithStops` confirm flow from the current Settings Trip tab). All fields map directly to `config`.
- **Manage this trip** — **collapsed by default, expands only on explicit user action**. Contains: Export JSON, Import JSON, Reset trip (move these from the Settings **Data** tab as-is, helpers unchanged), and **Delete trip** (wire to the existing Dashboard delete path if present; else omit with a `// TODO` note). Duplicate/Archive are future — omit (don't stub fake buttons).
- After this task, **`Settings.tsx`'s Trip + Data tabs are fully represented in Trip**; the AI + Units tabs move in NR6.

**Guardrails:** projection (no duplicate state); collapsed-by-default Manage; immutable; edit-gated; build/test/tsc green. Commit: `feat(trip): Trip Details (config projection) + collapsible Manage`. **Push** after review.

---

### NR6 — Global account menu + retire in-Voyage Settings

**Files:** `AccountMenu.tsx` (extend), new `app/src/data/useAccountSettings.ts` (or similar), `ThemeToggle.tsx` (reuse), delete `Settings.tsx` + `Settings` route already removed (NR1).

- **Global store** (`useAccountSettings`) — persist `{ aiModel?, aiKey?, units? }` in `localStorage` keyed per user id (theme stays in the existing `ThemeToggle` mechanism). Since nothing currently consumes `trip.config.aiModel/aiKey/units` at runtime (verified), this is a clean move with **no consumer migration**; optionally seed initial values from the user's most recent `trip.config` for continuity (nice-to-have, not required).
- **AccountMenu** — expand the existing avatar menu (Dashboard) into a small **account settings** surface: **AI model · API key · units · theme**, plus **Subscription · Privacy · Help** stubbed as disabled "Coming soon" rows. Keep it compact and on-brand. The same `AccountMenu` is already wired into `TripHeader` (NR1), so it's reachable in-trip too — but it remains **global**, never trip-scoped.
- **Delete `Settings.tsx`** (its Trip/Data content now lives in Trip; AI/Units now live here). Confirm no remaining imports.

**Guardrails:** global not trip-scoped; AI key reachable; a11y (labelled inputs, focus mgmt, 44px); SVG only; tokens light+dark; **review greps that nothing still imports `Settings.tsx` and that AI suggestions still work** (manually exercise once). Commit: `feat(account): global account menu (AI/units/theme), retire in-Voyage Settings`.

---

### NR7 — Polish, holistic review & gate  *(push + tag)*

- Dispatch a **holistic reviewer** (opus, read-only) over `git diff <NR1-base>..HEAD -- app/src`: verify the spec's 5 principles, the **Trip-not-a-planner guardrail**, the **UI language contract** (no book/booked/booking/commitment in UI), one-data-model/projection (no duplicated state), Stay/reservation lens consistency (toggle in Plan ⇄ Trip), meaningful empty states, redirects single-meaning, a11y (focus traps on sheets/menus, 44px, aria), tokens light+dark, no emoji, immutable saves, no `any`, legacy back-compat (old `booking`, string `hotel`, missing `config`).
- Fix all Critical/Important findings (polish implementer). Final gate: `cd app && npm test` (all pass) · `npx tsc -b` (clean) · `npm run build` (succeeds) · emoji grep clean.
- Commit fixes; **push**; tag `phase-3-nav-refactor`.

---

## Acceptance criteria (whole plan)

- In-Voyage nav = exactly **Plan · Guide · Trip** (desktop sidebar + mobile bottom bar); no Bookings/Map/Settings tabs. Legacy routes redirect single-meaning.
- **Plan** keeps the split map, Stay card, reservation chips, weather, walk-times — behavior unchanged.
- **Guide** is a polished aspirational teaser (Phase-3 copy), not a dead tab.
- **Trip** aggregates the same stop/stay data (Stay · Upcoming · Still to arrange · Trip Details · Manage); a reservation toggled in Plan reflects in Trip and vice-versa; Trip never edits the itinerary.
- Reservation UI uses only "Need to reserve" / "Reserved"; legacy `booking` trips still display.
- Global settings (AI model/key, units, theme) live in the Dashboard account menu and stay reachable; trip-scoped settings live in Trip; no in-Voyage Settings tab.
- Anti-slop throughout (SVG only, tokens light+dark, a11y, immutable, no `any`); tests + tsc + build green.

## Out of scope (per spec)

- Real Guide functionality (GPS/narration/audio/wander) — Phase 3.
- Free-standing (non-stop) reservations — future stop *types* first.
- Full account surface (subscription/privacy/help, dedicated settings page) — later effort; only the stopgap ships now.
- Expense tracking, document vault, passport upload — excluded.
