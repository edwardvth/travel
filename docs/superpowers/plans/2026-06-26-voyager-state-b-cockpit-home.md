# Voyager State B — Cinematic Cockpit Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase-1, in-`AppShell` State-B home with the cinematic, full-bleed **cockpit + searchable "Your travels"** (the approved `/x-home-search-views` direction), wired to real trip data.

**Architecture:** A pure, tested view-model (`home-groups.ts`) splits trips into `featured / upcoming / planning / past`; a full-bleed `CockpitHome` renders the globe + footage hero + featured `CockpitCard` + a `TravelsList` (search + Tiles/Detailed toggle, grouped). `Dashboard` gains a third branch. Hero footage is curated-first → Pexels → girl-walking with a no-flash crossfade. Background/transition geometry is the locked State-C original.

**Tech Stack:** Vite + React 18 + TS + Tailwind (CSS-var tokens), framer-motion, vitest + @testing-library/react. Reuses `selectFocusTrip`, `cockpitModel`, `useTripCover`, `useWeather`, `useUnits`, `useAccountSettings`, `splitTrips`, `FieldGlobe`, `useInViewActive`, `HeroVideoStage`, `clipForWord`, `fetchDestinationVideo`.

**Spec:** `docs/superpowers/specs/2026-06-26-voyager-state-b-cockpit-home-design.md`. Run all commands from `app/`. Keep `npx tsc -b` clean + `npm test` green at every commit. Branch: `field-globe-phase-2`.

**Source of truth for markup:** `app/src/routes/_PreviewHomeSearch.tsx` (the approved preview). UI tasks port its markup, swapping hardcoded mock data for real props/hooks.

---

## Task 1: `home-groups` view-model (pure, TDD)

**Files:**
- Create: `app/src/lib/home-groups.ts`
- Test: `app/src/lib/home-groups.test.ts`

Reuses `selectFocusTrip` (active-wins), `tripStart`/`tripEnd` (already return local `YYYY-MM-DD`, sentinel `'9999-12-31'` for undated), `todayISO`. String compare on `YYYY-MM-DD` is chronological, so no Date math / timezone risk.

- [ ] **Step 1: Write the failing test**

```ts
// app/src/lib/home-groups.test.ts
import { describe, it, expect } from 'vitest'
import { homeGroups, filterTrips, isUndatedTrip } from './home-groups'
import type { Trip } from '../types'

const trip = (id: string, startDate: string | undefined, numDays: number, extra: Partial<Trip['config']> = {}): Trip => ({
  id, title: id,
  config: { startDate, numDays, ...extra },
  data: { days: [], completed: [] },
} as unknown as Trip)

const TODAY = '2026-06-26'

describe('isUndatedTrip', () => {
  it('is true only when there is no startDate', () => {
    expect(isUndatedTrip(trip('a', undefined, 3))).toBe(true)
    expect(isUndatedTrip(trip('b', '2026-07-01', 3))).toBe(false)
  })
})

describe('homeGroups', () => {
  it('features the active trip and EXCLUDES it from all groups', () => {
    const active = trip('active', '2026-06-25', 3)   // 06-25..06-27 — contains today
    const soon = trip('soon', '2026-07-10', 2)
    const g = homeGroups([soon, active], TODAY)
    expect(g.featured?.id).toBe('active')
    expect([...g.upcoming, ...g.planning, ...g.past].map(t => t.id)).toEqual(['soon'])
  })

  it('groups + sorts: upcoming(start asc) → planning(input) → past(end desc), featured removed', () => {
    const featured = trip('f', '2026-07-01', 2)       // soonest upcoming → featured
    const upLater = trip('up', '2026-08-01', 2)
    const planning = trip('plan', undefined, 4)
    const past1 = trip('p1', '2026-06-01', 2)          // ends 06-02
    const past2 = trip('p2', '2026-06-20', 2)          // ends 06-21 (more recent)
    const g = homeGroups([past1, planning, featured, upLater, past2], TODAY)
    expect(g.featured?.id).toBe('f')
    expect(g.upcoming.map(t => t.id)).toEqual(['up'])
    expect(g.planning.map(t => t.id)).toEqual(['plan'])
    expect(g.past.map(t => t.id)).toEqual(['p2', 'p1'])  // end desc
  })

  it('treats a trip ending today as not-past (boundary)', () => {
    const endsToday = trip('e', '2026-06-24', 3)        // 06-24..06-26 = active today
    const g = homeGroups([endsToday], TODAY)
    expect(g.featured?.id).toBe('e')
    expect(g.past).toHaveLength(0)
  })
})

describe('filterTrips', () => {
  it('matches title OR destination, case-insensitive', () => {
    const a = trip('a', '2026-07-01', 2, { destination: 'Paris, France' }) // title 'a'
    a.title = 'Spring Break'
    const b = trip('b', '2026-07-05', 2, { destination: 'Tokyo' })
    const g = homeGroups([a, b], TODAY)
    expect(filterTrips(g, 'paris').upcoming.map(t => t.id)).toEqual(['a'])  // via destination
    expect(filterTrips(g, '').upcoming).toHaveLength(2)                      // passthrough
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/home-groups.test.ts`
Expected: FAIL ("home-groups" not found).

- [ ] **Step 3: Implement `home-groups.ts`**

```ts
// app/src/lib/home-groups.ts
import type { Trip } from '../types'
import { tripStart, tripEnd } from './trip-helpers'
import { selectFocusTrip, todayISO } from './focus-trip'

/** The sentinel `tripStart` uses for a trip with no real dates. Centralized here. */
const UNDATED = '9999-12-31'

/** A trip with no real start date (its `tripStart` is the far-future sentinel). */
export function isUndatedTrip(t: Trip): boolean {
  return tripStart(t) === UNDATED
}

export interface HomeGroups {
  featured: Trip | null
  upcoming: Trip[]   // dated, not past — start asc
  planning: Trip[]   // undated upcoming — input order
  past: Trip[]       // end < today — end desc
}

/**
 * Split trips for the State-B home. Featured = `selectFocusTrip` (active-wins),
 * always EXCLUDED from the three groups. All comparisons are on local
 * `YYYY-MM-DD` strings (chronological as a string compare), so groups don't flip
 * around midnight / across time zones.
 */
export function homeGroups(trips: Trip[], today: string = todayISO()): HomeGroups {
  const featured = selectFocusTrip(trips, today)
  const rest = featured ? trips.filter(t => t.id !== featured.id) : trips

  const past = rest.filter(t => tripEnd(t) < today).sort((a, b) => tripEnd(b).localeCompare(tripEnd(a)))
  const notPast = rest.filter(t => tripEnd(t) >= today)
  const planning = notPast.filter(isUndatedTrip)
  const upcoming = notPast.filter(t => !isUndatedTrip(t)).sort((a, b) => tripStart(a).localeCompare(tripStart(b)))

  return { featured, upcoming, planning, past }
}

/** Lower-cased haystack for a trip: title + destination. (No separate city/country fields exist.) */
function haystack(t: Trip): string {
  return `${t.title ?? ''} ${t.config?.destination ?? ''}`.toLowerCase()
}

/** Filter each group by a trimmed, case-insensitive query (empty = passthrough). */
export function filterTrips(g: HomeGroups, query: string): HomeGroups {
  const q = query.trim().toLowerCase()
  if (!q) return g
  const f = (arr: Trip[]) => arr.filter(t => haystack(t).includes(q))
  return { featured: g.featured, upcoming: f(g.upcoming), planning: f(g.planning), past: f(g.past) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/home-groups.test.ts` → PASS. Then `npx tsc -b` → clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/home-groups.ts app/src/lib/home-groups.test.ts
git commit -m "feat(home): homeGroups/filterTrips/isUndatedTrip view-model (tested)"
```

---

## Task 2: Persist the view-mode in `useAccountSettings`

**Files:**
- Modify: `app/src/data/useAccountSettings.ts`
- Test: `app/src/data/useAccountSettings.test.ts` (extend if present, else create)

- [ ] **Step 1: Write the failing test**

```ts
// app/src/data/useAccountSettings.test.ts
import { describe, it, expect } from 'vitest'
import { parseAccountSettings } from './useAccountSettings'

describe('parseAccountSettings — homeTravelsViewMode', () => {
  it('keeps a valid mode and drops an invalid one', () => {
    expect(parseAccountSettings('{"homeTravelsViewMode":"detailed"}').homeTravelsViewMode).toBe('detailed')
    expect(parseAccountSettings('{"homeTravelsViewMode":"bogus"}').homeTravelsViewMode).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it** → FAIL (property doesn't exist).

- [ ] **Step 3: Extend the type + parser**

In `AccountSettings` add: `homeTravelsViewMode?: 'tiles' | 'detailed'`. In `parseAccountSettings`, after the `voiceId` line:

```ts
  if (rec.homeTravelsViewMode === 'tiles' || rec.homeTravelsViewMode === 'detailed')
    out.homeTravelsViewMode = rec.homeTravelsViewMode
```

(`mergeAccountSettings`/write-through already handle arbitrary keys generically — no other change.)

- [ ] **Step 4: Run** → PASS; `npx tsc -b` clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/useAccountSettings.ts app/src/data/useAccountSettings.test.ts
git commit -m "feat(settings): persist homeTravelsViewMode (tiles|detailed)"
```

---

## Task 3: `CockpitCard` (featured trip card)

**Files:**
- Create: `app/src/components/CockpitCard.tsx`
- Test: `app/src/components/CockpitCard.test.tsx`

Port the card markup from `_PreviewHomeSearch.tsx`'s `CockpitCard` (fixed height, `md` larger, hover-pop, glass header scrim, solid action bar). Replace mock fields with real data + the spec's fallbacks. **The whole card is NOT a button** — only the action-bar buttons + the "N to arrange" link navigate.

Props:
```ts
{
  trip: Trip
  onOpen: (id: string) => void        // → Plan
  onOpenArrange: (id: string) => void // → Trip view
  onOpenGuide: (id: string) => void   // → Guide
  units: Units
  today?: string                      // test seam
}
```

Wiring (mirror the existing `Cockpit.tsx`):
- `m = cockpitModel(trip, today)`; `{ url } = useTripCover(trip)`.
- coords = `destinationGeo` (finite) else `dayAnchorCoords(trip, m.featuredDay)`; `date = dayDate(trip, m.featuredDay)`; `useWeather(coords, date, units)`.
- **countdown:** `m.countdownLabel ?? 'Planning trip'`.
- **context line:** `formatDateRange(trip)` + (`m.stopCount ? `· ${m.stopCount} stops` : '· No stops yet'`); when undated, `formatDateRange` already omits the range.
- **weather row:** render only when `tempMax/tempMin/code` are all non-null; else omit entirely.
- **"N to arrange":** show only when `m.toArrangeCount > 0`; `onClick` stops propagation → `onOpenArrange`.
- **action bar:** `m.phase === 'during'` → big **Start guide** (`onOpenGuide`) + small **Plan** (`onOpen`); else big **Start planning** (or **Open plan** when `m.itineraryComplete`) (`onOpen`) + small **Guide** (`onOpenGuide`).
- **Press/hover:** desktop `[@media(hover:hover)]:hover:-translate-y-1.5`; mobile transient `active:` press (no persistent toggle); `motion-reduce:` disables. No `onClick` on the card root.

- [ ] **Step 1: Write the failing test**

```tsx
// app/src/components/CockpitCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CockpitCard } from './CockpitCard'
import type { Trip } from '../types'

const baseTrip = (over: Partial<Trip['config']>, days: unknown[] = [{ stops: [{ name: 's' }] }]): Trip => ({
  id: 't1', title: 'Tokyo',
  config: { startDate: '2026-07-01', numDays: 1, ...over },
  data: { days, completed: [] },
} as unknown as Trip)

const noop = () => {}

describe('CockpitCard', () => {
  it('before+incomplete shows Start planning (→Plan) and a Guide button; card body is not a button', () => {
    const onOpen = vi.fn()
    render(<CockpitCard trip={baseTrip({}, [{ stops: [] }])} onOpen={onOpen} onOpenArrange={noop} onOpenGuide={noop} units="metric" today="2026-06-01" />)
    fireEvent.click(screen.getByRole('button', { name: /start planning/i }))
    expect(onOpen).toHaveBeenCalledWith('t1')
    // the destination title is not itself a navigation button
    expect(screen.getByText('Tokyo').closest('button')).toBeNull()
  })

  it('during shows Start guide (→Guide)', () => {
    const onOpenGuide = vi.fn()
    render(<CockpitCard trip={baseTrip({ startDate: '2026-06-01' })} onOpen={noop} onOpenArrange={noop} onOpenGuide={onOpenGuide} units="metric" today="2026-06-01" />)
    fireEvent.click(screen.getByRole('button', { name: /start guide/i }))
    expect(onOpenGuide).toHaveBeenCalledWith('t1')
  })

  it('undated trip shows the "Planning trip" countdown', () => {
    render(<CockpitCard trip={baseTrip({ startDate: undefined })} onOpen={noop} onOpenArrange={noop} onOpenGuide={noop} units="metric" today="2026-06-01" />)
    expect(screen.getByText(/planning trip/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run** → FAIL (no component).
- [ ] **Step 3: Implement `CockpitCard.tsx`** — port `_PreviewHomeSearch.tsx`'s `CockpitCard` markup; swap mock fields for the wiring above; add the action handlers; keep `TS_STRONG`/`HEADER_SCRIM` shadow constants (move shared shadow constants into a tiny `app/src/lib/home-style.ts` so cards/lists share them).
- [ ] **Step 4: Run** → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(home): CockpitCard featured trip card (real data + fallbacks)`

---

## Task 4: `TripRow` + `TravelTile` (the two list item types)

**Files:**
- Create: `app/src/components/TripRow.tsx` (detailed row), `app/src/components/TravelTile.tsx` (glass tile)
- Test: `app/src/components/TravelTile.test.tsx`

Both take `{ trip: Trip; onOpen: (id) => void }` and a derived `when`/`kind` (compute inline: `isUndatedTrip` → 'Planning'; `tripEnd < today` → past; else upcoming with `cockpitModel(trip).countdownLabel`). Port markup from `_PreviewHomeSearch.tsx`'s `TripTileGlass` (glass photo + blurred footer; upcoming chip) and `TripRow`. **A click/tap opens Plan** (`onOpen(trip.id)`); the tile's mobile feedback is a transient `active:` press (no toggle).

- [ ] **Step 1: Failing test** — render a `TravelTile`, click it, assert `onOpen` called with the id; assert the upcoming chip text shows for a future trip.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** both components (port markup, real `useTripCover` for the image, `formatDateRange` for dates).
- [ ] **Step 4: Run** → PASS; `tsc -b` clean.
- [ ] **Step 5: Commit** `feat(home): TravelTile + TripRow list items (open Plan)`

---

## Task 5: `TravelsList` (search + clear + toggle + grouped grid)

**Files:**
- Create: `app/src/components/TravelsList.tsx`
- Test: `app/src/components/TravelsList.test.tsx`

Props: `{ trips: Trip[]; featuredId: string; onOpen: (id) => void; userId?: string; today?: string }`.

Behavior:
- `groups = filterTrips(homeGroups(trips, today), query)` (featured already excluded by `homeGroups`; `featuredId` is a redundant guard).
- **Search input** (labelled) + **clear ✕** button (`aria-label="Clear trip search"`, shown when `query`, resets); **Escape** in the input clears.
- **View toggle** (`LayoutGrid`/`LayoutList`, `aria-pressed`): value = `settings.homeTravelsViewMode ?? 'tiles'`; on change `setSettings({ homeTravelsViewMode: v })` via `useAccountSettings(userId)`. No layout shift while settings load (default tiles).
- **Grouped render, fixed order Upcoming → Planning → Past.** Each group renders its `<h3>` label **only if it has ≥1 visible trip**; the whole list is never a single flattened grid. Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, no horizontal scroll, no nested scroll. Tiles use `TravelTile`; Detailed uses `TripRow` (+ `md` column header).
- Empty (all groups empty after filter) → "No trips match …".

- [ ] **Step 1: Failing test**

```tsx
// app/src/components/TravelsList.test.tsx — key assertions
// - renders "Upcoming" + "Past" headings for a mix; hides "Planning" when none
// - typing "paris" filters to matching trips; clear button (aria 'Clear trip search') resets
// - clicking the LayoutList toggle switches to rows (assert a row-only testid/text appears)
```
(Wrap in a QueryClientProvider; `userId={undefined}` keeps settings in-memory.)

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement `TravelsList.tsx`.**
- [ ] **Step 4: Run** → PASS; `tsc -b` clean.
- [ ] **Step 5: Commit** `feat(home): TravelsList — search + view toggle + grouped grid`

---

## Task 6: Hero destination clip (curated-first → Pexels, no-flash)

**Files:**
- Create: `app/src/hero/useDestinationClip.ts`
- Test: `app/src/hero/useDestinationClip.test.ts`
- (Already on branch, now first-class: `app/src/hero/destinationVideo.ts`.)

`useDestinationClip(trip)` → `{ clip: HeroClip; credit }`:
- Start with `FIRST_CLIP` (girl-walking) so the hero is never blank.
- **Curated-first:** if `WORD_TO_CLIP` has the destination, i.e. `clipForWord(destination) !== FIRST_CLIP`, set that immediately (instant). Add an exported `curatedClipFor(word): HeroClip | null` to `wordClips.ts` (returns the mapped clip or `null`) so "is curated" isn't a `=== FIRST_CLIP` hack.
- **Else Pexels:** `fetchDestinationVideo(destination, '')` in a cancellable effect; on success `setClip(clipFromDestinationVideo(destination, v))` + keep credit. On miss/error, leave `FIRST_CLIP`. `HeroVideoStage` already crossfades on clip change and won't blank (no layout shift).

`destination = trip.config?.destination || trip.title`. (No separate city/country; the edge fn handles a single string.)

- [ ] **Step 1: Failing test** — mock `fetchDestinationVideo`; (a) a curated destination ("Tokyo") yields the curated clip without calling Pexels; (b) an uncurated destination ("Sochi") starts at `FIRST_CLIP` then swaps to the Pexels clip; (c) a Pexels miss keeps `FIRST_CLIP`. (Use `renderHook` + `waitFor`.)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `curatedClipFor` in `wordClips.ts` + `useDestinationClip.ts`.
- [ ] **Step 4: Run** → PASS; `tsc -b` clean.
- [ ] **Step 5: Commit** `feat(home): useDestinationClip — curated-first then Pexels, no-flash`

---

## Task 7: `CockpitHome` (full-bleed State B)

**Files:**
- Create: `app/src/components/CockpitHome.tsx`
- Test: `app/src/components/CockpitHome.test.tsx`

Assemble, reusing State C's geometry exactly (globe box `185vh`/`top-20vh`/`170vh`; hero `100svh`, mask `70→96%`, brightness `1.8`; "Your travels" `-mt-[18vh]`; `useInViewActive` for one-animated-background). Port the hero + section scaffolding from `_PreviewHomeSearch.tsx`.

Props:
```ts
{
  trips: Trip[]
  focus: Trip                 // = selectFocusTrip(trips), passed by Dashboard
  firstName: string
  units: Units
  userId?: string
  onCreate: () => void
  onOpen: (id) => void; onOpenArrange: (id) => void; onOpenGuide: (id) => void
  headerRight: ReactNode      // ThemeToggle + New trip + AccountMenu (same as State C)
}
```
- Hero: `useDestinationClip(focus)` → `HeroVideoStage clip playing={heroActive}` (masked, brightness 1.8); headline `Welcome back, {firstName}.`; the `CockpitCard` (with a `SoftBackdrop` halo), `max-w-[440px] md:max-w-[620px]`, top-anchored.
- Below: `<TravelsList trips={trips} featuredId={focus.id} onOpen={onOpen} userId={userId} />` over the globe; the globe `sentinel` (`globeRef`) sits at the top of this section.
- Pexels attribution link (subtle, from the clip credit) per Pexels guidelines.

- [ ] **Step 1: Failing test** — render with a small `trips` set; assert: headline present; featured trip's title appears in the hero; the featured trip's title does **not** appear in the "Your travels" list region; a "New trip" affordance from `headerRight` renders. (Wrap in Query + Router providers.)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement `CockpitHome.tsx`.**
- [ ] **Step 4: Run** → PASS; `tsc -b` clean.
- [ ] **Step 5: Commit** `feat(home): CockpitHome full-bleed State B (hero + cockpit + travels)`

---

## Task 8: Wire `Dashboard`'s third branch (keep old path)

**Files:**
- Modify: `app/src/routes/Dashboard.tsx`

- [ ] **Step 1:** Add the early-return **before** the existing `focus` AppShell block, mirroring the State-C early-return:

```tsx
if (!isLoading && focus) {
  return (
    <>
      <CockpitHome
        trips={trips ?? []} focus={focus} firstName={firstName} units={units} userId={user?.id}
        onCreate={openCreateTrip} onOpen={openTrip} onOpenArrange={openArrange} onOpenGuide={openGuide}
        headerRight={
          <div className="flex items-center gap-2.5 text-white [&_button]:text-white">
            <ThemeToggle />
            <Button variant="claret" onClick={openCreateTrip}><Plus size={16} strokeWidth={2.5} />New trip</Button>
            <AccountMenu email={user?.email ?? ''} profile={profile} />
          </div>
        }
      />
      {overlays}
    </>
  )
}
```
Keep the existing `focus` AppShell branch **in place** (now unreachable but retained) until Task 9 verifies parity. Loading + State-C branches unchanged.

- [ ] **Step 2:** `npm test` (full) + `npx tsc -b` + `npm run build` → all green.
- [ ] **Step 3:** Manual smoke (preview/dev): an account with a trip shows the cinematic cockpit; New trip / open / share / delete reachable from it.
- [ ] **Step 4: Commit** `feat(home): render CockpitHome as State B (old path retained pending verification)`

---

## Task 9: Verify parity, then remove the Phase-1 State-B path

**Files:**
- Modify: `app/src/routes/Dashboard.tsx` (+ delete now-unused imports), possibly remove `app/src/components/Cockpit.tsx` if nothing else imports it.

- [ ] **Step 1:** Verify end-to-end against the spec's regression guard: **New trip** (incl. teaser gating), **Share**, **Delete** (owner-gated), **cover/destination backfill**, **open trip** (Plan/Guide/Trip), **founder/credits**. Note results in the commit body.
- [ ] **Step 2:** Remove the old `focus` AppShell block + now-dead imports (`Cockpit`, `Segmented`, and `TripGrid`/`AddTripTile` if unused by the remaining branches). Run `npx tsc -b` to catch unused/dead references.
- [ ] **Step 3:** Delete `app/src/components/Cockpit.tsx` + `Cockpit.test.tsx` only if `git grep "from './Cockpit'" app/src` returns nothing. (Keep `cockpit-model.ts` — still used.)
- [ ] **Step 4:** `npm test` + `npx tsc -b` + `npm run build` → green.
- [ ] **Step 5: Commit** `refactor(home): remove Phase-1 State-B cockpit path (parity verified)`

---

## Task 10: Archive the preview explorations (reference-only)

**Files:**
- Move: `app/src/routes/_PreviewCockpit.tsx`, `_PreviewLayouts.tsx`, `_PreviewHomeInteractions.tsx`, `_PreviewHomeSearch.tsx` → `app/src/routes/_home-explorations/`
- Modify: `app/src/App.tsx` (remove the 7 `/x-*` routes + their imports), `app/tsconfig.json` (exclude the folder)

- [ ] **Step 1:** `git mv` the 4 files into `app/src/routes/_home-explorations/`.
- [ ] **Step 2:** In `App.tsx` remove the imports (`PreviewCockpit`, `PreviewLayouts`, `PreviewHomeInteractions`, `PreviewHomeSearch`) and the 7 `<Route path="/x-...">` lines.
- [ ] **Step 3:** In `app/tsconfig.json` add `"exclude": ["src/routes/_home-explorations"]` (alongside `"include": ["src"]`).
- [ ] **Step 4:** Verify isolation: `git grep -n "_home-explorations" app/src` returns **only** the folder's own files (no app imports). `npx tsc -b` clean (the archive isn't compiled), `npm run build` succeeds, and no `/x-*` route resolves (SPA falls back to `/`).
- [ ] **Step 5: Commit** `chore(home): archive preview explorations (excluded from build, not routed)`

---

## Task 11: Holistic review, merge, deploy

- [ ] **Step 1:** Dispatch a final code-reviewer over the whole State-B diff (`git diff origin/main...field-globe-phase-2 -- app/src docs`). Address blocking findings.
- [ ] **Step 2:** Run the spec's **Acceptance checklist** end-to-end. `npm test` + `npx tsc -b` + `npm run build` green.
- [ ] **Step 3:** Merge `field-globe-phase-2` → `main` (this brings the parked State-B + **Pexels source** commits: `supabase/functions/pexels-video/`, `docs/supabase/video-cache.sql`, `app/src/hero/destinationVideo.ts`). Push `origin/main` (fast-forward).
- [ ] **Step 4:** Deploy: from repo root `cd app && npm run build` then `npx wrangler deploy`. Smoke-test `/trips` (State B + State C), `/auth`, a planner route → 200.
- [ ] **Step 5:** Tag `state-b-cockpit-home`; update `handoff.md`.

---

## Self-review notes

- **Spec coverage:** layout/geometry (T7), cockpit card + fallbacks + non-clickable body (T3), curated→Pexels no-flash + different-media (T6/T3), grouped Upcoming→Planning→Past + labels-when-visible (T1/T5), search title+destination + clear/Escape (T1/T5), view-mode persistence (T2/T5), responsive grid no-rail (T5), Dashboard third branch + regression guard (T8/T9), archive reference-only + zero-import (T10), acceptance + merge/deploy (T11). The spec's `city`/`country` search is reconciled to **destination-only** (no such fields exist) — noted in T1.
- **Type consistency:** `homeGroups`/`filterTrips`/`isUndatedTrip`, `HomeGroups`, `homeTravelsViewMode`, `useDestinationClip`/`curatedClipFor` are referenced consistently across tasks.
