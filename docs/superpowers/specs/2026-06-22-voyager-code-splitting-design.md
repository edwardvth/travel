# Voyager — Code-splitting / bundle performance (design)

> **Status:** approved design, ready for an implementation plan. **Date:** 2026-06-22. **Branch:** `main`.
> Read `CLAUDE.md` + `handoff.md` for project conventions first.

## Problem

The production build emits a single ~820 KB JS chunk (the build warns at the 500 KB threshold). Every route is eagerly imported in `app/src/App.tsx`, so a logged-out visitor on **Landing**, or a user on the **Dashboard**, downloads the entire planner (`Itinerary`, `Guide`, `Trip`, `StopDetail`) and **Leaflet** (~150 KB, only ever used by the Plan-tab map) before the first screen is interactive. For a premium travel PWA used on mobile data — often abroad on a slow connection — this hurts time-to-interactive on exactly the screens (Landing/Dashboard) a new user hits first.

Current splitting: only the Landing hero sub-modes (`HeroModeCinematic`, `HeroModeExplorer`) are lazy-loaded. Nothing else is.

## Goal

Split the bundle so the **initial load is small** and heavy code loads on demand:

- The planner routes load only when you open a trip, **per tab** (you don't download `Guide` until you tap Guide).
- **Leaflet** loads only when the Plan map actually paints.
- Loading is **invisible-quality** — token-themed skeletons, no layout shift, no spinner-slop, `prefers-reduced-motion` respected.
- The ~516-test suite stays green; ships to Cloudflare unchanged in behaviour.

## Non-goals (explicitly out of scope)

Decided during brainstorming — the "focused & safe" tier:

- **No vendor `manualChunks`** (React/Router/Query/Supabase stay in the entry chunk). Deferred; can be a follow-up for repeat-visit caching.
- **No framer-motion removal from the initial load.** framer-motion is pinned to the entry chunk by `SplashIntro`, which is rendered globally in `App.tsx`. Removing it would require reworking the always-on splash — more surface area for a smaller marginal win. Deferred.
- No change to offline/PWA, the Worker, or any feature behaviour.

## Design

### Lazy boundaries

1. **`app/src/App.tsx`** — convert these five from eager `import` to `React.lazy(() => import('...'))`:
   `PlannerLayout`, `Itinerary`, `Guide`, `Trip`, `StopDetail`.
   `Landing`, `Auth`, `Dashboard`, `SplashIntro` **stay eager** (entry points + the global splash). Wrap the `<Routes>` element in a single `<Suspense fallback={<RouteFallback/>}>`. Only the lazy planner elements ever suspend it; eager routes never trigger a fallback.

2. **`app/src/trip/PlannerLayout.tsx`** — wrap its `<Outlet/>` in a second `<Suspense fallback={<PlannerContentFallback/>}>`. Because each tab element (`Itinerary`/`Guide`/`Trip`/`StopDetail`) is now its own lazy chunk, switching tabs suspends only the Outlet — the shell (day rail, header, tab bar, lifted autosave/`SyncIndicator`) stays mounted and a content skeleton fills the body. This prevents a full-page blank on tab change.

3. **`app/src/trip/Itinerary.tsx`** — `TripMapView` (the only file that imports `leaflet`) becomes `const TripMapView = lazy(() => import('./TripMapView'))`, rendered inside `<Suspense fallback={<MapSkeleton/>}>`. The stop list paints immediately; Leaflet streams into a separate chunk behind the map skeleton. (`Itinerary` itself is already lazy from boundary #1, so Leaflet ends up in its own grandchild chunk, not merged into the Itinerary chunk.)

### Resulting chunk map (target)

| Chunk | Contains | Loaded when |
|---|---|---|
| entry / `index` | app shell, `Landing`, `Auth`, `Dashboard`, `SplashIntro`, vendor (React, Router, Query, Supabase, framer-motion) | first paint |
| `PlannerLayout` | the 3-tab shell + lifted autosave | open `/trip/:id` |
| `Itinerary` | Plan split-view (list UI, not the map) | open Plan |
| `Guide` | the swipe-deck companion + `guide/*` | open Guide |
| `Trip` | commitments dashboard | open Trip |
| `StopDetail` | single-stop detail | open a stop |
| `TripMapView` (Leaflet) | ~150 KB map | the Plan map paints |

Net effect: Dashboard/Landing ship **none** of the planner or Leaflet; a Plan/Guide traveller never downloads `StopDetail`.

### Suspense fallbacks (three)

All three are built from the existing `components/ui/Skeleton` primitive + CSS-variable tokens (`--base` / `--raised` / `--skeleton` / `--hair`), work in light + dark, **reserve exact space to avoid layout shift**, and inherit the global `@media (prefers-reduced-motion: reduce)` rule in `index.css` (which neutralises animation durations, so the shimmer auto-stills — no separate handling needed).

- **`RouteFallback`** (top-level, initial planner load): a calm, branded full-height skeleton — a header bar + a couple of content shimmer blocks. Brief by design (chunks are small on a warm connection). Lives in a small shared module (e.g. `components/RouteFallback.tsx`).
- **`PlannerContentFallback`** (tab switch within the planner): a content-area skeleton sized to the planner body so the shell never blanks. Co-located with `PlannerLayout` (or the shared fallback module).
- **`MapSkeleton`** (Leaflet load): a neutral token-themed block exactly filling the map pane's rounded container, so there's no shift when the real map mounts. Co-located with `Itinerary`/`TripMapView`.

Keep them minimal and on-brand; reuse existing per-surface skeletons (e.g. Guide's `CardSkeleton`) only if it's a clean fit — otherwise a single tasteful generic skeleton per boundary is preferred over bespoke per-tab skeletons (YAGNI).

## Testing

- **Component/unit tests are unaffected.** They import components directly (e.g. `import Guide from './Guide'`), bypassing the `lazy()` wrappers that live only in `App.tsx` / `PlannerLayout` / `Itinerary`.
- **Two risk spots to check and handle during implementation:**
  1. Any test that renders `<App/>` and navigates routes would now hit Suspense and must `await screen.findBy…` / `waitFor`. (Route reachability is currently smoke-tested via `curl` against the deployed Worker, not vitest, so there is likely no such test — verify.)
  2. `Itinerary` tests that touch the now-lazy `TripMapView`: assert on list content, or `await`/`waitFor` the map. (Leaflet doesn't fully render in jsdom anyway, so existing tests likely already avoid asserting on it.)
- Fix any affected test by **awaiting the Suspense boundary, never by weakening the assertion**.

## Acceptance criteria

1. `npm run build` emits **separate chunks** for `PlannerLayout`, `Itinerary`, `Guide`, `Trip`, `StopDetail`, and `TripMapView`/Leaflet (visible in the build output).
2. The **entry chunk shrinks materially** vs the current ~820 KB once the planner + Leaflet leave it. Record before/after sizes in the implementation notes (no hard byte target committed here, but the entry must no longer contain Guide/Itinerary/Trip/StopDetail/Leaflet).
3. `npm test` → **516 passing**; `npx tsc -b` → clean; `npm run build` → succeeds.
4. **Cloudflare smoke after deploy:** `/`, `/trips`, `/trip/stl` (Plan), `/trip/stl/guide`, `/trip/stl/trip` all return 200, render correctly, and the lazy `dist/assets/*.js` chunks fetch successfully (hashed chunk paths are real assets, so the Worker's SPA fallback to `index.html` does not intercept them — confirm in the network panel / via a direct chunk fetch).
5. No visible layout shift or spinner-jank when a chunk loads; fallbacks honour light/dark + reduced-motion.

## Risks & mitigations

- **Tab-switch flash:** mitigated by the inner Suspense keeping the shell mounted + a content skeleton; chunks are small so the fallback is brief.
- **Worker not serving a hashed chunk (SPA fallback intercepting):** low risk — `worker.js` serves `app/dist` via the ASSETS binding and only falls back to `index.html` for non-asset paths; acceptance #4 explicitly verifies a chunk fetch.
- **A test renders `<App/>`:** handled by awaiting Suspense (see Testing).
- **Reduced-motion:** no extra work — the global CSS rule already stills skeleton shimmer.

## Out of scope / follow-ups

- Vendor `manualChunks` for repeat-visit caching.
- Removing framer-motion from the initial load (requires `SplashIntro` rework).
- Offline / service-worker / PWA (separate workstream #2).
