# Voyager Home — Phase 3: Progressive Command Pill (Design Spec)

- **Date:** 2026-06-27
- **Status:** Approved (brainstormed with owner via visual companion) — ready for implementation planning
- **Branch:** `home-pill-phase-3` (worktree off `main`)
- **Parent spec:** `docs/superpowers/specs/2026-06-24-voyager-home-context-redesign-design.md` (§7 "Trip creation — progressive command pill", §10 Phasing). This document **finalizes and, in two places, revises** that parent for the Phase-3 build.
- **Builds on (shipped & live):** State C cinematic launchpad + State B cockpit home (tags `cinematic-launchpad`, `state-b-cockpit-home`), suite at **734**.

---

## 1. Problem & goal

The "Where to next?" pill renders in the State-C hero, but its `onSubmit` just opens the legacy `NewTripSheet` (a 2-step modal sheet). Phase 3 turns the pill into the app's **sole, progressive trip-creation flow** — type a city, pick a date range inline, and **materialize directly into the planner** — and retires `NewTripSheet`.

**The pill's animation quality is "the magic layer."** If it feels like a form, it feels like flight-booking software. The interaction must read as one evolving sentence and the materialization as one continuous gesture.

This phase also **restructures the home** per owner direction (§5): the pill hero becomes the permanent top of a single unified home in both states, and the upcoming-trip cockpit becomes a section beneath it.

## 2. Non-goals

- No backend changes, no schema migration (all additive JSONB / existing edge functions).
- No change to the planner, Guide, or Trip internals (we only *land* in the planner's existing Plan view).
- No new global nav. The field-globe shader work is untouched.
- Not redesigning the trip gallery / `TripGrid` / tiles (reused as-is for "Your travels").

## 3. The pill interaction model (the four beats)

One single, centered, evolving pill — **never a row of fields, never a multi-step wizard**. Tokens already entered render as **chips** (the structured look the owner approved over plain evolving text).

1. **Intent.** Resting pill: animated "Where to next?" typewriter placeholder + claret CTA. (This is today's `HeroSearchPill`, essentially unchanged at rest.)
2. **Destination.** User types a city; **Photon autocomplete** suggestions overlay *below* the pill (absolute, never shifting layout). Selecting a suggestion (or accepting free text) sets the destination and **collapses it into a chip**. Reuses the autocomplete logic of `DestinationInput` / `usePlaceSearch`, restyled for the dark glassy pill.
3. **Dates.** After a destination exists, a muted **"When?"** affordance appears after the city chip (`[Kyoto]  |  When?`). Focusing it opens an **anchored range calendar** directly below the pill (attached to the sentence, not a page modal): **1st click = start, 2nd click = end**; soft claret range **band**, **gold** hover edge. Picking the end date snaps the calendar closed and renders the range as a **gold chip** (`Jul 14 → Jul 18`).
4. **Confirm.** The full sentence reads `[Kyoto]  [Jul 14 → Jul 18]  (Plan it →)`. A **restrained gold success pulse** fires. Commit on **Enter** or tapping the CTA.

**Guardrails:** always one centered sentence; the calendar belongs to the sentence; motion implies physics (breathing expand, gentle snap) — not panel slides. Dates are **optional** — confirming with a destination but no dates is allowed (creates an undated trip; `buildNewTripPayload` already defaults to 4 days when `start`/`end` are empty). A destination is **required** to confirm.

### 3.1 Cover prefetch on select (resolves the photo-timing constraint)

A brand-new trip has **no cover at creation**; covers resolve async (Wikipedia / `place-photo` chain) and can take seconds or fail. So:

- **The moment a city is selected** (an autocomplete suggestion is chosen, or the field commits to a resolved destination), kick off the **destination cover prefetch** — the existing `useBackfillCoverImage` / `place-photo` resolution, **fire-and-forget, cached by destination**. This happens *seconds* before the user finishes picking dates.
- By confirm-time the cover is **often already cached**, so the materialization seed can show the real photo. If it is **not** ready, the seed falls back to the **instant branded claret gradient** (zero network) and the real photo resolves in the planner afterward (where a skeleton→photo fade is normal).
- **The materialization never awaits the photo.** Cached → use it synchronously; otherwise → gradient. (Implementation note: the prefetch warms whatever cache `useBackfillCoverImage` already writes; the seed reads cache-only, never triggers a blocking fetch.)

## 4. Materialization — "Seed-card flight" (the magic layer)

On **confirm**, the trip is committed via the existing **`useCreateTrip`** and the app **navigates to the new trip's Plan view** (`/trip/:id`). The transition is a continuous shared-element-style morph (chosen over a shape-morph and a calm dissolve after prototyping):

**Choreography (full-motion path):**
1. The hero **headline + subcopy fade and shrink away first** (clearing the seed's flight path — this fixed an overlap the owner flagged).
2. The confirmed **pill crossfades into a small "seed card"** (cover + destination name + date range) at the pill's center. The seed is at rest pose so the fade-in triggers **no transform animation** (avoids a velocity-break stutter).
3. The home **dims and settles** (slight scale-down) and the **seed lifts in one single, uninterrupted transform** up to where the planner header will be.
4. The **planner eases in behind** while the seed is still arriving; the seed **dissolves on the header it becomes**, and **Day 1 unfurls** (rows / "Add your first stop" stagger in).

**Cross-route reality:** materializing means a route change (`/trip/:id`). The seed must survive the navigation, so it lives in a **fixed-position portal overlay** above the app that persists across the route swap, then hands off to the planner and unmounts. The planner mounts behind it during the lift.

**Reduced motion / fallback (built regardless):** `prefers-reduced-motion`, no-portal failure, or any abort → a **calm confident dissolve**: success beat, fast (~250ms) dim-and-dissolve to the planner, planner plays a tasteful entrance (header fades down, Day 1 staggers). This is also the safety net if the overlay handoff ever misfires — creation must always succeed even if the animation degrades.

**Invariant:** the animation is **cosmetic**. `useCreateTrip` commit + navigation is the source of truth; if the trip is created, the user **must** end up in the planner regardless of whether the morph played.

## 5. Unified home architecture (restructure)

> **Owner decision (revises the parent spec's two-separate-layouts framing):** the home is now **one layout**. The "Where to next?" hero + pill is the **permanent top** in both states. `selectFocusTrip` decides only whether a **middle section** renders.

Top → bottom:

1. **Hero + pill** — the cinematic "Where to next?" hero (clip-driven video, eyebrow, headline, the working pill). **Always present**, both states.
2. **Your next journey** *(State B only — when `selectFocusTrip(trips) !== null`)* — the focus trip as a **full-width section with its own destination video** as the section background, a glass status line (countdown · "still to arrange" · weather, from the existing `cockpitModel`), and an **"Open →"** primary action into the trip's Plan view. This **replaces** the shipped "Welcome back" cockpit *hero*; the cockpit content is **demoted to this section**. (Deliberate trade: creation is the front door even when a trip is upcoming.)
3. **Your travels** — the existing trip gallery (`TripGrid` / tiles). State C shows **past** trips; State B shows the full grouped list (minus the featured trip, as today).

**Consequence for the codebase:** `Dashboard` stops early-returning two fully separate components. Instead it renders one stacked page: `CinematicHero` (with the live pill) → optional `UpcomingJourney` section → travels. `CinematicLaunchpad` and `CockpitHome` are **refactored/merged** into this single composition (their reusable pieces — masked video hero, field-globe background, travels list, cockpit model — are retained; the cockpit *card-as-hero* framing is dropped). `selectFocusTrip` / `cockpitModel` / `home-groups` view-models are unchanged.

### 5.1 Header "+ New trip" visibility rule

The header **"+ New trip"** button is **redundant whenever the hero pill is on screen** (the pill *is* the create surface). Rule:

- **Hidden (smooth fade/slide out)** while the hero pill is in view.
- **Shown (smooth fade in)** once the user scrolls **past** the hero (e.g., into "Your next journey" / "Your travels").
- Clicking it (when visible) **smooth-scrolls to the hero and focuses the pill** — which brings the hero into view and thus fades the button away.

Driven by an **IntersectionObserver** on the hero pill. Same rule in both states. This reconciles both owner cases — "no upcoming trip" (State C, hero fills the view) and "user clicks new trip" (scrolls up to the pill).

## 6. Two mounts → one surface (global replacement)

| Entry point | Behavior after Phase 3 |
|---|---|
| State C / State B hero | **Inline pill** (primary surface, always at the top of the home) |
| Header **"+ New trip"** | **Scrolls to + focuses the hero pill** (no overlay, no scrim, no separate command palette) |
| In-gallery "add trip" affordances (if any) | Same: scroll to + focus the hero pill |
| `NewTripSheet` | **Retired / deleted** |
| `useCreateTrip` | **Kept** — the pill commits through it |

> This **revises** the parent spec's §7.3 "command-overlay (Cmd-K-style, page dims behind a scrim)". The owner explicitly rejected a dimming overlay: **no scrim, no background transition.** Because the pill hero is now permanently at the top of the home, summoning it is simply **scroll-to-and-focus** — there is nothing to overlay. The single `openCreateTrip` indirection is repointed accordingly (it focuses the pill instead of opening a sheet).

## 7. Components, files & API seams

**New**
- `CommandPill` — the progressive pill (intent → destination → dates → confirm). Owns its own state machine; emits an `onCommit({ destination, start, end })`. Supersedes `HeroSearchPill`'s submit-only behavior (built as an evolution of `HeroSearchPill`, reusing its glassy treatment + typewriter).
- `RangeCalendar` — anchored two-click range picker (start/end, claret band, gold hover), dark-glass styled, keyboard + a11y. Pure date logic extracted to a tested helper (e.g. `lib/range-calendar.ts`: clamping, which-click-sets-what, band membership).
- `useDestinationCoverPrefetch(destination)` (or a fire-and-forget call at select time) — warms the cover cache on city select.
- `MaterializeOverlay` (portal) — the fixed seed-card-flight layer that survives the route change; reduced-motion aware.
- `UpcomingJourney` — the State-B "next journey" full-width video section (consumes `cockpitModel(focus)`).
- `useHeroPillInView` — IntersectionObserver hook driving the "+ New trip" fade.

**Reused / unchanged**
- `useCreateTrip`, `useBackfillCoverImage` / `place-photo`, `useBackfillDestinationGeo`, `usePlaceSearch` (Photon), `selectFocusTrip`, `cockpitModel`, `home-groups`, `TripGrid` / tiles, `CinematicHero` shell + `HeroVideoStage` + `FieldGlobe`, `buildNewTripPayload`.

**Retired**
- `NewTripSheet` (deleted). The `openCreateTrip` indirection is repointed to focus the pill.

**Refactored/merged**
- `Dashboard`, `CinematicLaunchpad`, `CockpitHome` → one unified stacked home composition (see §5).

## 8. Data shapes

No migrations. Creation still flows `{ slug:'', title, subtitle:'', start, end, destination, notes:'' }` into `useCreateTrip` → `buildNewTripPayload` (title defaults from the destination/city; `start`/`end` empty ⇒ 4-day default; `config.startDate` set when dated). Cover + destination-geo backfills fire-and-forget exactly as `NewTripSheet` did today.

## 9. Accessibility & motion

- `prefers-reduced-motion`: pill expansions eased without elasticity; materialization → calm dissolve (§4); "+ New trip" fade becomes an instant toggle.
- Pill input is a labelled combobox; autocomplete is full keyboard (↑/↓/Enter/Esc), `role=listbox/option`, `aria-activedescendant` (mirrors `DestinationInput`).
- `RangeCalendar`: focusable grid, arrow-key navigation, Enter to pick, Esc to close, ≥44px targets, `aria-selected` on range ends, labelled month nav.
- No layout shift: autocomplete and calendar are absolute overlays; the pill grows in place.
- Focus management: on materialize, focus moves into the planner (its existing entry focus). On pill open via "+ New trip", focus moves to the pill input.

## 10. Testing

- **Pure logic (unit):** `range-calendar` (first/second click assignment, swap when end < start, band membership, month clamping); `buildNewTripPayload` still correct for dated vs undated (existing tests stay green); creation routes through `useCreateTrip` (existing).
- **Pill state machine:** intent → destination (chip) → dates (calendar open) → confirm (`onCommit` payload); destination required, dates optional.
- **Cover prefetch:** selecting a destination triggers the fire-and-forget warm exactly once; materialization reads cache-only and falls back to gradient when cold (no blocking fetch).
- **Home composition:** `selectFocusTrip === null` → no "Your next journey" section; non-null → section present with the focus trip; travels list excludes the featured trip (existing behavior).
- **"+ New trip" rule:** hidden when hero-pill sentinel intersects, shown when it doesn't (observer mocked).
- **Materialization invariant:** commit + navigation happen even under reduced motion / overlay-skipped path (the animation is cosmetic).
- **Retirement:** `NewTripSheet` removed; no remaining imports; `openCreateTrip` focuses the pill.
- Keep `npx tsc -b` clean and the full suite green (≥ 734, plus the new units).

## 11. Build phases (for the implementation plan)

Bite-sized, subagent-driven, commit-per-task, spec + code-quality review between tasks:

1. **`RangeCalendar` + pure date logic** (tested, standalone, dark-glass styled).
2. **`CommandPill`** — evolve `HeroSearchPill` into the four-beat state machine (destination chip, "When?", calendar mount, confirm), `onCommit`. Still wired to the old `openCreateTrip` temporarily (sheet) so it's shippable mid-way.
3. **Cover prefetch on select** — warm the cache at destination-select; seed reads cache-only.
4. **`MaterializeOverlay`** — seed-card flight portal + reduced-motion dissolve; wire confirm → `useCreateTrip` → navigate, with the overlay handoff.
5. **Unified home composition** — merge `Dashboard` / `CinematicLaunchpad` / `CockpitHome` into the stacked layout; add `UpcomingJourney`; repoint `openCreateTrip` to focus the pill.
6. **"+ New trip" visibility rule** — `useHeroPillInView` + header fade + scroll-to-focus.
7. **Retire `NewTripSheet`** — delete + remove imports; final holistic review; suite green; `tsc -b` clean.

## 12. Open / deferred

- Exact `RangeCalendar` visual polish (cell sizing, two-month vs one-month on desktop) — tune in build.
- Seed-card flight precise curve / durations — tune in build against the approved prototype feel (v3 choreography).
- Whether "Your next journey" video reuses `useDestinationClip` verbatim or a calmer single-clip — decide in build (default: reuse).
- Multiple simultaneously-imminent upcoming trips beyond the focus trip — out of scope (parent spec already defers).
