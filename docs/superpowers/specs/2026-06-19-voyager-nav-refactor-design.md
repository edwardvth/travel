# Voyager Navigation Refactor — Three-Tab Architecture (Plan · Guide · Trip)

> **Status:** Design (awaiting review) · **Date:** 2026-06-19 · **Supersedes** the Option C four-tab nav (`Plan · Bookings · Map · Settings`) shipped in `phase-2-planner-c`.

## Goal

Refactor the in-Voyage navigation from four feature-tabs to **three intent-tabs**, each representing a distinct traveler mindset, and reorganize existing functionality under them without losing capability.

## Product principles (locked — bake these into every decision)

1. **A tab is a mindset, not a feature.** Navigation represents traveler intent, not internal data structures.
2. **One data model, many lenses.** Plan and Trip are different views on the *same* stop/stay/reservation objects. No duplication, no sync layer — they share `data` and save immutably.
3. **Inside a Voyage, every primary screen helps the user plan, experience, or manage *this* trip.** Anything that doesn't serve the specific trip lives at the account/Dashboard level instead.

## The three tabs

| Traveler thought | Tab | Mindset |
|---|---|---|
| "How should this trip come together?" | **Plan** | Build it |
| "What should I do right now?" | **Guide** | Live it |
| "What have I committed to?" | **Trip** | Manage it |

Removed as primary destinations: **Bookings** (absorbed into Trip), **standalone Map** (Plan and Guide each carry their own map), **standalone Settings** (split by scope — see below).

---

## PLAN — build the itinerary  *(largely unchanged)*

The current split day-view (stops list + embedded map) stays as the primary planning surface. It owns the **contextual lens** on stay/reservation data.

**Owns:** day-by-day itinerary · add/reorder stops · AI suggestions · Do/Eat/Stay categories · walk-times between stops · weather glance · per-day **Stay card** · per-stop **reservation chip** ("Need to reserve" / "Reserved") · notes · the embedded planning map.

**Map philosophy:** the map supports planning; it is not a destination. The split-screen (map + itinerary on desktop, map-on-top + scrolling stops on mobile) remains.

**Change from today:** essentially none structurally — this is today's "Plan" view. Only the reservation wording updates (see Data model) and the Stay card/reservation chips are now understood as *lenses* whose source-of-truth is also surfaced in Trip.

---

## GUIDE — live the trip  *(teaser now; full build = Phase 3)*

Guide is Voyager's signature active-travel companion: navigate to the next stop, walking directions, historical/cultural narration, audio guide, progress through today, nearby recommendations, optional "wander mode." **Explore lives here** — discovery is part of traveling, not a separate mindset, so there is no separate Explore tab.

**Now (this refactor):** a **designed, aspirational teaser** — a polished surface that sells what Guide will be (styled preview of the live-guide UI, a short value statement, a tasteful "Available during your trip / Coming soon" treatment). No live functionality. Reduced-motion friendly, SVG icons, tokens light+dark.

**Boundary principle for when Guide is built (record now so Trip is designed correctly):** **Guide moves you** (in-motion, one next thing, map-forward, narrated). **Trip reassures you** (at-a-glance list of commitments, no navigation). Today's reserved items appear in both — as *steps to navigate* in Guide, as *commitments to confirm* in Trip.

**Out of scope here:** all real Guide functionality (GPS, narration, audio, wander) — that is Phase 3.

---

## TRIP — manage the trip  *(new; absorbs Bookings + trip-scoped Settings)*

The **logistics lens**: everything you've committed to, plus the trip's own facts and management. **Not** a document vault, **not** an expense tracker, **not** an airline replacement — we deliberately do **not** ask users to upload passports/boarding passes.

**Sections:**

- **Upcoming / commitments** — reservations sorted by date+time. During the trip this leads with "Today"; pre-trip it's the chronological list of what's reserved. Tapping an item deep-links to that stop in Plan.
- **Still to arrange** — reservations with status "Need to reserve" (replaces the old "To book" list). The actionable part, up top.
- **Stay** — hotel name, address, **check-in / check-out**, notes. Source-of-truth for the Stay card shown in Plan.
- **Trip details** — title, dates (start date, number of days / day labels).
- **Manage this trip** — export this trip, duplicate, archive, delete. (Quieter, secondary placement.)

**Lens relationship:** edits in Trip and Plan both write the same `data` objects and reflect instantly in both. A reservation toggled "Reserved" in Plan updates the Trip list, and vice-versa.

---

## Settings — split by scope, no in-Voyage Settings tab

**Account / Dashboard level** (above any single trip, reached from the Dashboard via a profile/account menu):
- AI preferences (model) · API key · units · theme · account/subscription.
- *Rationale:* these are global; the AI key especially must stay reachable since AI features depend on it. New: a Dashboard-level account settings surface (panel or page).

**Trip-specific** (in the **Trip** tab):
- Title · dates · stay details · reservations · export this trip · duplicate / archive / delete.

The dedicated Settings *tab inside a Voyage is removed.* Trip-scoped config moves into Trip; global config moves to the account level.

---

## Data model (additive; backward-compatible — all in JSONB `data`/`config`)

- **Reservation (per stop)** — extend the existing per-stop reservation object: `{ status: 'to_reserve' | 'reserved'; time?: string; confirmation?: string; note?: string }`. Read legacy `booking` (`to_book`/`booked`) as a fallback so existing trips keep working. User-facing language becomes **"Need to reserve" / "Reserved"** (drop "book/booked"); confirmation number optional.
- **Stay (`data.hotel`)** — extend with `checkIn?: string` and `checkOut?: string` (ISO date or date-time). Keep `normalizeHotel` tolerant of legacy shapes.
- **Trip details** — already in `config` (`title`, `startDate`, `numDays`/`dayLabels`/`dayTitles`); Trip edits these.
- No schema/backend change; no new tables. Realtime + RLS intact.

**Open scope question (decide at review):** v1 treats reservations as a **property of itinerary stops** (keeps "one data model, many lenses" clean). Non-stop logistics the teaser hints at (airport transfers, train tickets, bike rental not on the itinerary) would need either a lightweight free-standing reservation item or a "transport"-type stop. **Recommendation:** ship v1 stop-tied; treat free-standing reservations as a fast-follow once the lens model is proven.

---

## Layout

**Desktop — left sidebar:**
- **Plan** (with the **Day list** nested beneath it — days belong to Plan), **Guide**, **Trip**.
- A profile/account affordance at the bottom (→ Dashboard / account settings). Active state = claret (`bg-sig-btn`), `aria-current`.

**Mobile — bottom tab bar (3 tabs, 44px):** Plan · Guide · Trip. Day selection = chips atop Plan. Account settings reached via a top-bar avatar / back-to-Dashboard.

**Routes** (`App.tsx`): index `/trip/:id` = Plan · `/trip/:id/guide` = Guide · `/trip/:id/trip` = Trip · keep `/trip/:id/stop/:day/:n`. Redirect legacy `/bookings` → `/trip/:id/trip`, `/map` → Plan, `/settings` → `/trip/:id/trip` (trip-scoped) / account menu (global).

---

## What changes, file-level (existing build)

- `PlannerLayout.tsx` — nav from 4 → 3 (sidebar + bottom tabs); add account affordance.
- `Bookings.tsx` → **`Trip.tsx`** — expand the checklist into the Trip dashboard (Upcoming / Still to arrange / Stay / Trip details / Manage).
- `Map` tab/route — **removed** (the split map stays in Plan via `TripMapView`; keep a fullscreen-map affordance inside Plan if desired).
- `Settings.tsx` — **split**: trip-scoped pieces → Trip; account-scoped pieces → new Dashboard account settings; in-Voyage Settings route removed.
- Reservation copy/helpers — rename user-facing "book/booked" → "reserve/reserved"; add `confirmation`; keep `booking` read-compat in `booking.ts`.
- `StayCard` / `data.hotel` — add check-in/out (edited in Trip, shown in Plan).
- New **`Guide.tsx`** teaser surface + route.
- New **account settings** surface at the Dashboard level.

## Acceptance criteria

- In-Voyage nav shows exactly three tabs (Plan · Guide · Trip) on desktop sidebar and mobile bottom bar; no Bookings/Map/Settings tabs remain.
- Plan keeps the split map, Stay card, reservation chips, weather, walk-times — unchanged in behavior.
- Trip aggregates the same stop/stay reservation data; toggling a reservation in either Plan or Trip reflects in the other.
- Guide is a polished teaser (no dead/blank tab); reduced-motion + light/dark + SVG-only.
- Global settings (AI model/key, units, theme) reachable from the Dashboard; AI features still work. Trip-scoped settings live in Trip.
- Legacy trips with `booking`/string `hotel` still load and display correctly.
- Anti-slop throughout: SVG icons only (no emoji), tokens light+dark, a11y (44px targets, aria, focus management), immutable saves, no `any`. Tests + `tsc` + build green.

## Out of scope

- Real Guide functionality (GPS turn-by-turn, narration, audio, wander) — Phase 3.
- Expense tracking, document vault, passport/boarding-pass upload — explicitly excluded.
- Free-standing (non-stop) reservations — fast-follow, pending the review decision above.
