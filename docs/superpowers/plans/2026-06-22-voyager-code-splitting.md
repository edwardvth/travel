# Voyager Code-Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the ~829 KB entry chunk by lazy-loading the planner routes per tab, so Landing/Dashboard load fast on mobile data — with invisible-quality Suspense skeletons, preload-on-intent, and a chunk error boundary.

**Architecture:** Convert the five planner route elements (`PlannerLayout`, `Itinerary`, `Guide`, `Trip`, `StopDetail`) to `React.lazy`, driven by shared import thunks in `trip/lazyRoutes.ts`. Two Suspense boundaries (page-level in `App.tsx`, content-level around `PlannerLayout`'s `<Outlet/>`), both wrapped in a `ChunkErrorBoundary`. The planner tab bar preloads a tab's chunk on hover/focus/touch. Leaflet is **already** lazy (`TripMapView` does `await import('leaflet')`), so it only gets a loading skeleton. `Landing`/`Auth`/`Dashboard`/`SplashIntro` stay eager.

**Tech Stack:** React 18 + TypeScript, Vite (Rollup), React Router v6, Tailwind (CSS-var tokens), vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-22-voyager-code-splitting-design.md`

**All commands run from `app/`** (the Vite project) unless noted. Commit message trailer for every commit:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `app/src/trip/lazyRoutes.ts` | Dynamic-import thunks for the planner routes (shared by `lazy()` + preload) | **create** |
| `app/src/components/RouteFallbacks.tsx` | `RouteFallback` + `PlannerContentFallback` Suspense skeletons | **create** |
| `app/src/components/ChunkErrorBoundary.tsx` | Error boundary: chunk-load vs render-crash messaging + Reload | **create** |
| `app/src/components/ChunkErrorBoundary.test.tsx` | Tests for both branches + happy path | **create** |
| `app/src/App.tsx` | `lazy()` the planner routes; wrap `<Routes>` in `ChunkErrorBoundary` + `Suspense` | **modify** |
| `app/src/trip/PlannerLayout.tsx` | `Suspense` (+ boundary) around `<Outlet/>`; preload-on-intent on tabs | **modify** |
| `app/src/trip/TripMapView.tsx` | `MapSkeleton` while Leaflet/map loads | **modify** |

---

### Task 0: Record the baseline build sizes

**Files:** none (measurement only).

- [ ] **Step 1: Build and capture current chunk sizes**

Run:
```bash
cd app && npm run build
ls -la dist/assets/*.js | awk '{print $5, $9}' | sort -rn
```
Expected: a dominant `index-*.js` around **~830 KB** and a separate `leaflet-src-*.js` (~150 KB). Paste the numbers into the spec's "Implementation notes" before/after table under **Before** (the `index` row). No commit — this is the measurement baseline for Task 7.

---

### Task 1: Shared lazy-import thunks

**Files:**
- Create: `app/src/trip/lazyRoutes.ts`

- [ ] **Step 1: Create the thunks module**

```ts
/**
 * Dynamic-import thunks for the planner routes. Shared by `App.tsx` (which wraps
 * each in `React.lazy`) and `PlannerLayout` (preload-on-intent on the tab bar).
 * Using the SAME module specifier in both places means Vite emits one chunk per
 * route, and a preloaded fetch satisfies the later `lazy()` from cache.
 */
export const importPlannerLayout = () => import('./PlannerLayout')
export const importItinerary = () => import('./Itinerary')
export const importGuide = () => import('./Guide')
export const importTrip = () => import('./Trip')
export const importStopDetail = () => import('./StopDetail')
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc -b`
Expected: clean (exit 0). The module isn't imported yet, so nothing else changes.

- [ ] **Step 3: Commit**

```bash
git add app/src/trip/lazyRoutes.ts
git commit -m "feat(perf): add shared lazy-import thunks for planner routes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Suspense fallback skeletons

**Files:**
- Create: `app/src/components/RouteFallbacks.tsx`

Both reuse the existing `Skeleton` primitive (`components/ui/Skeleton.tsx` → `animate-pulse rounded-md bg-skeleton`), which already stills under `prefers-reduced-motion` via the global rule in `index.css`. Token-themed (`bg-base`), space reserved to avoid layout shift.

- [ ] **Step 1: Create the fallbacks**

```tsx
import { Skeleton } from './ui/Skeleton'

/**
 * Page-level Suspense fallback — shown while a lazy route chunk (e.g. the
 * planner shell) loads. Fills the viewport with a calm, branded skeleton so
 * there's no flash of blank between routes.
 */
export function RouteFallback() {
  return (
    <div className="min-h-screen bg-base px-5 md:px-8 py-6" role="status" aria-label="Loading">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-[160px] w-full rounded-[18px]" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}

/**
 * Content-area Suspense fallback — shown while a planner *tab* chunk loads.
 * Sized to the planner body (the shell stays mounted around it), so switching
 * tabs never blanks the day rail / header / tab bar.
 */
export function PlannerContentFallback() {
  return (
    <div className="px-5 md:px-8 py-6 md:py-8" role="status" aria-label="Loading">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Skeleton className="h-[160px] w-full rounded-[18px]" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc -b`
Expected: clean (exit 0).

- [ ] **Step 3: Commit**

```bash
git add app/src/components/RouteFallbacks.tsx
git commit -m "feat(perf): add route + planner-content Suspense fallback skeletons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: ChunkErrorBoundary (TDD)

**Files:**
- Create: `app/src/components/ChunkErrorBoundary.tsx`
- Test: `app/src/components/ChunkErrorBoundary.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChunkErrorBoundary } from './ChunkErrorBoundary'

/** A child that throws on render, to trip the boundary. */
function Boom({ message }: { message: string }): never {
  throw new Error(message)
}

describe('ChunkErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught errors to console.error; silence the expected noise.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the stale-version message + Reload for a chunk-load error', () => {
    render(
      <ChunkErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: https://x/assets/Guide-abc.js" />
      </ChunkErrorBoundary>,
    )
    expect(screen.getByText(/Couldn't load the latest version/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('shows the generic crash message + Reload for a non-chunk error', () => {
    render(
      <ChunkErrorBoundary>
        <Boom message="Cannot read properties of undefined (reading 'x')" />
      </ChunkErrorBoundary>,
    )
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('renders children when there is no error', () => {
    render(
      <ChunkErrorBoundary>
        <p>hello</p>
      </ChunkErrorBoundary>,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npx vitest run src/components/ChunkErrorBoundary.test.tsx`
Expected: FAIL — `Failed to resolve import "./ChunkErrorBoundary"` (module doesn't exist yet).

- [ ] **Step 3: Implement the boundary**

```tsx
import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './ui/Button'

/** Matches the dynamic-import failure messages across browsers. */
const CHUNK_ERR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk \d+ failed/i

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Catches errors from lazy route chunks so a failed fetch (stale chunk after a
 * deploy, network blip, offline resume) never white-screens. Distinguishes a
 * chunk-load failure from a generic render crash for honest messaging + tagged
 * logs. Recovery is a full reload — the only reliable fix for a stale chunk hash
 * (the old URL is gone); autosave persists to Supabase, so no work is lost.
 *
 * The one class component in the codebase, because React error boundaries must
 * be classes.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    const isChunk = CHUNK_ERR.test(error?.message ?? '')
    console.error(isChunk ? '[chunk-load]' : '[render-crash]', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isChunk = CHUNK_ERR.test(error.message ?? '')
    return (
      <div role="alert" className="grid place-items-center min-h-[50vh] px-6 text-center">
        <div className="max-w-sm">
          <span
            aria-hidden="true"
            className="mx-auto grid place-items-center w-12 h-12 rounded-2xl border border-hair bg-fill text-muted"
          >
            <AlertTriangle size={22} />
          </span>
          <h2 className="mt-4 font-serif text-2xl text-ink">
            {isChunk ? "Couldn't load the latest version of Voyager." : 'Something went wrong.'}
          </h2>
          <p className="mt-2 text-[14px] text-muted leading-relaxed">
            {isChunk
              ? 'A new version may have just shipped. Reload to get it.'
              : 'An unexpected error occurred. Reloading usually clears it.'}
          </p>
          <div className="mt-5">
            <Button variant="claret" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npx vitest run src/components/ChunkErrorBoundary.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `cd app && npx tsc -b` → clean.
```bash
git add app/src/components/ChunkErrorBoundary.tsx app/src/components/ChunkErrorBoundary.test.tsx
git commit -m "feat(perf): add ChunkErrorBoundary (chunk-load vs render-crash + Reload)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Lazy-load the planner routes in App.tsx

**Files:**
- Modify: `app/src/App.tsx` (full rewrite of the file — small)

- [ ] **Step 1: Replace App.tsx**

```tsx
import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './routes/Landing'
import Auth from './routes/Auth'
import Dashboard from './routes/Dashboard'
import SplashIntro from './components/SplashIntro'
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary'
import { RouteFallback } from './components/RouteFallbacks'
import {
  importPlannerLayout,
  importItinerary,
  importGuide,
  importTrip,
  importStopDetail,
} from './trip/lazyRoutes'

// Planner routes are lazy — a Landing/Dashboard visitor never downloads them.
// Same thunks are reused by PlannerLayout for preload-on-intent (one chunk each).
const PlannerLayout = lazy(importPlannerLayout)
const Itinerary = lazy(importItinerary)
const Guide = lazy(importGuide)
const Trip = lazy(importTrip)
const StopDetail = lazy(importStopDetail)

export default function App() {
  return (
    <>
      <ChunkErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/trips" element={<Dashboard />} />
            <Route path="/trip/:id" element={<PlannerLayout />}>
              <Route index element={<Itinerary />} />
              <Route path="guide" element={<Guide />} />
              <Route path="trip" element={<Trip />} />
              <Route path="stop/:day/:n" element={<StopDetail />} />
              {/* Single-meaning redirects from the retired 4-tab nav. */}
              <Route path="bookings" element={<Navigate to="../trip" replace />} />
              <Route path="map" element={<Navigate to=".." replace />} />
              <Route path="settings" element={<Navigate to="/trips" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ChunkErrorBoundary>
      <SplashIntro />
    </>
  )
}
```

- [ ] **Step 2: Typecheck + full test suite (no App test exists, so it stays green)**

Run: `cd app && npx tsc -b && npm test`
Expected: tsc clean; **all tests pass** (no test renders `<App/>`, verified during planning).

- [ ] **Step 3: Build and confirm the chunks split out**

Run: `cd app && npm run build && ls dist/assets/*.js`
Expected: distinct `PlannerLayout-*.js`, `Itinerary-*.js`, `Guide-*.js`, `Trip-*.js`, `StopDetail-*.js` chunks now exist, and `index-*.js` is materially smaller than the Task 0 baseline.

- [ ] **Step 4: Commit**

```bash
git add app/src/App.tsx
git commit -m "feat(perf): lazy-load planner routes behind Suspense + ChunkErrorBoundary

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Planner Outlet Suspense + preload-on-intent

**Files:**
- Modify: `app/src/trip/PlannerLayout.tsx`

- [ ] **Step 1: Add imports**

At the top of `PlannerLayout.tsx`, change the React import (line 1) and add three new imports:

```tsx
import { Suspense, useEffect } from 'react'
```
and (after the existing `import { Skeleton } from '../components/ui/Skeleton'` line):
```tsx
import { ChunkErrorBoundary } from '../components/ChunkErrorBoundary'
import { PlannerContentFallback } from '../components/RouteFallbacks'
import { importGuide, importTrip, importItinerary } from './lazyRoutes'
```

- [ ] **Step 2: Add `preload` to the section items**

Update the `SectionItem` interface (currently `to/label/end?/Icon`) to add a preload thunk:
```tsx
interface SectionItem {
  to: string
  label: string
  end?: boolean
  Icon: LucideIcon
  preload: () => Promise<unknown>
}
```
Update `sectionItems` to attach the thunks:
```tsx
function sectionItems(id: string): SectionItem[] {
  return [
    { to: `/trip/${id}/guide`, label: 'Guide', Icon: Compass, preload: importGuide },
    { to: `/trip/${id}/trip`, label: 'Trip', Icon: Briefcase, preload: importTrip },
  ]
}
```

- [ ] **Step 3: Wire preload onto BOTH nav bars' section NavLinks**

In the **desktop sidebar** map (currently `{items.map(({ to, label, end, Icon }) => (`), add `preload` to the destructure and the three handlers to the `<NavLink>`:
```tsx
{items.map(({ to, label, end, Icon, preload }) => (
  <NavLink
    key={to}
    to={to}
    end={end}
    onPointerEnter={preload}
    onFocus={preload}
    onTouchStart={preload}
    className={({ isActive }) =>
      cn(
        'inline-flex items-center gap-2.5 min-h-[40px] px-3 rounded-btn text-left text-[13px] font-bold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
        isActive ? 'bg-fill text-ink' : 'text-muted hover:text-ink hover:bg-fill',
      )
    }
  >
    {({ isActive }) => (
      <span aria-current={isActive ? 'page' : undefined} className="inline-flex items-center gap-2.5">
        <Icon size={15} aria-hidden="true" className="flex-none" />
        {label}
      </span>
    )}
  </NavLink>
))}
```

In the **mobile bottom bar** map (currently `{items.map(({ to, label, end, Icon }) => (`), do the same — add `preload` to the destructure and the three handlers to that `<NavLink>`:
```tsx
{items.map(({ to, label, end, Icon, preload }) => (
  <NavLink
    key={to}
    to={to}
    end={end}
    onPointerEnter={preload}
    onFocus={preload}
    onTouchStart={preload}
    className={({ isActive }) =>
      cn(
        'flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-bold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sig-link',
        isActive ? 'text-sig-link' : 'text-muted',
      )
    }
  >
    {({ isActive }) => (
      <span aria-current={isActive ? 'page' : undefined} className="flex flex-col items-center gap-1">
        <Icon size={18} aria-hidden="true" />
        {label}
      </span>
    )}
  </NavLink>
))}
```

And on the **mobile Plan tab** `<NavLink>` (the one with `to={`${planPath}...`}`), preload the Itinerary (index) chunk — add the three handlers:
```tsx
onPointerEnter={importItinerary}
onFocus={importItinerary}
onTouchStart={importItinerary}
```
(Insert them alongside the existing `to=` / `end` props on that NavLink. The desktop "Plan" is the day list + index route, which loads when the planner opens, so no separate preload there.)

- [ ] **Step 4: Wrap the `<Outlet/>` in the boundary + Suspense**

Replace the `<main>…<Outlet … /></main>` block with:
```tsx
<main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto pb-24 md:pb-0">
  <ChunkErrorBoundary>
    <Suspense fallback={<PlannerContentFallback />}>
      <Outlet
        context={{ trip, canEdit, save, saving, lastSavedAt, saveError, activeDay, setActiveDay } satisfies PlannerOutletContext}
      />
    </Suspense>
  </ChunkErrorBoundary>
</main>
```

- [ ] **Step 5: Typecheck + full suite**

Run: `cd app && npx tsc -b && npm test`
Expected: tsc clean; all tests pass (Guide/Itinerary/Trip tests import their components directly and don't mount `PlannerLayout`, so they're unaffected).

- [ ] **Step 6: Commit**

```bash
git add app/src/trip/PlannerLayout.tsx
git commit -m "feat(perf): planner Outlet Suspense + preload-on-intent for tabs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Map loading skeleton (already-lazy Leaflet)

**Files:**
- Modify: `app/src/trip/TripMapView.tsx`

`TripMapView` already lazy-imports Leaflet (`await import('leaflet')`) and tracks readiness via the `ready` counter (`const [ready, setReady] = useState(0)`, incremented to `1` once the map is created). While `ready === 0` the map pane shows a flat `bg-fill`. Replace that flash with a skeleton.

- [ ] **Step 1: Import the Skeleton primitive**

Add to the imports at the top of `TripMapView.tsx`:
```tsx
import { Skeleton } from '../components/ui/Skeleton'
```

- [ ] **Step 2: Render the skeleton over the map pane until ready**

In the returned JSX (`return ( <div className={cn('relative', className)}> … </div> )`), immediately after the map container div (`<div ref={containerRef} className="absolute inset-0 bg-fill" … />`), add:
```tsx
{ready === 0 && <Skeleton className="absolute inset-0 rounded-none" aria-label="Loading map" />}
```
This overlays a shimmer while `import('leaflet')` + map init run, then disappears when `setReady` bumps `ready` to `1`. (In jsdom the Leaflet effect is intentionally skipped, so `ready` stays `0` — harmless, and there are no `TripMapView` tests.)

- [ ] **Step 3: Typecheck + full suite + build**

Run: `cd app && npx tsc -b && npm test && npm run build`
Expected: tsc clean; all tests pass; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/src/trip/TripMapView.tsx
git commit -m "feat(perf): map skeleton while Leaflet loads (already-lazy import)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Verify the split — independence + sizes

**Files:** none (verification + spec notes).

- [ ] **Step 1: Full build**

Run: `cd app && npm run build`
Expected: succeeds; the chunk-size warning should be gone or much smaller.

- [ ] **Step 2: Confirm the chunks exist and read their sizes**

Run:
```bash
cd app && ls -la dist/assets/*.js | awk '{print $5, $9}' | sort -rn
```
Expected: separate `PlannerLayout-*`, `Itinerary-*`, `Guide-*`, `Trip-*`, `StopDetail-*`, and `leaflet-src-*` chunks, with `index-*` materially smaller than the Task 0 baseline. Record all rows in the spec's **After** table.

- [ ] **Step 3: Chunk-independence check (the barrel-leakage guard)**

`Guide`'s swipe hint string `DONE · NEXT` is unique to the Guide module. Confirm it lives **only** in the Guide chunk:
```bash
cd app && grep -l "DONE · NEXT" dist/assets/*.js
```
Expected: exactly **one** file — `dist/assets/Guide-*.js`. If it also appears in `StopDetail-*`/`Itinerary-*`/`Trip-*`, a barrel/transitive import is leaking Guide into a sibling chunk — fix by importing the specific module path instead of a barrel, then rebuild. (Optional deeper view: `npx vite-bundle-visualizer` for the treemap.)

- [ ] **Step 4: Record results in the spec**

Fill the before/after table in `docs/superpowers/specs/2026-06-22-voyager-code-splitting-design.md` ("Implementation notes") with the real numbers, and commit:
```bash
git add docs/superpowers/specs/2026-06-22-voyager-code-splitting-design.md
git commit -m "docs(perf): record before/after chunk sizes after code-splitting

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Deploy + Cloudflare smoke

**Files:** none (deploy + verify).

- [ ] **Step 1: Final green gate**

Run: `cd app && npm test && npx tsc -b && npm run build`
Expected: 516 (+ the 3 ChunkErrorBoundary tests) passing; tsc clean; build succeeds.

- [ ] **Step 2: Deploy**

Run (from repo root): `npx wrangler deploy`
Expected: uploads the new hashed chunk assets; prints the live URL + version id.

- [ ] **Step 3: Smoke the routes**

Run:
```bash
for p in "/" "/trips" "/trip/stl" "/trip/stl/guide" "/trip/stl/trip"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://voyager.edwardvth.workers.dev$p"); echo "$code  $p"; done
```
Expected: all `200`.

- [ ] **Step 4: Confirm lazy chunks actually fetch under the Worker**

Pick a planner chunk filename from `app/dist/assets/` (e.g. `Guide-<hash>.js`) and fetch it directly:
```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "https://voyager.edwardvth.workers.dev/assets/Guide-<hash>.js"
```
Expected: `200` with a JavaScript content-type (the Worker serves the hashed asset; SPA fallback to `index.html` does **not** intercept it). Also open the live site in a browser, navigate Landing → Dashboard → open a trip → Plan/Guide/Trip, and confirm in DevTools Network that each tab fetches its own chunk on first visit, with no white screen and no layout shift.

- [ ] **Step 5: (No commit)** — deploy is not a code change; the size-table commit landed in Task 7.

---

## Self-review notes (author)

- **Spec coverage:** lazy planner routes (Task 4) · per-tab via Outlet Suspense (Task 5) · Leaflet already lazy → MapSkeleton only (Task 6) · three fallbacks (Tasks 2 + 6) · preload-on-intent (Task 5; StopDetail preload deferred — see below) · ChunkErrorBoundary chunk-vs-crash + test (Task 3) · chunk-independence check (Task 7) · before/after table (Tasks 0 + 7) · Cloudflare smoke incl. chunk fetch (Task 8). All covered.
- **Deferred from the spec's preload list:** **StopDetail** preload-on-intent. StopDetail isn't in the tab bar (it's opened from stop rows in `StopList`/`StopRow`), so wiring its preload means touching those row components — lower value (StopDetail is low-traffic) and out of the tab-bar surface this plan edits. The `importStopDetail` thunk still backs its `lazy()` in `App.tsx`; preload on stop-row hover is a clean follow-up. This is consistent with the spec calling preload "an enhancement, not an acceptance gate."
- **Type consistency:** `SectionItem.preload: () => Promise<unknown>` matches the thunks' signature; `ChunkErrorBoundary` Props/State used consistently; `Button` forwards `onClick` (verified).
- **No `<App/>` / `TripMapView` / `Itinerary` / `PlannerLayout` tests exist**, so the only new test is `ChunkErrorBoundary.test.tsx`; acceptance count is "516 + 3".
