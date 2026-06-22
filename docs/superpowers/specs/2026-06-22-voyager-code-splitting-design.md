# Voyager — Code-splitting / bundle performance (design)

> **Status:** approved design, ready for an implementation plan. **Date:** 2026-06-22. **Branch:** `main`.
> Read `CLAUDE.md` + `handoff.md` for project conventions first.

## Problem

The production build emits a single **~829 KB** entry chunk (`dist/assets/index-*.js`; the build warns at the 500 KB threshold). Every route is eagerly imported in `app/src/App.tsx`, so a logged-out visitor on **Landing**, or a user on the **Dashboard**, downloads the entire planner (`Itinerary`, `Guide`, `Trip`, `StopDetail`) — including the heavy Guide swipe-deck — before the first screen is interactive. For a premium travel PWA used on mobile data, often abroad on a slow connection, this hurts time-to-interactive on exactly the screens (Landing/Dashboard) a new user hits first.

**Already split (verified in the build):** the Landing hero sub-modes (`HeroModeCinematic`, `HeroModeExplorer`), and — importantly — **Leaflet**: `TripMapView.tsx:170` already does `await import('leaflet')` inside an effect, so Leaflet ships as its own ~150 KB chunk (`leaflet-src-*.js`), **not** in the entry. So Leaflet is *not* a target here; the entry's weight is the React/vendor baseline + all the eager app/route code. The win is deferring the planner routes.

## Goal

Split the bundle so the **initial load is small** and heavy code loads on demand:

- The planner routes load only when you open a trip, **per tab** (you don't download `Guide` until you tap Guide).
- The **already-lazy** Plan map gets a proper loading skeleton (today it can flash an empty map pane while `import('leaflet')` resolves).
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
   `Landing`, `Auth`, `Dashboard`, `SplashIntro` **stay eager** — they are first-hit routes that need immediate paint and are comparatively small, so deferring them would hurt more than help (the classic "don't split everything" trap). Wrap the `<Routes>` element in a single `<Suspense fallback={<RouteFallback/>}>`. Only the lazy planner elements ever suspend it; eager routes never trigger a fallback.

   The lazy `import()` calls are defined once as named thunks in a small shared module **`app/src/trip/lazyRoutes.ts`** (`export const importGuide = () => import('./Guide')`, etc.) so the same module specifier is reused for both `lazy()` (in `App.tsx`) and preload-on-intent (in the tab bar) — see below. Same specifier → same chunk.

2. **`app/src/trip/PlannerLayout.tsx`** — wrap its `<Outlet/>` in a second `<Suspense fallback={<PlannerContentFallback/>}>`. Because each tab element (`Itinerary`/`Guide`/`Trip`/`StopDetail`) is now its own lazy chunk, switching tabs suspends only the Outlet — the shell (day rail, header, tab bar, lifted autosave/`SyncIndicator`) stays mounted and a content skeleton fills the body. This prevents a full-page blank on tab change.

3. **`app/src/trip/TripMapView.tsx`** — Leaflet is *already* dynamically imported here (`await import('leaflet')` in an effect → its own `leaflet-src-*.js` chunk), so **no new lazy boundary is needed**. We only add a `MapSkeleton` loading state: while `leafletRef.current` is null (the `import('leaflet')` + map init hasn't finished), render the skeleton in place of the map pane so it doesn't flash empty. This is conditional rendering *inside* `TripMapView` (the dynamic import lives in an effect, not a `React.lazy`/Suspense) — the smallest item in this plan.

### Resulting chunk map (target)

| Chunk | Contains | Loaded when |
|---|---|---|
| entry / `index` | app shell, `Landing`, `Auth`, `Dashboard`, `SplashIntro`, vendor (React, Router, Query, Supabase, framer-motion) | first paint |
| `PlannerLayout` | the 3-tab shell + lifted autosave | open `/trip/:id` |
| `Itinerary` | Plan split-view (list UI, not the map) | open Plan |
| `Guide` | the swipe-deck companion + `guide/*` | open Guide |
| `Trip` | commitments dashboard | open Trip |
| `StopDetail` | single-stop detail | open a stop |
| `leaflet-src` (already split today) | ~150 KB map | the Plan map paints |

Net effect: Dashboard/Landing ship **none** of the planner (and already none of Leaflet); a Plan/Guide traveller never downloads `StopDetail`.

### Suspense fallbacks (three)

All three are built from the existing `components/ui/Skeleton` primitive + CSS-variable tokens (`--base` / `--raised` / `--skeleton` / `--hair`), work in light + dark, **reserve exact space to avoid layout shift**, and inherit the global `@media (prefers-reduced-motion: reduce)` rule in `index.css` (which neutralises animation durations, so the shimmer auto-stills — no separate handling needed).

- **`RouteFallback`** (top-level, initial planner load): a calm, branded full-height skeleton — a header bar + a couple of content shimmer blocks. Brief by design (chunks are small on a warm connection). Lives in a small shared module (e.g. `components/RouteFallback.tsx`).
- **`PlannerContentFallback`** (tab switch within the planner): a content-area skeleton sized to the planner body so the shell never blanks. Co-located with `PlannerLayout` (or the shared fallback module).
- **`MapSkeleton`** (Leaflet load): a neutral token-themed block exactly filling the map pane's rounded container, so there's no shift when the real map mounts. Co-located with `Itinerary`/`TripMapView`.

Keep them minimal and on-brand; reuse existing per-surface skeletons (e.g. Guide's `CardSkeleton`) only if it's a clean fit — otherwise a single tasteful generic skeleton per boundary is preferred over bespoke per-tab skeletons (YAGNI).

### Preload on intent (make tab switches feel instant)

A bare `lazy()` still flashes a skeleton on the *first* visit to a tab. Hide almost all of it by **preloading the chunk on intent**: when the user hovers / focuses / touches a tab before clicking, start the fetch early. The `PlannerLayout` tab bar wires the shared thunks from `lazyRoutes.ts` onto each tab control:

```tsx
onPointerEnter={importGuide} onFocus={importGuide} onTouchStart={importGuide}
```

Applies to **Guide, Trip, StopDetail, and Itinerary**. Calling an already-started import is a no-op (the module promise is cached), so this is cheap and idempotent. It is an **enhancement, not an acceptance gate** — correctness must not depend on the preload having finished (the `lazy()` + Suspense still covers the cold case).

### Chunk error boundary (no white screen on a failed fetch)

A dynamic `import()` can reject — a **stale chunk after a redeploy** (hashes changed, old URL gone), a network blip, a service-worker hiccup, or resuming the app after a long time offline. Bare `<Suspense>` does **not** catch that, so the app would white-screen. Wrap the Suspense boundaries in a `ChunkErrorBoundary`:

```tsx
<ChunkErrorBoundary>
  <Suspense fallback={…}>…</Suspense>
</ChunkErrorBoundary>
```

`ChunkErrorBoundary` is a small **class component** (`app/src/components/ChunkErrorBoundary.tsx`) — the one class in the codebase, because React error boundaries must be classes. On a caught error it renders a calm, branded recovery card (lucide icon + message + a **Reload** button — token-themed, light/dark, keyboard-focusable, `aria`-labelled), and **distinguishes a chunk-load failure from a generic render crash** so the message is honest and diagnostics are easier:

```ts
const isChunkError = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk \d+ failed/i
  .test(err?.message ?? '')
```

- **Chunk failure** → "Couldn't load the latest version of Voyager." (tells the user it's a staleness problem a reload fixes).
- **Generic render crash** → "Something went wrong."

Both offer **Reload** → a full `window.location.reload()`. Reload is the only reliable recovery for the most common cause (a stale chunk hash after a deploy — re-mounting alone can't fetch a URL that no longer exists; a reload pulls the fresh `index.html` + new hashes), and is a sane single action for a transient render crash too. Autosave persists to Supabase, so a reload loses no work. The two branches also log with distinct tags (`console.error('[chunk-load]' …)` vs `'[render-crash]' …`) for later diagnostics. Wrap at least the top-level `<Routes>` Suspense; the planner `<Outlet/>` Suspense reuses the same boundary so a failed *tab* chunk recovers in place rather than taking down the shell.

## Testing

- **Component/unit tests are unaffected.** They import components directly (e.g. `import Guide from './Guide'`), bypassing the `lazy()` wrappers that live only in `App.tsx` / `PlannerLayout` / `Itinerary`.
- **Two risk spots to check and handle during implementation:**
  1. Any test that renders `<App/>` and navigates routes would now hit Suspense and must `await screen.findBy…` / `waitFor`. (Route reachability is currently smoke-tested via `curl` against the deployed Worker, not vitest, so there is likely no such test — verify.)
  2. `Itinerary` tests that touch the now-lazy `TripMapView`: assert on list content, or `await`/`waitFor` the map. (Leaflet doesn't fully render in jsdom anyway, so existing tests likely already avoid asserting on it.)
- Fix any affected test by **awaiting the Suspense boundary, never by weakening the assertion**.
- **New components get unit tests:** `ChunkErrorBoundary` — assert **both branches**: a child throwing a dynamic-import-style error renders the "Couldn't load the latest version…" message; a child throwing a generic error renders "Something went wrong." Both expose a working, labelled **Reload** control (stub the `window.location.reload` side-effect). The fallback skeletons are presentational; a light render test is enough.

## Acceptance criteria

1. `npm run build` emits **separate chunks** for `PlannerLayout`, `Itinerary`, `Guide`, `Trip`, `StopDetail`, and `TripMapView`/Leaflet (visible in the build output).
2. The **entry chunk shrinks materially** vs the current ~820 KB once the planner + Leaflet leave it (no hard byte target, but the entry must no longer contain Guide/Itinerary/Trip/StopDetail/Leaflet). Record the before/after table in the implementation notes (template below).
3. **Chunk independence (no barrel-file leakage):** confirm the planner chunks don't cross-contaminate — in particular that **`Guide` code is absent from the `StopDetail` / `Itinerary` / `Trip` chunks**. Route-level splitting is silently defeated when a shared barrel (`index.ts` re-export) or a transitive import drags a heavy module into a sibling chunk. Verify with a bundle visualizer (`npx vite-bundle-visualizer`) or by inspecting the emitted chunk contents; fix any leak by importing the specific module path instead of a barrel.
4. `npm test` → **516 (+ the `ChunkErrorBoundary` test) passing**; `npx tsc -b` → clean; `npm run build` → succeeds.
5. **Cloudflare smoke after deploy:** `/`, `/trips`, `/trip/stl` (Plan), `/trip/stl/guide`, `/trip/stl/trip` all return 200, render correctly, and the lazy `dist/assets/*.js` chunks fetch successfully (hashed chunk paths are real assets, so the Worker's SPA fallback to `index.html` does not intercept them — confirm in the network panel / via a direct chunk fetch).
6. No visible layout shift or spinner-jank when a chunk loads; fallbacks honour light/dark + reduced-motion.

## Implementation notes (record on completion)

Measured 2026-06-22 (raw, uncompressed bytes):

```
BEFORE                                AFTER
index-*.js   829,580 B (~810 KB)      index-*.js          604,326 B (~590 KB)   ← entry, -27.2%
leaflet-src  149,983 B (already lazy) leaflet-src-*.js    149,985 B  (unchanged — already lazy)
                                      Itinerary-*.js       79,532 B  (new, on Plan)
                                      Guide-*.js           53,411 B  (new, on Guide)
                                      StopDetail-*.js      27,024 B  (new, on a stop)
                                      Trip-*.js            26,311 B  (new, on Trip)
                                      PlannerLayout-*.js   11,972 B  (new, on /trip/:id)
                                      + small shared chunks split out by Rollup
                                        (location 14.0K, enrich 5.6K, reservation 3.0K,
                                         settings-helpers 2.8K, ai/photo/walk/helpers/
                                         useTrip/stay ≤1.7K each) — loaded with the
                                         planner route that needs them, not in entry.
```

**Result:** the entry chunk dropped **~225 KB (-27%)**; a Landing/Dashboard visitor no longer downloads `PlannerLayout`/`Itinerary`/`Guide`/`Trip`/`StopDetail` (~198 KB of route code + the shared chunks). The 35–55% prediction was optimistic — the residual 604 KB entry is the React/Router/Query/Supabase **+ framer-motion** vendor baseline (framer is still pinned by the always-on `SplashIntro`; stripping it is the deferred follow-up that would yield the next big drop). **Chunk independence verified:** Guide's unique strings (`DONE · NEXT`, `vyPulse`) appear in exactly one chunk — no barrel leakage.

## Expected outcome (prediction, for context)

Assuming the current ~820 KB entry contains the planner shell + Guide + Trip + StopDetail + Leaflet, we expect: **entry-chunk reduction on the order of 35–55%**; Landing/Dashboard TTI noticeably improved on mobile; the *first* trip-open slightly slower (a one-time chunk fetch, largely hidden by preload-on-intent); subsequent tab navigation effectively instant (browser-cached); and Leaflet no longer penalising non-map users. These are predictions to sanity-check the measured table against, not acceptance gates.

## Risks & mitigations

- **Tab-switch flash:** mitigated by the inner Suspense keeping the shell mounted + a content skeleton + preload-on-intent; chunks are small so the fallback is brief.
- **Worker not serving a hashed chunk (SPA fallback intercepting):** low risk — `worker.js` serves `app/dist` via the ASSETS binding and only falls back to `index.html` for non-asset paths; acceptance #5 explicitly verifies a chunk fetch.
- **Failed chunk fetch (stale deploy / offline):** caught by `ChunkErrorBoundary` → branded "Couldn't load the latest version…" + Reload, instead of a white screen.
- **Barrel-file leakage defeating the split:** caught by acceptance #3 (bundle-visualizer check).
- **A test renders `<App/>`:** handled by awaiting Suspense (see Testing).
- **Reduced-motion:** no extra work — the global CSS rule already stills skeleton shimmer.

## Out of scope / follow-ups

- Vendor `manualChunks` for repeat-visit caching.
- Removing framer-motion from the initial load (requires `SplashIntro` rework).
- Offline / service-worker / PWA (separate workstream #2).
