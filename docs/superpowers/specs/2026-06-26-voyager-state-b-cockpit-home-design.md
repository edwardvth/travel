# Voyager State B — Cinematic Cockpit Home (design spec)

**Date:** 2026-06-26 · **Branch:** `field-globe-phase-2` · **Status:** approved-for-planning (revised after spec review)

## Context

The home (`/trips` Dashboard) renders one of two states:

- **State C — no upcoming trip** → the **launchpad** ("Where to next?" → night-Earth globe). Already built, merged to `origin/main` (tag `cinematic-launchpad`).
- **State B — has a trip** (upcoming *or* active) → the **cockpit home**.

State B today is the **Phase-1, non-cinematic** cockpit: an in-`AppShell` `Cockpit` card + a `Segmented` Upcoming/Past `TripGrid`. This spec upgrades State B to the **cinematic, full-bleed cockpit + searchable "Your travels"** that matches State C's visual language and the **approved `/x-home-search-views` preview** (the "search-views" direction the owner chose over the deck/rail alternates).

It also **lands the Pexels destination-video pipeline on `main`** (the edge function is already live on Supabase; only its source + `video_cache.sql` + the client helper are parked on the branch).

### Reused, unchanged infrastructure
`FieldGlobe`, `useInViewActive` (one-animated-background coordination), `HeroVideoStage` (with `playing`), `CinematicHero` pattern, the original transition geometry (globe `185vh`/`top-20vh`/`170vh`; hero `100svh`; mask `70→96%`; section `-mt-[18vh]`), `selectFocusTrip` (**already active-wins**), `cockpitModel`, `useTripCover`, `useWeather`, `formatDateRange`, `splitTrips`, `clipForWord`/`wordClips`, `fetchDestinationVideo`/`clipFromDestinationVideo`, `TripTile`, `useUnits`, `AccountMenu`/`ThemeToggle`, the New-trip/Share/Delete overlays.

## Design principles (inherited, do not violate)

1. **One animated background at a time** — the hero video and the globe never animate together (`useInViewActive`: the video pauses once the globe is active).
2. **Cinematic but subordinate; transition geometry is locked** — the video→globe handoff stays exactly where State C put it. No restructuring that moves the fade.
3. **Anti-slop** — CSS-var tokens, lucide icons, ≥44px targets, `aria-*`, focus rings, `prefers-reduced-motion`, no layout shift, text-shadow for legibility (never a heavy overlay).
4. **Never the same picture twice** — the hero video and the cockpit card's cover photo are always different media for the same place.

## Layout

Full-bleed, rendered **outside `AppShell`** (an early-return in `Dashboard`, exactly like State C), so the page has **one** header.

```
┌─ header: ThemeToggle · New trip · AccountMenu (white-on-dark) ─┐
│  GLOBE (z0, 185vh)                                            │
│  HERO (z10, 100svh, masked footage, brightness 1.8)          │
│     "Welcome back, Edward."                                  │
│     ┌─ cockpit card (featured trip) ──┐  ← soft backdrop halo │
│     │ countdown · Destination          │                      │
│     │ dates · stops · weather · arrange │                      │
│     │ [ Start planning → ] [ Guide ]    │                      │
│     └───────────────────────────────────┘                     │
│  ── video dissolves into globe (−18vh) ──                     │
│  YOUR TRAVELS                          [▦ Tiles] [▤ Detailed] │
│  [ 🔍 Search your trips…                                 ✕ ] │
│  Upcoming   <tiles | rows>                                    │
│  Planning   <tiles | rows>   (undated future trips)          │
│  Past       <tiles | rows>                                    │
└───────────────────────────────────────────────────────────────┘
```

**Group order is fixed: Upcoming → Planning → Past** (undated/“planning” trips sit closer to upcoming than to completed). **A group's label renders only for groups that have visible trips after filtering; empty groups hide. The list must never flatten into one mixed grid** — grouped sections always, so the timeline structure survives at 30+ trips.

## Component 1 — the cockpit card (featured trip)

**Source:** `featured = selectFocusTrip(trips)`; `m = cockpitModel(featured)`.

**Header (photo):** `useTripCover(featured)` over `HEADER_SCRIM`; the countdown (`m.countdownLabel`, or `"Next trip"` when undated), the destination name (`featured.title`), a context line (`formatDateRange` + `m.stopCount` stops), the weather (`useWeather` with the account's `useUnits`, using `destinationGeo` → `dayAnchorCoords(featured, m.featuredDay)` fallback as the current `Cockpit` does), and the **"N to arrange"** deep-link (`m.toArrangeCount` → Trip view). Bigger on `md` (taller header, larger title), **top anchored** — it grows down/out only.

**Action bar (solid `#0f0f15`, two-action model — buttons never hidden):**

| State | Big (claret, →) | Small |
|---|---|---|
| `during` | **Start guide** → Guide | **Plan** → Plan |
| `before`, itinerary incomplete | **Start planning** → Plan | **Guide** → Guide |
| `before`, itinerary complete | **Open plan** → Plan | **Guide** → Guide |

**“Itinerary complete” is concretely `cockpitModel.itineraryComplete`** = `days.length > 0 && every day has ≥1 stop` (the existing, unit-tested field). It is **independent of reservations** — unreserved stops surface separately via "N to arrange" and do **not** flip the label. `phase` (`during`/`before`) is `cockpitModel.phase`.

**Fallback / failure copy (no errors, no blank rows):**
- **No weather** (`useWeather` null, or no `destinationGeo` and no located stop) → **hide the weather row entirely** (don't show "—" or throw).
- **No dates** (undated trip, `countdownLabel` null) → countdown reads **"Planning trip"**; the context line drops the date range and shows just the stop count (or the no-stops copy below).
- **No stops** (`stopCount === 0`) → context line reads **"No stops yet"** instead of "0 stops".
- **No cover** → `useTripCover` already falls back to its gradient; never a grey gap.

**Navigation:** the card holds **multiple actions**, so the **whole card is NOT a click target**. Navigation happens only through the explicit action-bar buttons and the "N to arrange" link. The card body may lift for feedback but a tap on it does nothing navigational.

**Polish:** desktop **hover-pop**; mobile shows a **pressed animation during touch** (transient), **not** a persistent toggled lift; plus a soft backdrop halo behind it (both sizes) so it separates from the footage. Reduced-motion → no lift.

## Component 2 — the hero destination video

Clip selection for the featured trip's destination, **curated-first**:

1. `clipForWord(destination)` — if it returns a curated clip (not the girl-walking fallback), use it (self-hosted, instant).
2. else `fetchDestinationVideo(city, country)` → `clipFromDestinationVideo(...)` (Pexels, cached globally).

**No-flash crossfade (required):** mount the **girl-walking generic clip immediately** so the hero is never blank, fetch the destination clip **in the background**, and crossfade to it **only once it's `canplay`/ready** — never blank or jump the hero while fetching, and no layout shift. On any miss/error the generic clip just stays.

**"Different media" enforcement:** the hero is always a **video clip** and the card is always a **still photo** (`useTripCover`), so they're inherently different. If they ever resolve to the same source/URL, the **hero keeps the Pexels/video result** and the **card uses `useTripCover`'s next candidate / gradient fallback** — the card yields, never the hero.

The hero video **pauses when the globe is active** (`heroActive` from `useInViewActive`). This lands the Pexels pipeline source on `main` (edge fn `pexels-video`, `video_cache.sql`, `destinationVideo.ts`).

## Component 3 — "Your travels" (searchable list + view toggle)

**Data:** every trip **except the featured one**, rendered as **grouped sections in fixed order — Upcoming → Planning → Past** (view-model below). **A group label renders for every group that has visible trips after filtering; empty groups hide. The list must never flatten into one mixed grid.** **No 90-day "Later" bucket** — a searchable, sorted, grouped list makes proximity-bucketing unnecessary.

**Layout (no infinite stacking, no nested scroll):** the "Your travels" section is a **responsive grid, not a rail** — **1 column mobile · 2 tablet · 3 desktop** — with clear spacing between groups. It does **not** horizontally scroll and introduces **no nested scrollbars** (the page scrolls). This is the explicit, chosen direction — do **not** reintroduce the deck/rail.

**Search:** a labelled input filters (case-insensitive, trimmed) across **all groups** by `title`, `config.destination`, and `config.city`/`config.country` when those exist separately — so a trip titled "Spring Break" still matches "Paris" via its destination. Includes a **clear (✕) button** inside the input that appears once there's a query and resets it; the button has `aria-label="Clear trip search"` and is **keyboard-reachable**, and pressing **Escape** while focused in the input also clears the query. Empty result → a "No trips match …" state.

**Navigation (both views):** a tile or detailed row **opens the trip's Plan view** (single tap/click — no two-tap). **Guide** is reachable **only** through explicit Guide actions (the cockpit card's Guide button), never as default row/tile navigation.

**View toggle** (segmented, **two modes**, choice **persisted per account**):
- **Persistence:** store `homeTravelsViewMode` (`'tiles' | 'detailed'`) in the **existing `useAccountSettings` store** (the same localStorage-backed per-account settings that hold units/theme). If a Supabase profile/settings field is later added, prefer it; localStorage keyed to the account is the fallback. Default **Tiles**; never resets on its own.
- **Tiles** — glass photo card + **blurred footer** holding name/dates (the look the owner picked); upcoming get a countdown chip. Desktop **hover-lifts**; mobile shows a **pressed animation during touch** (transient), **not** a persistent toggled lift. A single tap **opens the trip** (Plan).
- **Detailed** — Explorer-style rows: thumbnail · name · dates · stops · "when" (claret countdown for upcoming, muted for past). A column header on `md+`. A row click/tap **opens the trip** (Plan).

**Polish:** soft backdrop behind the list; two-layer text shadows on all labels/cards.

## Derived view-model (new, pure, unit-tested)

`homeGroups(trips, today)` → `{ featured, upcoming[], planning[], past[] }` (render order: upcoming → planning → past):
- `featured = selectFocusTrip(trips)` (already active-wins).
- the rest with `featured` removed: **dated upcoming** (not past, dated) by `tripStart` asc; **planning** (undated upcoming) in input order; **past** by `tripEnd` desc.
- **Undated detection is centralized** in one helper `isUndatedTrip(trip)`. UI/view-model code calls that helper — it does **not** repeat the `9999-12-31` sentinel inline — so a future date-model change touches one place.
- **All comparisons use local calendar dates.** Normalize `today`, `tripStart`, `tripEnd` to `YYYY-MM-DD` before comparing, so trips don't flip groups around midnight or across time zones.

`filterTrips(groups, query)` → the same shape, filtered by `title` + `config.destination` + `config.city`/`config.country` (case-insensitive, trimmed; empty query = passthrough).

**Tests (pure):** featured-exclusion; the three-group sort/order; undated→planning (via `isUndatedTrip`); multi-field search (title "Spring Break" matches destination "Paris"); **an active trip is selected as featured AND excluded from Upcoming/Planning/Past, even though its date range would otherwise place it in Upcoming**; and a local-date boundary case (a trip ending "today" is still active/upcoming, not past).

## Dashboard wiring

`Dashboard` gains a **third branch**: when `!isLoading && focus` → early-return the new `CockpitHome` full-bleed (outside `AppShell`), passing `trips`, `focus`, `onCreate`/`onOpen`/`onOpenArrange`/`onOpenGuide`, `tripActions`, `units`, and the same `headerRight` (ThemeToggle + New trip + AccountMenu) and overlays State C uses. The existing cover/destination **backfill effect, `isTeaser` gating, and Share/Delete/New-trip overlays stay**.

**Regression guard — remove the old path last.** Remove the Phase-1 `Cockpit`/`Segmented`/`TripGrid` State-B path **only after** `CockpitHome` is verified to preserve, end-to-end: **New trip** (incl. teaser gating), **Share**, **Delete** (owner-gated), **cover/destination backfill**, **opening a trip** (Plan/Guide/Trip targets), and **founder/credits behavior**. Until then both can coexist behind the branch so nothing regresses.

**Loading states (no awkward blanks):** while `trips` load, keep the Dashboard's **existing loading skeleton**. While account settings load, **default the view mode to Tiles** and reconcile once settings arrive **without layout shift**. While covers load, use `useTripCover`'s **existing fallback** (gradient), never a grey gap.

## Accessibility & motion

`prefers-reduced-motion` → no morph/lift, static globe frame, instant view switches. Hover effects gated to `@media(hover:hover)`; mobile uses tap. Search input labelled; toggle buttons `aria-pressed`; ≥44px targets; visible focus rings; the detailed list is keyboard-navigable.

## Out of scope

The deck/rail mobile interactions (not chosen); the 90-day "Later" bucket; the command pill (Phase 3); any map in the cockpit; changes to State C or the planner.

## Delivery

**Keep the preview explorations as reference files only — not wired into the running app.** Remove all `/x-*` preview routes and their imports from `App.tsx` (nothing routed, nothing bundled, not viewable in the running app), and **move the 4 preview files (which together back the 7 `/x-*` routes) into `app/src/routes/_home-explorations/`**, a folder **excluded from the TS build** (`tsconfig` `exclude`) so the archived files never affect compilation or the bundle. They live in git purely so the owner can look at / restore a direction later. **After moving, verify there are zero imports from `_home-explorations/` anywhere in app code** (grep) — the archive must be genuinely unreachable and unbundled. Keep `npx tsc -b` clean and `npm test` green (new tests for the view-model). Holistic review → merge `field-globe-phase-2` → `main` (brings the parked State-B + Pexels-source commits) → manual `wrangler deploy`.

## Locked decisions

- **State B = has a trip**; featured = active-wins via `selectFocusTrip`; non-featured trips live in "Your travels."
- List is grouped **Upcoming → Planning → Past** (labels always shown), date-sorted, searchable across title + destination/city/country; responsive grid (1/2/3), no rail, no nested scroll; **no "Later" bucket**.
- Cockpit keeps **weather + "N to arrange"**; two-action model with **Open plan** when the itinerary is complete.
- **Tiles** default, **remembered** per account; tiles lift on hover + tap.
- Hero video **curated-first → Pexels → girl-walking**, never the same picture as the card.
- Background/transition geometry and the one-animated-background guarantee are **unchanged** from State C.

## Files

- **Create:** `app/src/components/CockpitHome.tsx` (full-bleed State B), `app/src/components/CockpitCard.tsx` (featured card), `app/src/components/TravelsList.tsx` (search + clear-✕ + view toggle + grouped responsive grid), `app/src/components/TripRow.tsx` (detailed row), `app/src/lib/home-groups.ts` (`homeGroups` + `filterTrips`, **+ test**).
- **Modify:** `app/src/routes/Dashboard.tsx` (third branch; remove Phase-1 State-B path **only after** the regression-guard checks pass), `app/src/data/useAccountSettings.ts` (add the persisted `homeTravelsViewMode`), `app/src/components/TripTile.tsx` (tap-lift + glass-footer tiles variant, if reused), `app/src/App.tsx` (drop preview routes/imports), `app/tsconfig*.json` (exclude `_home-explorations/`).
- **Land from branch:** `supabase/functions/pexels-video/`, `docs/supabase/video-cache.sql`, `app/src/hero/destinationVideo.ts`.
- **Archive as reference (move, keep — do NOT delete, NOT wired in):** `_PreviewCockpit.tsx`, `_PreviewLayouts.tsx`, `_PreviewHomeInteractions.tsx`, `_PreviewHomeSearch.tsx` → `app/src/routes/_home-explorations/`. Their `App.tsx` routes/imports are removed; the folder is `tsconfig`-excluded so it isn't compiled, bundled, or reachable — purely files to look at later.

## Acceptance checklist

- `npx tsc -b` passes.
- `npm test` passes, including the `home-groups` tests.
- No `/x-*` routes are reachable.
- Preview files are present **only** under `_home-explorations/`, excluded from the TS build, with **zero imports** from app code.
- State B renders **full-bleed outside `AppShell`** with **one** header.
- The hero video **pauses when the globe becomes active**.
- The **featured trip is excluded** from "Your travels."
- "Your travels" renders **Upcoming → Planning → Past**, with **no flattened mixed grid** and empty groups hidden.
- Search filters **title + destination/city/country**; the **clear button** (and Escape) works.
- **Tiles/Detailed** preference **persists per account** and defaults to Tiles without layout shift.
- A tile/row **opens Plan**; the whole cockpit card is **not** a click target; Guide only via explicit Guide actions.
- **New trip, Share, Delete, Plan, Guide, teaser gating, and cover backfill** all still work.
