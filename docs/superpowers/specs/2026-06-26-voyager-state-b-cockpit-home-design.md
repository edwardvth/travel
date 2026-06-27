# Voyager State B — Cinematic Cockpit Home (design spec)

**Date:** 2026-06-26 · **Branch:** `field-globe-phase-2` · **Status:** approved-for-planning

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
│  [ 🔍 Search your trips… ]                                    │
│  Upcoming                                                     │
│   <tiles | rows>                                              │
│  Past                                                         │
│   <tiles | rows>                                              │
└───────────────────────────────────────────────────────────────┘
```

## Component 1 — the cockpit card (featured trip)

**Source:** `featured = selectFocusTrip(trips)`; `m = cockpitModel(featured)`.

**Header (photo):** `useTripCover(featured)` over `HEADER_SCRIM`; the countdown (`m.countdownLabel`, or `"Next trip"` when undated), the destination name (`featured.title`), a context line (`formatDateRange` + `m.stopCount` stops), the weather (`useWeather` with the account's `useUnits`, using `destinationGeo` → `dayAnchorCoords(featured, m.featuredDay)` fallback as the current `Cockpit` does), and the **"N to arrange"** deep-link (`m.toArrangeCount` → Trip view). Bigger on `md` (taller header, larger title), **top anchored** — it grows down/out only.

**Action bar (solid `#0f0f15`, two-action model — buttons never hidden):**

| State | Big (claret, →) | Small |
|---|---|---|
| `during` | **Start guide** → Guide | **Plan** → Plan |
| `before`, itinerary incomplete | **Start planning** → Plan | **Guide** → Guide |
| `before`, itinerary complete | **Open plan** → Plan | **Guide** → Guide |

**Polish:** hover-pop (desktop) + tap-lift (mobile) + a soft backdrop halo behind it (both sizes) so it separates from the footage.

## Component 2 — the hero destination video

Clip selection for the featured trip's destination, **curated-first**:

1. `clipForWord(destination)` — if it returns a curated clip (not the girl-walking fallback), use it (self-hosted, instant).
2. else `fetchDestinationVideo(city, country)` → `clipFromDestinationVideo(...)` (Pexels, cached globally); while it resolves or on any miss, show the **girl-walking** generic clip, then crossfade in the result.

The hero video **pauses when the globe is active** (`heroActive` from `useInViewActive`). This lands the Pexels pipeline source on `main` (edge fn `pexels-video`, `video_cache.sql`, `destinationVideo.ts`).

## Component 3 — "Your travels" (searchable list + view toggle)

**Data:** every trip **except the featured one**, via a derived view-model (below): `upcoming` (start asc), then `past` (end desc), plus `planning` (undated upcoming) shown under its own label. **No 90-day "Later" bucket** — a searchable, sorted list makes proximity-bucketing unnecessary.

**Search:** a labelled input filters by `title`/`destination` (case-insensitive, trimmed) across all groups; empty groups and their labels hide; a "No trips match …" empty state.

**View toggle** (segmented, **two modes**, choice persisted per account):
- **Tiles** — glass photo card + **blurred footer** holding name/dates (the look the owner picked); upcoming get a countdown chip. Lifts on hover (desktop) and tap (mobile).
- **Detailed** — Explorer-style rows: thumbnail · name · dates · stops · "when" (claret countdown for upcoming, muted for past). A column header on `md+`.

**Polish:** soft backdrop behind the list; two-layer text shadows on all labels/cards.

## Derived view-model (new, pure, unit-tested)

`homeGroups(trips, today)` → `{ featured, upcoming[], past[], planning[] }`:
- `featured = selectFocusTrip(trips)` (already active-wins).
- the rest via `splitTrips`, with `featured` removed, `upcoming` sorted by `tripStart` asc (undated → `planning`), `past` by `tripEnd` desc.

`filterTrips(groups, query)` → the same shape, name/destination-filtered. Both pure; tests cover featured-exclusion, sort order, undated→planning, and search.

## Dashboard wiring

`Dashboard` gains a **third branch**: when `!isLoading && focus` → early-return the new `CockpitHome` full-bleed (outside `AppShell`), passing `trips`, `focus`, `onCreate`/`onOpen`/`onOpenArrange`/`onOpenGuide`, `tripActions`, `units`, and the same `headerRight` (ThemeToggle + New trip + AccountMenu) and overlays State C uses. The existing cover/destination **backfill effect, `isTeaser` gating, and Share/Delete/New-trip overlays stay**. The Phase-1 `Cockpit`/`Segmented`/`TripGrid` State-B path is removed.

## Accessibility & motion

`prefers-reduced-motion` → no morph/lift, static globe frame, instant view switches. Hover effects gated to `@media(hover:hover)`; mobile uses tap. Search input labelled; toggle buttons `aria-pressed`; ≥44px targets; visible focus rings; the detailed list is keyboard-navigable.

## Out of scope

The deck/rail mobile interactions (not chosen); the 90-day "Later" bucket; the command pill (Phase 3); any map in the cockpit; changes to State C or the planner.

## Delivery

Delete the 7 preview routes (`_PreviewCockpit`, `_PreviewLayouts`, `_PreviewHomeInteractions`, `_PreviewHomeSearch` + their `App.tsx` routes). Keep `npx tsc -b` clean and `npm test` green (new tests for the view-model). Holistic review → merge `field-globe-phase-2` → `main` (brings the parked State-B + Pexels-source commits) → manual `wrangler deploy`.

## Locked decisions

- **State B = has a trip**; featured = active-wins via `selectFocusTrip`; non-featured trips live in "Your travels."
- List is **Upcoming → Past (+ Planning)**, date-sorted, searchable; **no "Later" bucket**.
- Cockpit keeps **weather + "N to arrange"**; two-action model with **Open plan** when the itinerary is complete.
- **Tiles** default, **remembered** per account; tiles lift on hover + tap.
- Hero video **curated-first → Pexels → girl-walking**, never the same picture as the card.
- Background/transition geometry and the one-animated-background guarantee are **unchanged** from State C.

## Files

- **Create:** `app/src/components/CockpitHome.tsx` (full-bleed State B), `app/src/components/CockpitCard.tsx` (featured card), `app/src/components/TravelsList.tsx` (search + toggle + tiles/detailed), `app/src/components/TripRow.tsx` (detailed row), `app/src/lib/home-groups.ts` (+ test).
- **Modify:** `app/src/routes/Dashboard.tsx` (third branch, remove Phase-1 State-B path), `app/src/components/TripTile.tsx` (tap-lift + tiles footer variant, if reused), `app/src/App.tsx` (drop preview routes).
- **Land from branch:** `supabase/functions/pexels-video/`, `docs/supabase/video-cache.sql`, `app/src/hero/destinationVideo.ts`.
- **Delete:** `app/src/routes/_PreviewCockpit.tsx`, `_PreviewLayouts.tsx`, `_PreviewHomeInteractions.tsx`, `_PreviewHomeSearch.tsx`.
