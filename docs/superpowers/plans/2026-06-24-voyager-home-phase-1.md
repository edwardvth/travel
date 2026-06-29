# Voyager Home — Phase 1 (Structural Home) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Voyager home page into the context-driven two-state home from the spec — a single-surface **cockpit** when an upcoming trip exists, an editorial **launchpad** when not — reusing the bento gallery already on this branch.

**Architecture:** All branching logic is pushed into two pure, unit-tested modules (`selectFocusTrip`, `cockpitModel`) so React components stay dumb. `Dashboard` becomes a thin orchestrator: it picks the focus trip, renders `Cockpit` (State B) or `Launchpad` (State C), and shares one extracted `TripGrid` for the gallery in both states. Phase-1 trip creation still routes through the existing `NewTripSheet`, but every trigger now goes through a single `openCreateTrip()` indirection so Phase 3 is a one-place swap. The field-globe shader (Phase 2) and the command pill (Phase 3) are explicitly **out of scope**; State C ships with a static fallback backdrop and a pill-styled button that opens `NewTripSheet`.

**Tech Stack:** Vite + React 18 + TypeScript, Tailwind (CSS-var tokens), framer-motion, TanStack Query, vitest + @testing-library/react (jsdom). Run everything from `app/`.

**Scope guardrails (must hold at every commit):**
- `npx tsc -b` clean.
- `npm test` green.
- No new backend; no new data fields; everything derives from existing `trips`.
- Out of scope: shader, command pill, range calendar, retiring `NewTripSheet`.

---

## File Structure

**New (pure logic + tests)**
- `app/src/lib/focus-trip.ts` — `selectFocusTrip(trips, today?)`, `todayISO()`.
- `app/src/lib/focus-trip.test.ts`
- `app/src/lib/cockpit-model.ts` — `cockpitModel(trip, today?)` view-model.
- `app/src/lib/cockpit-model.test.ts`
- `app/src/lib/bento.ts` — `spanClass(i,n)`, `isFeature(i,n)` (moved out of `Dashboard`).
- `app/src/lib/bento.test.ts`

**New (components + tests)**
- `app/src/components/useTripCover.ts` — cover-resolution hook (extracted from `TripTile`).
- `app/src/components/Cockpit.tsx` — State B single-surface cockpit.
- `app/src/components/Cockpit.test.tsx`
- `app/src/components/TripGrid.tsx` — the bento gallery, reused by both states.
- `app/src/components/Launchpad.tsx` — State C hero + Past voyages / value trio.
- `app/src/components/Launchpad.test.tsx`

**Modified**
- `app/src/components/TripTile.tsx` — use the extracted `useTripCover`.
- `app/src/trip/helpers.ts` — add `dayAnchorCoords(trip, day)`.
- `app/src/routes/Dashboard.tsx` — orchestrate the two states; `openCreateTrip()` indirection.

**Deleted**
- `app/src/components/DashboardEmpty.tsx` — superseded by `Launchpad` (removed in Task 8).

---

## Task 1: `selectFocusTrip` — choose the cockpit trip

**Files:**
- Create: `app/src/lib/focus-trip.ts`
- Test: `app/src/lib/focus-trip.test.ts`

Precedence (spec §4): **active** (`start ≤ today ≤ end`, soonest end first) → **soonest dated upcoming** → **undated upcoming** (input order) → `null`. "Upcoming" = not past = `tripEnd ≥ today`. Reuses `tripStart`/`tripEnd` from `trip-helpers` (undated trips have `tripStart === '9999-12-31'`).

- [ ] **Step 1: Write the failing test**

```ts
// app/src/lib/focus-trip.test.ts
import { describe, it, expect } from 'vitest'
import { selectFocusTrip } from './focus-trip'
import type { Trip } from '../types'

const mk = (id: string, cfg: Partial<Trip['config']>): Trip => ({
  id, owner_id: 'o', title: id, subtitle: null,
  config: cfg, data: { days: [], completed: [], hotel: null },
})

const TODAY = '2026-07-10'

describe('selectFocusTrip', () => {
  it('returns null when there are no trips', () => {
    expect(selectFocusTrip([], TODAY)).toBeNull()
  })

  it('returns null when every trip is past', () => {
    const past = mk('past', { startDate: '2026-01-01', numDays: 3 })
    expect(selectFocusTrip([past], TODAY)).toBeNull()
  })

  it('prefers an active (in-progress) trip over a sooner-starting future one', () => {
    const active = mk('active', { startDate: '2026-07-08', numDays: 5 }) // 08–12, today 10
    const future = mk('future', { startDate: '2026-07-09', numDays: 1 }) // ends 09 → past, excluded
    const futureReal = mk('futureReal', { startDate: '2026-07-20', numDays: 2 })
    expect(selectFocusTrip([futureReal, active], TODAY)!.id).toBe('active')
    void future
  })

  it('picks the soonest dated upcoming trip when none are active', () => {
    const a = mk('a', { startDate: '2026-08-01', numDays: 2 })
    const b = mk('b', { startDate: '2026-07-15', numDays: 2 })
    expect(selectFocusTrip([a, b], TODAY)!.id).toBe('b')
  })

  it('falls back to an undated upcoming trip when there are no dated ones', () => {
    const undated = mk('u', {})
    expect(selectFocusTrip([undated], TODAY)!.id).toBe('u')
  })

  it('prefers a dated upcoming trip over an undated one', () => {
    const dated = mk('d', { startDate: '2026-07-20', numDays: 2 })
    const undated = mk('u', {})
    expect(selectFocusTrip([undated, dated], TODAY)!.id).toBe('d')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/focus-trip.test.ts`
Expected: FAIL — "selectFocusTrip is not a function" / module not found.

- [ ] **Step 3: Write the implementation**

```ts
// app/src/lib/focus-trip.ts
import type { Trip } from '../types'
import { tripStart, tripEnd } from './trip-helpers'

/** Today as a local `YYYY-MM-DD` string. Matches the format `trip-helpers` uses. */
export function todayISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Pick the single trip the home cockpit should focus on (spec §4). Pure +
 * testable via the injectable `today`. Precedence:
 *   1. active (start ≤ today ≤ end) — soonest to end wins
 *   2. soonest dated upcoming (by start)
 *   3. undated upcoming (input order)
 *   4. null → the home renders the Launchpad (State C)
 * "Upcoming" = not past = end ≥ today. Undated trips have tripStart '9999-12-31'.
 */
export function selectFocusTrip(trips: Trip[], today: string = todayISO()): Trip | null {
  const upcoming = trips.filter(t => tripEnd(t) >= today)
  if (upcoming.length === 0) return null

  const active = upcoming
    .filter(t => tripStart(t) <= today) // end ≥ today already; undated start is far future
    .sort((a, b) => tripEnd(a).localeCompare(tripEnd(b)))
  if (active.length) return active[0]

  const dated = upcoming
    .filter(t => tripStart(t) !== '9999-12-31')
    .sort((a, b) => tripStart(a).localeCompare(tripStart(b)))
  if (dated.length) return dated[0]

  return upcoming[0] // undated upcoming, input order
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/focus-trip.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/focus-trip.ts app/src/lib/focus-trip.test.ts
git commit -m "feat(home): selectFocusTrip — choose the cockpit trip"
```

---

## Task 2: `cockpitModel` — the derived cockpit view-model

**Files:**
- Create: `app/src/lib/cockpit-model.ts`
- Test: `app/src/lib/cockpit-model.test.ts`

A pure view-model (spec §5.2–5.3). No fetching — weather stays in the component. Phases: `unplanned` (no stops), `during` (active dates), `before` (otherwise). Graceful: no dates → `countdownLabel: null`.

- [ ] **Step 1: Write the failing test**

```ts
// app/src/lib/cockpit-model.test.ts
import { describe, it, expect } from 'vitest'
import { cockpitModel } from './cockpit-model'
import type { Trip, Day } from '../types'

const day = (stops: number, reserveTo = 0): Day => ({
  title: 'D',
  stops: Array.from({ length: stops }, (_, i) => ({
    name: `s${i}`,
    ...(i < reserveTo ? { reservation: { status: 'to_reserve' as const } } : {}),
  })),
})
const mk = (cfg: Partial<Trip['config']>, days: Day[]): Trip => ({
  id: 't', owner_id: 'o', title: 'Kyoto', subtitle: null,
  config: cfg, data: { days, completed: [], hotel: null },
})

const TODAY = '2026-07-10'

describe('cockpitModel', () => {
  it('is "unplanned" with a null day when the trip has no stops', () => {
    const m = cockpitModel(mk({ startDate: '2026-07-20', numDays: 3 }, [day(0), day(0)]), TODAY)
    expect(m.phase).toBe('unplanned')
    expect(m.featuredDay).toBeNull()
    expect(m.stopCount).toBe(0)
  })

  it('is "before" with a countdown and day 0 featured for a future planned trip', () => {
    const m = cockpitModel(mk({ startDate: '2026-07-17', numDays: 3 }, [day(2), day(1)]), TODAY)
    expect(m.phase).toBe('before')
    expect(m.countdownLabel).toBe('In 7 days')
    expect(m.featuredDay).toBe(0)
    expect(m.stopCount).toBe(3)
  })

  it('says "Tomorrow" the day before, and "Day N of M" while active', () => {
    expect(cockpitModel(mk({ startDate: '2026-07-11', numDays: 2 }, [day(1)]), TODAY).countdownLabel).toBe('Tomorrow')
    const during = cockpitModel(mk({ startDate: '2026-07-08', numDays: 5 }, [day(1), day(1), day(1)]), TODAY)
    expect(during.phase).toBe('during')
    expect(during.countdownLabel).toBe('Day 3 of 5')
    expect(during.featuredDay).toBe(2) // 0-based index of today
  })

  it('counts only to_reserve reservations as "to arrange"', () => {
    const m = cockpitModel(mk({ startDate: '2026-07-17', numDays: 1 }, [day(3, 2)]), TODAY)
    expect(m.toArrangeCount).toBe(2)
  })

  it('has a null countdown when the trip has no dates', () => {
    const m = cockpitModel(mk({}, [day(2)]), TODAY)
    expect(m.countdownLabel).toBeNull()
    expect(m.phase).toBe('before')
    expect(m.featuredDay).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cockpit-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// app/src/lib/cockpit-model.ts
import type { Trip } from '../types'
import { allReservations } from '../trip/reservation'
import { todayISO } from './focus-trip'

export type CockpitPhase = 'unplanned' | 'before' | 'during'

export interface CockpitModel {
  phase: CockpitPhase
  /** "In 7 days" / "Tomorrow" / "Day 3 of 5" — null when the trip has no dates. */
  countdownLabel: string | null
  /** Day index to feature in the readiness line + weather; null when unplanned. */
  featuredDay: number | null
  /** Count of stops still to reserve (status 'to_reserve'). */
  toArrangeCount: number
  /** Total stops across all days. */
  stopCount: number
}

/** Parse a local `YYYY-MM-DD` to a midnight Date, or null. */
function parseLocal(iso: string | undefined | null): Date | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Whole-day delta `to - from` (negative if `to` is earlier). Null on bad input. */
function daysBetween(fromISO: string, toISO: string): number | null {
  const a = parseLocal(fromISO)
  const b = parseLocal(toISO)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/**
 * Derive the cockpit's display state from a trip (spec §5.2–5.3). Pure +
 * unit-tested; the component layers weather/cover/labels on top. `today` is
 * injectable for tests.
 */
export function cockpitModel(trip: Trip, today: string = todayISO()): CockpitModel {
  const days = trip.data?.days ?? []
  const stopCount = days.reduce((n, d) => n + (d.stops?.length ?? 0), 0)
  const hasStops = stopCount > 0
  const start = trip.config?.startDate
  const numDays = trip.config?.numDays || days.length || 1

  const toArrangeCount = allReservations(trip).filter(e => e.status === 'to_reserve').length

  // Timing from dates (undated → treated as "before" with no countdown).
  const fromStart = start ? daysBetween(start, today) : null // today - start
  const isDuring = fromStart !== null && fromStart >= 0 && fromStart <= numDays - 1

  const phase: CockpitPhase = !hasStops ? 'unplanned' : isDuring ? 'during' : 'before'

  let countdownLabel: string | null = null
  if (start && fromStart !== null) {
    if (isDuring) {
      countdownLabel = `Day ${fromStart + 1} of ${numDays}`
    } else if (fromStart < 0) {
      const until = -fromStart
      countdownLabel = until === 1 ? 'Tomorrow' : `In ${until} days`
    }
  }

  let featuredDay: number | null = null
  if (phase === 'before') featuredDay = 0
  else if (phase === 'during') featuredDay = Math.min(Math.max(fromStart ?? 0, 0), numDays - 1)

  return { phase, countdownLabel, featuredDay, toArrangeCount, stopCount }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/cockpit-model.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/cockpit-model.ts app/src/lib/cockpit-model.test.ts
git commit -m "feat(home): cockpitModel — derived cockpit view-model"
```

---

## Task 3: Extract `spanClass`/`isFeature` into `lib/bento.ts`

**Files:**
- Create: `app/src/lib/bento.ts`
- Test: `app/src/lib/bento.test.ts`
- Modify: `app/src/routes/Dashboard.tsx` (remove the local copies — done in Task 7; for now just add the module)

Pure layout helpers currently inlined in `Dashboard` (`spanClass`, `isFeature`). Lifting them lets `TripGrid` reuse them.

- [ ] **Step 1: Write the failing test**

```ts
// app/src/lib/bento.test.ts
import { describe, it, expect } from 'vitest'
import { spanClass, isFeature } from './bento'

describe('bento layout', () => {
  it('makes each of two cells a tall 2x2 half', () => {
    expect(spanClass(0, 2)).toContain('lg:col-span-2')
    expect(spanClass(0, 2)).toContain('lg:row-span-2')
    expect(isFeature(0, 2)).toBe(true)
    expect(isFeature(1, 2)).toBe(true)
  })

  it('repeats a 2x2 feature, a 2x1 wide, then two 1x1 cells', () => {
    expect(spanClass(0, 6)).toBe('lg:col-span-2 lg:row-span-2')
    expect(spanClass(1, 6)).toBe('lg:col-span-2 lg:row-span-1')
    expect(spanClass(2, 6)).toBe('lg:col-span-1 lg:row-span-1')
    expect(spanClass(3, 6)).toBe('lg:col-span-1 lg:row-span-1')
    expect(isFeature(0, 6)).toBe(true)
    expect(isFeature(2, 6)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bento.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** (copied verbatim from `Dashboard.tsx`'s current logic)

```ts
// app/src/lib/bento.ts
/**
 * Bento placement on the lg+ 4-column board. A trip "block" is a 4×2 region:
 * one 2×2 feature, one 2×1 wide, two 1×1 cells — a repeating editorial rhythm.
 * With one or two cells each takes a tall 2×2 half so the board never looks
 * lopsided. Below lg the grid is plain (1→2 cols) and these classes are inert.
 */
export function spanClass(i: number, n: number): string {
  if (n <= 2) return 'lg:col-span-2 lg:row-span-2'
  const m = i % 4
  if (m === 0) return 'lg:col-span-2 lg:row-span-2'
  if (m === 1) return 'lg:col-span-2 lg:row-span-1'
  return 'lg:col-span-1 lg:row-span-1'
}

/** True when cell `i` is the big 2×2 feature (gets the larger tile variant). */
export function isFeature(i: number, n: number): boolean {
  return n <= 2 || i % 4 === 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bento.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/bento.ts app/src/lib/bento.test.ts
git commit -m "refactor(home): extract bento span helpers to lib/bento"
```

---

## Task 4: Extract `useTripCover` hook (shared by TripTile + Cockpit)

**Files:**
- Create: `app/src/components/useTripCover.ts`
- Modify: `app/src/components/TripTile.tsx`

`TripTile` currently defines `useTripCover` privately. Cockpit needs the same resolution (stored cover → on-demand landmark). Extract it so both share one source of truth.

- [ ] **Step 1: Create the hook (lifted verbatim from `TripTile.tsx`)**

```ts
// app/src/components/useTripCover.ts
import { destinationOf } from '../trip/landmark-context'
import { useLandmarkImage } from '../data/useLandmarkImage'
import type { Trip } from '../types'

/**
 * Resolve a cover image for `trip`, cheapest source first:
 *   1. a stored `config.coverImage` (fetched at create time),
 *   2. else an on-demand landmark image for the destination (cached, lazy).
 * Never falls back to an arbitrary stop `.image` — the cover represents the
 * destination and must stay stable as stops come and go.
 */
export function useTripCover(trip: Trip): { url: string | null; loading: boolean } {
  const stored = trip.config?.coverImage ?? null
  const landmark = useLandmarkImage(stored ? undefined : destinationOf(trip))
  return { url: stored ?? landmark.url, loading: !stored && landmark.loading }
}
```

- [ ] **Step 2: Update `TripTile.tsx` to import it**

In `app/src/components/TripTile.tsx`, delete the local `useTripCover` function (and its now-unused `destinationOf`/`useLandmarkImage` imports) and add:

```ts
import { useTripCover } from './useTripCover'
```

Remove these now-unused imports from `TripTile.tsx` if present:
```ts
// DELETE these two lines (moved into useTripCover.ts):
import { destinationOf } from '../trip/landmark-context'
import { useLandmarkImage } from '../data/useLandmarkImage'
```

- [ ] **Step 3: Verify typecheck + existing tile tests pass**

Run: `npx tsc -b`
Expected: clean (exit 0).
Run: `npx vitest run src/components/TripCard.test.tsx`
Expected: PASS (the `useLandmarkImage` mock still drives the cover).

- [ ] **Step 4: Commit**

```bash
git add app/src/components/useTripCover.ts app/src/components/TripTile.tsx
git commit -m "refactor(home): extract useTripCover hook shared by TripTile + Cockpit"
```

---

## Task 5: `dayAnchorCoords` helper (for cockpit weather)

**Files:**
- Modify: `app/src/trip/helpers.ts`
- Modify: `app/src/trip/WeatherGlance.tsx` (use the shared helper)

The cockpit's weather needs a day's anchor coordinates — the same logic `WeatherGlance` already has privately. Lift it to `helpers.ts` and reuse.

- [ ] **Step 1: Add the helper to `helpers.ts`** (append at end of file)

```ts
// app/src/trip/helpers.ts (append)
/** A day's anchor coords: the first stop with finite lat/lng, else null. Pure. */
export function dayAnchorCoords(
  trip: Trip | null | undefined,
  day: number,
): { lat: number; lng: number } | null {
  const stops = trip?.data?.days?.[day]?.stops ?? []
  for (const stop of stops) {
    const lat = stop.lat ?? stop.coords?.lat
    const lng = stop.lng ?? stop.coords?.lng
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng }
    }
  }
  return null
}
```

- [ ] **Step 2: Use it in `WeatherGlance.tsx`** — replace the local `anchorCoords` function

In `app/src/trip/WeatherGlance.tsx`, delete the local `anchorCoords` function (lines defining it), import the shared one, and update the call site:

```ts
// add to imports:
import { dayDate, formatDayDate, dayAnchorCoords } from './helpers'
// in the component body, replace `anchorCoords(trip, day)` with:
const coords = dayAnchorCoords(trip, day)
```

(Delete the now-duplicate `import { dayDate, formatDayDate } from './helpers'` — it's merged into the line above — and remove the private `function anchorCoords(...)`.)

- [ ] **Step 3: Verify weather tests + typecheck stay green**

Run: `npx tsc -b`
Expected: clean.
Run: `npx vitest run src/trip/weather.test.ts`
Expected: PASS (pure extraction — behavior unchanged).

- [ ] **Step 4: Commit**

```bash
git add app/src/trip/helpers.ts app/src/trip/WeatherGlance.tsx
git commit -m "refactor(home): share dayAnchorCoords between WeatherGlance and cockpit"
```

---

## Task 6: `Cockpit` component (State B single surface)

**Files:**
- Create: `app/src/components/Cockpit.tsx`
- Test: `app/src/components/Cockpit.test.tsx`

One annotated surface (spec §5). Whole card → `onOpen` (Plan). The single secondary action is "N to arrange" → `onOpenArrange` (Trip view). Unplanned phase swaps the readiness line for a "Start planning →" affordance. Weather is inline and optional.

- [ ] **Step 1: Write the failing test**

```tsx
// app/src/components/Cockpit.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Cockpit } from './Cockpit'
import type { Trip, Day } from '../types'

// Cover + weather are external; stub them so tests are deterministic and offline.
vi.mock('../data/useLandmarkImage', () => ({ useLandmarkImage: () => ({ url: null, loading: false }) }))
vi.mock('../trip/useWeather', () => ({ useWeather: () => ({ tempMax: null, tempMin: null, code: null, loading: false }) }))

const day = (stops: number, reserveTo = 0): Day => ({
  title: 'D',
  stops: Array.from({ length: stops }, (_, i) => ({
    name: `s${i}`, ...(i < reserveTo ? { reservation: { status: 'to_reserve' as const } } : {}),
  })),
})
const mk = (cfg: Partial<Trip['config']>, days: Day[]): Trip => ({
  id: 'kyoto', owner_id: 'o', title: 'Kyoto', subtitle: null,
  config: { title: 'Kyoto', ...cfg }, data: { days, completed: [], hotel: null },
})

describe('Cockpit', () => {
  it('shows the trip name and a countdown for a planned future trip', () => {
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 2 }, [day(2, 1)])} today="2026-07-10" onOpen={() => {}} onOpenArrange={() => {}} />)
    expect(screen.getByText('Kyoto')).toBeInTheDocument()
    expect(screen.getByText('In 7 days')).toBeInTheDocument()
  })

  it('opens the trip when the surface is clicked', async () => {
    const onOpen = vi.fn()
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 2 }, [day(1)])} today="2026-07-10" onOpen={onOpen} onOpenArrange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /open kyoto/i }))
    expect(onOpen).toHaveBeenCalledWith('kyoto')
  })

  it('surfaces a "to arrange" action that deep-links without opening the trip', async () => {
    const onOpen = vi.fn(); const onOpenArrange = vi.fn()
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 1 }, [day(3, 2)])} today="2026-07-10" onOpen={onOpen} onOpenArrange={onOpenArrange} />)
    await userEvent.click(screen.getByRole('button', { name: /2 to arrange/i }))
    expect(onOpenArrange).toHaveBeenCalledWith('kyoto')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows a "Start planning" nudge and no countdown when the trip is unplanned', () => {
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 2 }, [day(0)])} today="2026-07-10" onOpen={() => {}} onOpenArrange={() => {}} />)
    expect(screen.getByText(/start planning/i)).toBeInTheDocument()
    expect(screen.queryByText(/to arrange/i)).not.toBeInTheDocument()
  })

  it('renders without a countdown when the trip has no dates', () => {
    render(<Cockpit trip={mk({}, [day(2)])} today="2026-07-10" onOpen={() => {}} onOpenArrange={() => {}} />)
    expect(screen.getByText('Kyoto')).toBeInTheDocument()
    expect(screen.queryByText(/in \d+ days/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Cockpit.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// app/src/components/Cockpit.tsx
import { cn } from '../lib/utils'
import { formatDateRange } from '../lib/trip-helpers'
import { cockpitModel } from '../lib/cockpit-model'
import { tripGradient } from '../lib/trip-tile'
import { useTripCover } from './useTripCover'
import { dayDate, dayAnchorCoords } from '../trip/helpers'
import { useWeather } from '../trip/useWeather'
import { weatherFromCode } from '../trip/icons'
import type { Trip } from '../types'

/**
 * State B home surface (spec §5): the next trip as a single annotated card.
 * The whole card opens the trip (→ Plan); the lone secondary action is the
 * "N to arrange" deep-link (→ Trip view). Unplanned trips show a "Start
 * planning" nudge instead of the readiness line. `today` is a test/SSR seam.
 */
export function Cockpit({
  trip, onOpen, onOpenArrange, actions, today,
}: {
  trip: Trip
  onOpen: (id: string) => void
  onOpenArrange: (id: string) => void
  actions?: React.ReactNode
  today?: string
}) {
  const m = cockpitModel(trip, today)
  const { url, loading } = useTripCover(trip)
  const seed = trip.config?.destination || trip.config?.title || trip.title || trip.id

  // Weather for the featured day (inline, optional). Hooks run unconditionally.
  const weatherDay = m.featuredDay ?? 0
  const coords = dayAnchorCoords(trip, weatherDay)
  const date = dayDate(trip, weatherDay)
  const { tempMax, code } = useWeather(coords, date)
  const hasWeather = tempMax !== null && code !== null
  const weather = hasWeather ? weatherFromCode(code) : null

  const meta =
    `${formatDateRange(trip)}` + (m.stopCount ? ` · ${m.stopCount} stop${m.stopCount === 1 ? '' : 's'}` : '')

  const dayLabel = m.phase === 'during' ? 'Today' : m.featuredDay !== null ? `Day ${m.featuredDay + 1}` : null

  return (
    <div
      className="group relative h-[300px] w-full overflow-hidden rounded-card border border-hair md:h-[360px]"
      style={{ background: tripGradient(seed) }}
    >
      {url && (
        <img src={url} alt="" loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
      )}
      {loading && <span className="absolute inset-0 animate-pulse bg-white/[0.04]" />}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      {/* Whole-surface open target (→ Plan), beneath the content + actions. */}
      <button onClick={() => onOpen(trip.id)} className="absolute inset-0 z-0" aria-label={`Open ${trip.title}`} />

      {/* Countdown eyebrow */}
      <div className="pointer-events-none absolute left-5 top-5 z-10 flex items-center gap-2">
        <span className="h-px w-6 bg-gold/70" />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold/85">
          {m.countdownLabel ?? 'Next trip'}
        </span>
      </div>

      {actions && <div className="absolute right-3 top-3 z-20 flex gap-1.5">{actions}</div>}

      {/* Identity + readiness, anchored bottom */}
      <div className="absolute inset-x-5 bottom-5 z-10">
        <h2 className="pointer-events-none font-serif text-[clamp(34px,5vw,52px)] font-medium leading-[0.95] tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)]">
          {trip.title}
        </h2>
        <p className="pointer-events-none mt-2 font-mono text-[11px] uppercase tracking-wider text-white/75">{meta}</p>

        {m.phase === 'unplanned' ? (
          <button
            onClick={() => onOpen(trip.id)}
            className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-btn bg-white/10 px-3.5 py-2 text-[13px] font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            Start planning <span aria-hidden="true">→</span>
          </button>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-white/85">
            {dayLabel && <span className="pointer-events-none font-medium">{dayLabel}</span>}
            {m.toArrangeCount > 0 && (
              <>
                <span aria-hidden="true" className="pointer-events-none text-white/40">·</span>
                <button
                  onClick={e => { e.stopPropagation(); onOpenArrange(trip.id) }}
                  className="relative z-10 font-medium text-white underline-offset-2 hover:underline"
                >
                  {m.toArrangeCount} to arrange
                </button>
              </>
            )}
            {weather && (
              <>
                <span aria-hidden="true" className="pointer-events-none text-white/40">·</span>
                <span className="pointer-events-none inline-flex items-center gap-1">
                  <weather.icon size={14} aria-hidden="true" className="opacity-85" />
                  {Math.round(tempMax!)}°
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/Cockpit.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/Cockpit.tsx app/src/components/Cockpit.test.tsx
git commit -m "feat(home): Cockpit — State B single-surface trip overview"
```

---

## Task 7: `TripGrid` component (shared gallery)

**Files:**
- Create: `app/src/components/TripGrid.tsx`

The bento gallery, extracted so both State B ("Your trips") and State C ("Past voyages") reuse it. The per-tile stagger lives here (plays on mount); the tab cross-fade stays in `Dashboard` (Task 8) wrapping this in `AnimatePresence`.

- [ ] **Step 1: Create the component**

```tsx
// app/src/components/TripGrid.tsx
import { motion, useReducedMotion } from 'framer-motion'
import { spanClass, isFeature } from '../lib/bento'
import { TripTile } from './TripTile'
import { AddTripTile } from './AddTripTile'
import type { Trip } from '../types'

/**
 * The bento board of trip tiles, reused by both home states. A trailing "add"
 * cell is shown when `onAdd` is provided. Tiles fade up with a gentle stagger
 * on mount (collapsed under reduced motion).
 */
export function TripGrid({
  trips, onOpen, tripActions, onAdd,
}: {
  trips: Trip[]
  onOpen: (id: string) => void
  tripActions?: (t: Trip) => React.ReactNode
  /** When provided, append a dashed "add a trip" cell as the last bento cell. */
  onAdd?: () => void
}) {
  const reduce = useReducedMotion()
  const container = {
    hidden: { opacity: reduce ? 1 : 0 },
    show: { opacity: 1, transition: reduce ? { duration: 0.12 } : { staggerChildren: 0.045, delayChildren: 0.03 } },
  }
  const item = reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: 'easeOut' } } }

  const n = trips.length + (onAdd ? 1 : 0)

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-4 auto-rows-[210px] sm:grid-cols-2 sm:auto-rows-[200px] lg:grid-cols-4 lg:auto-rows-[150px] lg:grid-flow-row-dense"
    >
      {trips.map((t, i) => (
        <motion.div key={t.id} variants={item} className={spanClass(i, n)}>
          <TripTile
            trip={t}
            onOpen={onOpen}
            actions={tripActions?.(t)}
            variant={isFeature(i, n) ? 'large' : 'small'}
            className="h-full"
          />
        </motion.div>
      ))}
      {onAdd && (
        <motion.div variants={item} className={spanClass(trips.length, n)}>
          <AddTripTile onClick={onAdd} label="Plan your next escape" sub="Add another trip" />
        </motion.div>
      )}
    </motion.div>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc -b`
Expected: clean. (No test here — it's exercised via `Launchpad.test.tsx` and the manual check; logic lives in `lib/bento` which is already tested.)

- [ ] **Step 3: Commit**

```bash
git add app/src/components/TripGrid.tsx
git commit -m "feat(home): TripGrid — shared bento gallery for both home states"
```

---

## Task 8: `Launchpad` component (State C)

**Files:**
- Create: `app/src/components/Launchpad.tsx`
- Test: `app/src/components/Launchpad.test.tsx`

State C (spec §6): editorial "Where to next?" hero over the **static fallback backdrop**, a pill-styled button that calls `onCreate` (Phase-1 stand-in for the command pill), then either the **Plan/Walk/Remember trio** (brand-new) or the **Past voyages** gallery (past-only).

- [ ] **Step 1: Write the failing test**

```tsx
// app/src/components/Launchpad.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Launchpad } from './Launchpad'
import type { Trip } from '../types'

vi.mock('../data/useLandmarkImage', () => ({ useLandmarkImage: () => ({ url: null, loading: false }) }))

const past: Trip = {
  id: 'ams', owner_id: 'o', title: 'Amsterdam', subtitle: null,
  config: { title: 'Amsterdam', startDate: '2026-01-01', numDays: 3 },
  data: { days: [{ title: 'D', stops: [] }], completed: [], hotel: null },
}

describe('Launchpad', () => {
  it('shows the headline and a create affordance', async () => {
    const onCreate = vi.fn()
    render(<Launchpad pastTrips={[]} onCreate={onCreate} onOpenTrip={() => {}} />)
    expect(screen.getByText(/where to next/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /where to next|start|new trip|search/i }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('shows the Plan / Walk / Remember trio for a brand-new user (no past trips)', () => {
    render(<Launchpad pastTrips={[]} onCreate={() => {}} onOpenTrip={() => {}} />)
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText('Walk')).toBeInTheDocument()
    expect(screen.getByText('Remember')).toBeInTheDocument()
    expect(screen.queryByText(/past voyages/i)).not.toBeInTheDocument()
  })

  it('shows Past voyages (and hides the trio) when there are past trips', () => {
    render(<Launchpad pastTrips={[past]} onCreate={() => {}} onOpenTrip={() => {}} />)
    expect(screen.getByText(/past voyages/i)).toBeInTheDocument()
    expect(screen.getByText('Amsterdam')).toBeInTheDocument()
    expect(screen.queryByText('Walk')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Launchpad.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// app/src/components/Launchpad.tsx
import { Search } from 'lucide-react'
import { TripGrid } from './TripGrid'
import type { Trip } from '../types'

const VALUE_TRIO = [
  { k: 'Plan', d: 'Build each day with smart suggestions — places, times, and notes that just work.' },
  { k: 'Walk', d: 'A calm live guide narrates each landmark as you approach it, hands-free.' },
  { k: 'Remember', d: 'Turn the trip into a beautiful story you’ll actually want to share.' },
]

/**
 * State C home (spec §6). Editorial "Where to next?" hero over the static
 * fallback backdrop (the field-globe shader is Phase 2). The pill-styled button
 * is the Phase-1 stand-in for the command pill — it calls `onCreate`
 * (NewTripSheet today). Brand-new users get the value trio; returning users
 * with past trips get "Past voyages" instead.
 */
export function Launchpad({
  pastTrips, onCreate, onOpenTrip, tripActions,
}: {
  pastTrips: Trip[]
  onCreate: () => void
  onOpenTrip: (id: string) => void
  tripActions?: (t: Trip) => React.ReactNode
}) {
  const hasPast = pastTrips.length > 0
  return (
    <div className="mt-4 space-y-8">
      {/* Hero over the static fallback backdrop (Phase-2 shader swaps in here). */}
      <div
        className="relative overflow-hidden rounded-card border border-hair px-6 py-16 text-center md:py-24"
        style={{
          background:
            'radial-gradient(120% 85% at 50% -5%, rgba(58,34,48,0.55) 0%, rgba(21,13,18,0.55) 48%, #07070b 100%)',
        }}
      >
        {/* faint map-grid texture — the launchpad's calm "world field" stand-in */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)',
            backgroundSize: '34px 34px',
            maskImage: 'radial-gradient(70% 60% at 50% 30%, #000, transparent 75%)',
          }}
        />
        <div className="relative">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/80">Plan · Walk · Remember</p>
          <h1 className="mt-3 font-serif text-[clamp(40px,6vw,64px)] font-semibold leading-[0.98] tracking-tight text-white">
            Where to next?
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-white/85">
            Name a city and we’ll start the itinerary, day by day.
          </p>
          <button
            onClick={onCreate}
            aria-label="Where to next — start a new trip"
            className="mx-auto mt-7 flex w-full max-w-sm items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-left text-white/70 backdrop-blur transition-colors hover:border-white/35 hover:bg-white/15"
          >
            <Search size={16} aria-hidden="true" className="shrink-0 text-white/60" />
            <span className="flex-1 text-[14px]">Search a city or country…</span>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-sig-btn text-white" aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {hasPast ? (
        <div>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Past voyages</p>
          <TripGrid trips={pastTrips} onOpen={onOpenTrip} tripActions={tripActions} />
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-3">
          {VALUE_TRIO.map(b => (
            <div key={b.k}>
              <div className="font-serif text-2xl">{b.k}</div>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{b.d}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/Launchpad.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/Launchpad.tsx app/src/components/Launchpad.test.tsx
git commit -m "feat(home): Launchpad — State C hero + value trio / Past voyages"
```

---

## Task 9: Wire `Dashboard` to the two states

**Files:**
- Modify: `app/src/routes/Dashboard.tsx`
- Delete: `app/src/components/DashboardEmpty.tsx`

Replace the current single-layout render with: pick `focus = selectFocusTrip(trips)`; if `focus` → State B (Cockpit + "Your trips" gallery via `TripGrid`); else → State C (`Launchpad`). Introduce `openCreateTrip()` and route every create trigger through it. Remove the now-local `spanClass`/`isFeature`/grid markup (moved to `bento`/`TripGrid`) and the old hero `TripTile`.

- [ ] **Step 1: Replace the imports block**

In `app/src/routes/Dashboard.tsx`, set the import section to:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { useProfile, isFounder } from '../data/useProfile'
import { useTrips, splitTrips, useDeleteTrip, useBackfillCoverImage, useBackfillDestination, useReresolveAutoCover } from '../data/useTrips'
import { classifyCover } from '../trip/landmark-context'
import { selectFocusTrip } from '../lib/focus-trip'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Segmented'
import { Skeleton } from '../components/ui/Skeleton'
import { Cockpit } from '../components/Cockpit'
import { Launchpad } from '../components/Launchpad'
import { TripGrid } from '../components/TripGrid'
import { AddTripTile } from '../components/AddTripTile'
import { NewTripSheet } from './NewTripSheet'
import { ShareSheet } from './ShareSheet'
import { AccountMenu } from '../components/AccountMenu'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconButton } from '../components/ui/IconButton'
```

(Note: `useProfile` and `isFounder` now come from one import line; `useDeleteTrip` is folded into the `useTrips` import. Remove the old separate `import { useProfile }`, `import { useDeleteTrip }`, `import { isFounder }`, `import { TripTile }`, `import { DashboardEmpty }`, and the local `spanClass`/`isFeature` function block.)

- [ ] **Step 2: Delete the local `spanClass`/`isFeature` block**

Remove the entire block at the top of `Dashboard.tsx` that defines `function spanClass(...)` and `const isFeature = ...` (now in `lib/bento`, used by `TripGrid`).

- [ ] **Step 3: Replace the focus/derived values + add `openCreateTrip`**

Find the block defining `shown`, `featured`, `firstName`, `openTrip`, `isTeaser`, `hasTrips`, `showAdd`, `gridN`, `newTripBtn`, and the motion `gridContainer`/`gridItem` variants. Replace from `const shown = ...` through the `gridItem` definition with:

```tsx
  const shown = tab === 'past' ? past : upcoming
  const focus = useMemo(() => selectFocusTrip(trips ?? []), [trips])
  const firstName = (profile?.name || user?.email?.split('@')[0] || 'traveler').split(/\s+/)[0]
  const openTrip = (id: string) => { nav(`/trip/${encodeURIComponent(id)}`) }            // → Plan
  const openArrange = (id: string) => { nav(`/trip/${encodeURIComponent(id)}/trip`) }    // → Trip view
  const isTeaser = !!profile && profile.role !== 'founder' && (profile.credits ?? 0) < 1
  const hasTrips = (trips?.length ?? 0) > 0

  // Single creation entry point. Phase 1 → NewTripSheet; Phase 3 swaps this for the pill.
  const openCreateTrip = () => setNewOpen(true)

  // Greeting varies by state: cockpit / returning / brand-new.
  const greeting = focus
    ? <>Good to see you, <span className="font-semibold text-ink">{firstName}</span> — here’s what’s next.</>
    : past.length > 0
      ? <>Welcome back, <span className="font-semibold text-ink">{firstName}</span>.</>
      : <>Welcome, <span className="font-semibold text-ink">{firstName}</span>.</>

  const tabSwap = (reduce: boolean) => ({
    initial: reduce ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, y: -8 },
    transition: { duration: 0.22, ease: 'easeOut' as const },
  })
```

- [ ] **Step 4: Add the reduced-motion hook near the top of the component**

Just after `const reduce = ...` is needed; add this line alongside the other hooks (e.g., right after `const nav = useNavigate()`):

```tsx
  const reduce = useReducedMotion()
```

- [ ] **Step 5: Replace the returned JSX body**

Replace the whole `return (<AppShell ...> ... </AppShell>)` with:

```tsx
  return (
    <AppShell right={<>
      <Button variant="claret" onClick={openCreateTrip}><Plus size={16} strokeWidth={2.5} />New trip</Button>
      <AccountMenu email={user?.email ?? ''} profile={profile} />
    </>}>
      <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto">
        {isLoading ? (
          <>
            <Skeleton className="h-4 w-56 rounded" />
            <Skeleton className="mt-4 h-[300px] w-full rounded-card md:h-[360px]" />
            <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-[200px] rounded-card" />)}
            </div>
          </>
        ) : !hasTrips ? (
          <>
            <p className="text-[13px] text-muted">{greeting}</p>
            <Launchpad pastTrips={[]} onCreate={openCreateTrip} onOpenTrip={openTrip} tripActions={tripActions} />
          </>
        ) : focus ? (
          <>
            <p className="text-[13px] text-muted">{greeting}</p>
            <div className="mt-4">
              <Cockpit trip={focus} onOpen={openTrip} onOpenArrange={openArrange} actions={tripActions(focus)} />
            </div>

            <div className="mt-7 mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h2 className="font-serif text-xl">Your trips</h2>
              <Segmented value={tab} onChange={setTab}
                options={[{ value: 'upcoming', label: `Upcoming (${upcoming.length})` }, { value: 'past', label: `Past (${past.length})` }]} />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} {...tabSwap(!!reduce)}>
                {shown.length === 0 ? (
                  tab === 'upcoming'
                    ? <AddTripTile onClick={openCreateTrip} label="Plan your next escape" sub="Add a trip" className="min-h-[200px]" />
                    : <p className="py-12 text-center text-[14px] text-muted">Trips you finish will land here as keepsakes.</p>
                ) : (
                  <TripGrid trips={shown} onOpen={openTrip} tripActions={tripActions} onAdd={tab === 'upcoming' ? openCreateTrip : undefined} />
                )}
              </motion.div>
            </AnimatePresence>
          </>
        ) : (
          <>
            <p className="text-[13px] text-muted">{greeting}</p>
            <Launchpad pastTrips={past} onCreate={openCreateTrip} onOpenTrip={openTrip} tripActions={tripActions} />
          </>
        )}
      </div>

      <NewTripSheet open={newOpen} onClose={() => setNewOpen(false)} isTeaser={isTeaser}
        onCreated={(id) => { setNewOpen(false); openTrip(id) }} />

      {shareId && <ShareSheet tripId={shareId} open onClose={() => setShareId(null)} />}
      <ConfirmDialog open={!!deleteId} title="Delete this trip?"
        body="This removes the trip and all its stops. This can't be undone."
        confirmLabel="Delete" busy={del.isPending}
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => { if (deleteId) { try { await del.mutateAsync(deleteId) } catch { /* ignore */ } setDeleteId(null) } }} />
    </AppShell>
  )
```

(Leave the existing backfill `useEffect`, `tripActions`, `del`, `shareId`/`deleteId` state, and the `tab`/`newOpen` state exactly as they are.)

- [ ] **Step 6: Delete the superseded component**

```bash
git rm app/src/components/DashboardEmpty.tsx
```

- [ ] **Step 7: Typecheck + full suite**

Run: `npx tsc -b`
Expected: clean (no unused-import errors — verify `featured`, `gridN`, `showAdd`, `newTripBtn` references are all gone).
Run: `npm test`
Expected: all green (the new suites + existing).

- [ ] **Step 8: Commit**

```bash
git add app/src/routes/Dashboard.tsx
git commit -m "feat(home): wire Dashboard into cockpit / launchpad two-state home"
```

---

## Task 10: Manual verification + final check

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + tests once more**

Run: `npx tsc -b && npm test`
Expected: clean typecheck; all suites pass.

- [ ] **Step 2: Run the dev server and eyeball each state**

Run: `npm run dev -- --host 0.0.0.0`
Open the Network URL (and on a phone) and verify:
- **Has an upcoming trip:** cockpit shows the trip cover, a countdown eyebrow, name, "Your trips" gallery below with the Upcoming/Past toggle animating.
- **Tap the cockpit** → opens the trip's Plan. **Tap "N to arrange"** (if any) → opens the trip's Trip view (not Plan).
- **Cockpit on an unplanned upcoming trip** (no stops) → shows "Start planning →", no readiness line.
- **No upcoming trip (past trips only):** Launchpad hero + "Past voyages" gallery; no value trio.
- **Brand-new (no trips):** Launchpad hero + Plan/Walk/Remember trio; no gallery.
- **"+ New trip" header button** and the in-gallery add tiles and the launchpad pill all open `NewTripSheet`.
- Toggle light/dark; check mobile width has no overflow and the cockpit reads as one surface (cover dominant, single readiness line), not a stack of cards.

- [ ] **Step 3: Stop the dev server.** (Ctrl-C, or kill the background task.)

- [ ] **Step 4: Final commit (if any eyeball fixes were needed)**

```bash
git add -A
git commit -m "fix(home): phase-1 polish from manual verification"
```

---

## Self-Review (completed during authoring)

**Spec coverage:** §4 focus selection → Task 1. §5.2/5.3 cockpit surface, render states, degradation, two-action model → Tasks 2, 6. §5.4 mobile collapse → Task 6 (single readiness line, weather inline, no standalone cards) + Task 10 eyeball. §5.5 gallery reuse → Tasks 3, 7, 9. §6 launchpad + empty-state strategy (trio brand-new only / past-only) → Task 8, 9. §7.3 `openCreateTrip` indirection → Task 9. §9 header (state-aware "+ New trip" is a Phase-3 nicety; Phase-1 wires it to `openCreateTrip`) → Task 9. §11 seams (`selectFocusTrip`, `cockpitModel`, `useTripCover`) → Tasks 1, 2, 4. **Out of scope (correctly absent):** field-globe shader (§8, Phase 2 — static fallback only), command pill / range calendar / retiring `NewTripSheet` (§7, Phase 3).

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `selectFocusTrip(trips, today?) → Trip | null`; `cockpitModel(trip, today?) → CockpitModel { phase, countdownLabel, featuredDay, toArrangeCount, stopCount }`; `Cockpit` consumes those fields + `useTripCover`/`useWeather`/`dayAnchorCoords`/`weatherFromCode`; `spanClass`/`isFeature` shared by `TripGrid`; `openCreateTrip`/`openTrip`/`openArrange` consistent across `Dashboard`. `tripActions` signature `(t: Trip) => React.ReactNode` matches `TripGrid`/`Cockpit`/`Launchpad` props.
