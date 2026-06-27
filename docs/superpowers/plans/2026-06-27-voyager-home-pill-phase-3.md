# Home Phase 3 — Progressive Command Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the home "Where to next?" pill into the app's sole, progressive trip-creation flow (type a city → pick a date range inline → materialize into the planner via a seed-card flight), unify the home into one stacked layout, and retire `NewTripSheet`.

**Architecture:** Pure date/commit/prefetch logic lands first as tested helpers (`lib/`), then the visual surfaces (`RangeCalendar`, `CommandPill`), then the navigation-surviving `MaterializeOverlay`, then the unified home composition, the "+ New trip" visibility rule, and finally the `NewTripSheet` retirement. The materialization animation is **cosmetic**: `useCreateTrip` + navigate is the source of truth and must succeed even if the morph degrades.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind (CSS-var tokens) + Framer Motion + React Router + TanStack Query + Photon (komoot) autocomplete. Tests: Vitest. Work happens in the worktree `C:\Users\edwar\travel\.claude\worktrees\home-pill-phase-3` (branch `home-pill-phase-3`).

**Spec:** `docs/superpowers/specs/2026-06-27-voyager-home-pill-phase-3-design.md`.

**Conventions (apply to every task):**
- Run commands from `app/` unless noted. Single test file: `npx vitest run src/<path>.test.ts`. Full suite: `npm test`. Typecheck: `npx tsc -b` (must stay clean). Dev server: `npm run dev`.
- Keep the suite green (currently **734**) and `tsc -b` clean after every task.
- **Every commit message ends with the trailer** (shown once, append it to each commit):
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- Anti-slop: lucide icons only, CSS-var token classes (light+dark), ≥44px targets, `aria-*`, focus rings, `prefers-reduced-motion`. No hardcoded hex that breaks a theme.

---

## File Structure

**New files**
- `app/src/lib/range-calendar.ts` — pure range-calendar logic (month grid, two-click assignment, band membership, local-date formatting). Tested.
- `app/src/lib/range-calendar.test.ts`
- `app/src/lib/destination-commit.ts` — pure "which label to commit" logic (chosen suggestion vs top Photon result vs raw fallback). Tested.
- `app/src/lib/destination-commit.test.ts`
- `app/src/lib/cover-prefetch.ts` — hook-free, in-memory cover cache warm (`warmCover`/`peekCover`) reusing `resolveCoverImage`. Tested (cache behavior with an injected resolver).
- `app/src/lib/cover-prefetch.test.ts`
- `app/src/components/home/RangeCalendar.tsx` — the anchored, dark-glass range calendar UI + "Don't know dates yet".
- `app/src/components/home/CommandPill.tsx` — the four-beat creation pill (evolves `HeroSearchPill`).
- `app/src/components/home/MaterializeOverlay.tsx` + `app/src/components/home/materialize-controller.ts` — the seed-card-flight portal + its navigation-surviving controller.
- `app/src/components/home/UpcomingJourney.tsx` — the State-B "Your next journey" full-width video section.
- `app/src/components/home/useHeroPillInView.ts` — IntersectionObserver hook for the "+ New trip" fade.

**Modified files**
- `app/src/lib/trip-helpers.ts` — undated default 4 → 5 days (+ test).
- `app/src/routes/Dashboard.tsx` — unified stacked home; repoint `openCreateTrip`; mount `MaterializeOverlay`; remove the two-state early returns.
- `app/src/components/CinematicHero.tsx` — host the real `CommandPill` (replace `HeroSearchPill`'s submit-only wiring) + expose a focus handle + an in-view sentinel.
- `app/src/components/CinematicLaunchpad.tsx` / `app/src/components/CockpitHome.tsx` — merged into the unified composition (State-C path keeps hero+travels; State-B path adds `UpcomingJourney`). May be reduced to thin compositions or absorbed into Dashboard.
- `app/src/components/AppShell.tsx` / wherever the header "+ New trip" lives — apply the in-view fade + global navigate-then-focus behavior.

**Deleted files (final task)**
- `app/src/routes/NewTripSheet.tsx` (+ all imports/usages).

---

## Task 1: Undated trips default to 5 generic days

**Files:**
- Modify: `app/src/lib/trip-helpers.ts:86`
- Test: `app/src/lib/trip-helpers.test.ts:91-95`

- [ ] **Step 1: Update the existing failing test to expect 5**

In `app/src/lib/trip-helpers.test.ts`, replace the `'defaults to 4 undated days when no range'` test with:

```ts
  it('defaults to 5 generic days when no range (Don\'t know dates yet)', () => {
    const p = buildNewTripPayload({ slug: 'x', title: 'X', subtitle: '', start: '', end: '' })
    expect(p.config.numDays).toBe(5)
    expect(p.config.dayLabels).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'])
    expect(p.data.days).toHaveLength(5)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/trip-helpers.test.ts`
Expected: FAIL — `expected 4 to be 5`.

- [ ] **Step 3: Change the undated default**

In `app/src/lib/trip-helpers.ts`, change line 86 from `let numDays = 4` to:

```ts
  let numDays = 5
```

(The dated branch still recomputes `numDays` from the range, so only the empty-dates path is affected.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/trip-helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Check for other callers asserting 4**

Run: `git grep -n "numDays).toBe(4)\|numDays === 4\|4 undated"` from `app/`.
Expected: no other undated-path assertion of 4 (the dated test asserts 4 from a real 4-day range — leave it). If any other empty-dates default-4 assertion exists, update it to 5.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc -b` (clean), then:
```bash
git add app/src/lib/trip-helpers.ts app/src/lib/trip-helpers.test.ts
git commit -m "feat: undated trips default to 5 generic days (+ trailer)"
```

---

## Task 2: `lib/range-calendar.ts` — pure range logic

A pure module the calendar UI renders from. No React. Local-date safe (no UTC shift). Dates are `YYYY-MM-DD` strings throughout (the format `buildNewTripPayload` parses).

**Files:**
- Create: `app/src/lib/range-calendar.ts`
- Test: `app/src/lib/range-calendar.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/src/lib/range-calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  isoOf, monthGrid, applyRangeClick, inBand, isEnd, isStart,
  formatRangeChip, addMonths, monthLabel,
} from './range-calendar'

describe('isoOf', () => {
  it('formats local Y-M-D with no UTC shift', () => {
    expect(isoOf({ y: 2026, m: 6, d: 14 })).toBe('2026-07-14') // m is 0-based
    expect(isoOf({ y: 2026, m: 0, d: 1 })).toBe('2026-01-01')
  })
})

describe('monthGrid', () => {
  it('returns 42 cells (6 weeks) with leading/trailing days of adjacent months', () => {
    const cells = monthGrid(2026, 6) // July 2026 (0-based month)
    expect(cells).toHaveLength(42)
    // July 1 2026 is a Wednesday → 3 leading June cells (Sun..Tue)
    expect(cells[0].inMonth).toBe(false)
    expect(cells[3]).toMatchObject({ iso: '2026-07-01', inMonth: true })
    expect(cells.find(c => c.iso === '2026-07-31')?.inMonth).toBe(true)
  })
})

describe('applyRangeClick', () => {
  it('first click sets start, clears end', () => {
    expect(applyRangeClick({ start: null, end: null }, '2026-07-14'))
      .toEqual({ start: '2026-07-14', end: null })
  })
  it('second click after start sets end', () => {
    expect(applyRangeClick({ start: '2026-07-14', end: null }, '2026-07-18'))
      .toEqual({ start: '2026-07-14', end: '2026-07-18' })
  })
  it('second click before start swaps so start <= end', () => {
    expect(applyRangeClick({ start: '2026-07-18', end: null }, '2026-07-14'))
      .toEqual({ start: '2026-07-14', end: '2026-07-18' })
  })
  it('clicking again when a full range exists restarts from the new start', () => {
    expect(applyRangeClick({ start: '2026-07-14', end: '2026-07-18' }, '2026-07-20'))
      .toEqual({ start: '2026-07-20', end: null })
  })
})

describe('band membership', () => {
  const r = { start: '2026-07-14', end: '2026-07-18' }
  it('isStart / isEnd', () => {
    expect(isStart(r, '2026-07-14')).toBe(true)
    expect(isEnd(r, '2026-07-18')).toBe(true)
    expect(isStart(r, '2026-07-15')).toBe(false)
  })
  it('inBand is true strictly between start and end', () => {
    expect(inBand(r, '2026-07-15')).toBe(true)
    expect(inBand(r, '2026-07-14')).toBe(false) // start is not "band", it's the end-cap
    expect(inBand(r, '2026-07-19')).toBe(false)
  })
  it('inBand is false when range is incomplete', () => {
    expect(inBand({ start: '2026-07-14', end: null }, '2026-07-15')).toBe(false)
  })
})

describe('formatRangeChip', () => {
  it('formats a complete range', () => {
    expect(formatRangeChip({ start: '2026-07-14', end: '2026-07-18' })).toBe('Jul 14 → Jul 18')
  })
  it('formats a single picked start', () => {
    expect(formatRangeChip({ start: '2026-07-14', end: null })).toBe('Jul 14')
  })
  it('returns empty for no selection', () => {
    expect(formatRangeChip({ start: null, end: null })).toBe('')
  })
})

describe('month navigation', () => {
  it('addMonths wraps years', () => {
    expect(addMonths({ y: 2026, m: 11 }, 1)).toEqual({ y: 2027, m: 0 })
    expect(addMonths({ y: 2026, m: 0 }, -1)).toEqual({ y: 2025, m: 11 })
  })
  it('monthLabel is human', () => {
    expect(monthLabel({ y: 2026, m: 6 })).toBe('July 2026')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/range-calendar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `range-calendar.ts`**

Create `app/src/lib/range-calendar.ts`:

```ts
/**
 * Pure logic for the command pill's anchored range calendar. No React, no Date
 * timezone hazards: all values are local `YYYY-MM-DD` strings (the format
 * `buildNewTripPayload` parses) and months are 0-based like `Date.getMonth()`.
 */

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']

export interface YMD { y: number; m: number; d: number } // m 0-based
export interface YM { y: number; m: number }             // m 0-based
export interface DateRange { start: string | null; end: string | null }
export interface DayCell { iso: string; day: number; inMonth: boolean }

/** Local `YYYY-MM-DD` for a Y/M(0-based)/D — never touches UTC. */
export function isoOf({ y, m, d }: YMD): string {
  const mm = String(m + 1).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

/** Parse a `YYYY-MM-DD` back to YMD (m 0-based). */
export function parseISO(iso: string): YMD {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m: m - 1, d }
}

/** 0-based weekday (Sun=0) of the 1st of a month, via a noon Date (DST-safe). */
function firstWeekday(y: number, m: number): number {
  return new Date(y, m, 1, 12).getDay()
}
/** Days in a month (m 0-based). */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0, 12).getDate()
}

/** A 42-cell (6×7) grid for the month, with adjacent-month spill cells. */
export function monthGrid(y: number, m: number): DayCell[] {
  const lead = firstWeekday(y, m)
  const cells: DayCell[] = []
  // leading days from previous month
  const prevM = addMonths({ y, m }, -1)
  const prevCount = daysInMonth(prevM.y, prevM.m)
  for (let i = lead - 1; i >= 0; i--) {
    const d = prevCount - i
    cells.push({ iso: isoOf({ ...prevM, d }), day: d, inMonth: false })
  }
  // current month
  const count = daysInMonth(y, m)
  for (let d = 1; d <= count; d++) cells.push({ iso: isoOf({ y, m, d }), day: d, inMonth: true })
  // trailing days to fill 42
  const nextM = addMonths({ y, m }, 1)
  let d = 1
  while (cells.length < 42) { cells.push({ iso: isoOf({ ...nextM, d }), day: d, inMonth: false }); d++ }
  return cells
}

/** Two-click range machine: 1st = start, 2nd = end (swaps if earlier), 3rd = restart. */
export function applyRangeClick(r: DateRange, iso: string): DateRange {
  if (!r.start || r.end) return { start: iso, end: null }       // fresh / restart
  if (iso < r.start) return { start: iso, end: r.start }         // swap
  return { start: r.start, end: iso }
}

export function isStart(r: DateRange, iso: string): boolean { return !!r.start && iso === r.start }
export function isEnd(r: DateRange, iso: string): boolean { return !!r.end && iso === r.end }
/** Strictly between start and end (the soft claret band). */
export function inBand(r: DateRange, iso: string): boolean {
  return !!r.start && !!r.end && iso > r.start && iso < r.end
}

function chipDate(iso: string): string {
  const { m, d } = parseISO(iso)
  return `${MONTHS_SHORT[m]} ${d}`
}
/** "Jul 14 → Jul 18" | "Jul 14" | "". */
export function formatRangeChip(r: DateRange): string {
  if (r.start && r.end) return `${chipDate(r.start)} → ${chipDate(r.end)}`
  if (r.start) return chipDate(r.start)
  return ''
}

export function addMonths(ym: YM, delta: number): YM {
  const total = ym.y * 12 + ym.m + delta
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 }
}
export function monthLabel({ y, m }: YM): string { return `${MONTHS_LONG[m]} ${y}` }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/range-calendar.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b` (clean), then:
```bash
git add app/src/lib/range-calendar.ts app/src/lib/range-calendar.test.ts
git commit -m "feat: pure range-calendar logic (local-date safe) (+ trailer)"
```

---

## Task 3: `lib/destination-commit.ts` — commit logic (top-result rule)

Pure logic deciding the destination label to commit (spec §3.2): an explicitly chosen suggestion wins; otherwise the top Photon result; otherwise the raw text as a last resort.

**Files:**
- Create: `app/src/lib/destination-commit.ts`
- Test: `app/src/lib/destination-commit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/src/lib/destination-commit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveCommitLabel } from './destination-commit'

describe('resolveCommitLabel', () => {
  it('uses an explicitly chosen suggestion verbatim', () => {
    expect(resolveCommitLabel({ chosen: 'Kyoto, Japan', raw: 'kyo', suggestions: ['Kyoto, Japan'] }))
      .toBe('Kyoto, Japan')
  })
  it('falls back to the top suggestion when none chosen', () => {
    expect(resolveCommitLabel({ chosen: null, raw: 'Kyoto', suggestions: ['Kyoto, Japan', 'Kyoto Prefecture, Japan'] }))
      .toBe('Kyoto, Japan')
  })
  it('uses raw text only when there are no suggestions', () => {
    expect(resolveCommitLabel({ chosen: null, raw: 'Atlantis', suggestions: [] }))
      .toBe('Atlantis')
  })
  it('trims raw text', () => {
    expect(resolveCommitLabel({ chosen: null, raw: '  Atlantis  ', suggestions: [] }))
      .toBe('Atlantis')
  })
  it('returns "" when nothing usable', () => {
    expect(resolveCommitLabel({ chosen: null, raw: '   ', suggestions: [] })).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/destination-commit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/src/lib/destination-commit.ts`:

```ts
/**
 * Decide the destination label to commit from the pill (spec §3.2). Structured
 * data first: an explicitly chosen suggestion wins; else the top Photon result;
 * else trimmed raw text as a last resort. Pure.
 */
export interface CommitInput {
  /** The suggestion the user explicitly clicked, if any. */
  chosen: string | null
  /** The raw typed text. */
  raw: string
  /** Current Photon suggestions, best-first. */
  suggestions: string[]
}

export function resolveCommitLabel({ chosen, raw, suggestions }: CommitInput): string {
  if (chosen && chosen.trim()) return chosen.trim()
  if (suggestions.length > 0 && suggestions[0].trim()) return suggestions[0].trim()
  return raw.trim()
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/destination-commit.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
git add app/src/lib/destination-commit.ts app/src/lib/destination-commit.test.ts
git commit -m "feat: destination commit label logic (top-result rule) (+ trailer)"
```

---

## Task 4: `lib/cover-prefetch.ts` — hook-free in-memory cover warm

Spec §3.1: on destination commit, warm the cover **via the service behind `useBackfillCoverImage`** (`resolveCoverImage`), store it in an in-memory cache, and **also preload the image bytes** so the materialization seed paints instantly. The seed reads **cache-only** (`peekCover`), never blocking.

**Files:**
- Create: `app/src/lib/cover-prefetch.ts`
- Test: `app/src/lib/cover-prefetch.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/src/lib/cover-prefetch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { warmCover, peekCover, __resetCoverCacheForTest, __setResolverForTest } from './cover-prefetch'

beforeEach(() => { __resetCoverCacheForTest() })

describe('cover-prefetch', () => {
  it('peekCover is undefined before any warm (cache-only, never fetches)', () => {
    expect(peekCover('Kyoto, Japan')).toBeUndefined()
  })

  it('warmCover resolves once and peekCover returns the URL', async () => {
    const resolver = vi.fn().mockResolvedValue('https://img/kyoto.jpg')
    __setResolverForTest(resolver)
    await warmCover('Kyoto, Japan')
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(peekCover('Kyoto, Japan')).toBe('https://img/kyoto.jpg')
  })

  it('warming the same destination twice resolves only once', async () => {
    const resolver = vi.fn().mockResolvedValue('https://img/kyoto.jpg')
    __setResolverForTest(resolver)
    await warmCover('Kyoto, Japan')
    await warmCover('Kyoto, Japan')
    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('a miss caches null and never throws', async () => {
    __setResolverForTest(vi.fn().mockResolvedValue(null))
    await warmCover('Atlantis')
    expect(peekCover('Atlantis')).toBeNull()
  })

  it('a thrown resolver is swallowed (best-effort)', async () => {
    __setResolverForTest(vi.fn().mockRejectedValue(new Error('network')))
    await expect(warmCover('Kyoto, Japan')).resolves.toBeUndefined()
    expect(peekCover('Kyoto, Japan')).toBeNull()
  })

  it('keys are normalized (trim + case-insensitive)', async () => {
    __setResolverForTest(vi.fn().mockResolvedValue('https://img/kyoto.jpg'))
    await warmCover('  Kyoto, Japan ')
    expect(peekCover('kyoto, japan')).toBe('https://img/kyoto.jpg')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/cover-prefetch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/src/lib/cover-prefetch.ts`:

```ts
/**
 * Fire-and-forget cover warm for the command pill (spec §3.1). The moment a
 * destination commits we resolve its cover URL (via the same service that backs
 * `useBackfillCoverImage`) into an in-memory cache and preload the image bytes,
 * so the materialization seed can read it SYNCHRONOUSLY and paint instantly.
 *
 * The seed reads cache-only via `peekCover` (never triggers a fetch). A cold or
 * failed warm leaves `null`, and the seed falls back to the branded gradient;
 * the real cover still resolves later in the planner via the existing backfill.
 *
 * No React hooks here — this is the plain service path.
 */
import { resolveCoverImage } from '../trip/cover-image'

type Url = string | null
const cache = new Map<string, Url>()           // resolved value (or null on miss)
const inflight = new Map<string, Promise<void>>()

// Injectable resolver so tests don't hit the network. Production = resolveCoverImage([dest]).
let resolver: (destination: string) => Promise<Url> =
  async (destination) => (await resolveCoverImage([destination]))?.url ?? null

const key = (destination: string) => destination.trim().toLowerCase()

/** Cache-only read — undefined = never warmed, null = warmed-but-no-cover, string = URL. */
export function peekCover(destination: string): Url | undefined {
  return cache.get(key(destination))
}

/** Warm the cache for `destination`. Idempotent per destination; never throws. */
export function warmCover(destination: string): Promise<void> {
  const k = key(destination)
  if (!k) return Promise.resolve()
  if (cache.has(k)) return Promise.resolve()
  const existing = inflight.get(k)
  if (existing) return existing
  const p = (async () => {
    try {
      const url = await resolver(destination.trim())
      cache.set(k, url)
      if (url) preload(url)
    } catch {
      cache.set(k, null)             // best-effort: cache the miss
    } finally {
      inflight.delete(k)
    }
  })()
  inflight.set(k, p)
  return p
}

/** Preload image bytes into the HTTP cache so the seed paints with no flash. */
function preload(url: string): void {
  if (typeof Image === 'undefined') return
  const img = new Image()
  img.decoding = 'async'
  img.src = url
}

// ---- test seams ----
export function __setResolverForTest(fn: (destination: string) => Promise<Url>): void { resolver = fn }
export function __resetCoverCacheForTest(): void {
  cache.clear(); inflight.clear()
  resolver = async (destination) => (await resolveCoverImage([destination]))?.url ?? null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/cover-prefetch.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
git add app/src/lib/cover-prefetch.ts app/src/lib/cover-prefetch.test.ts
git commit -m "feat: hook-free cover prefetch cache (warm/peek) (+ trailer)"
```

---

## Task 5: `RangeCalendar.tsx` — anchored dark-glass calendar UI

Renders from `lib/range-calendar.ts`. Anchored below the pill (absolute overlay, no layout shift), claret band + gold hover, month nav, "Don't know dates yet", full keyboard + a11y, mobile full-width panel (no scrim/sheet — spec §3.6). **Visual tuning is iterative; verify behavior, then refine against the spec's look.**

**Files:**
- Create: `app/src/components/home/RangeCalendar.tsx`

- [ ] **Step 1: Implement the component**

Create `app/src/components/home/RangeCalendar.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  monthGrid, applyRangeClick, inBand, isStart, isEnd, addMonths, monthLabel,
  parseISO, type DateRange, type YM,
} from '../../lib/range-calendar'
import { cn } from '../../lib/utils'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export interface RangeCalendarProps {
  value: DateRange
  onChange: (next: DateRange) => void
  /** Fired when the user completes a range (2nd click). */
  onComplete?: (range: DateRange) => void
  /** "Don't know dates yet". */
  onSkip: () => void
  /** Month initially shown; defaults to today's month or the current start. */
  initialMonth?: YM
}

export function RangeCalendar({ value, onChange, onComplete, onSkip, initialMonth }: RangeCalendarProps) {
  const [month, setMonth] = useState<YM>(() =>
    initialMonth ?? (value.start ? ymOf(value.start) : ymToday()))
  const cells = useMemo(() => monthGrid(month.y, month.m), [month])

  const pick = (iso: string) => {
    const next = applyRangeClick(value, iso)
    onChange(next)
    if (next.start && next.end) onComplete?.(next)
  }

  return (
    <div
      role="dialog"
      aria-label="Choose your dates"
      className={cn(
        'w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl p-3.5',
        'border border-white/12 bg-[rgba(16,14,20,.92)] backdrop-blur-xl',
        'shadow-[0_18px_50px_rgba(0,0,0,.5)]',
      )}
    >
      <div className="flex items-center justify-between mb-2.5">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))}
          className="grid place-items-center size-9 rounded-lg text-white/70 hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
          <ChevronLeft size={18} />
        </button>
        <span className="font-serif text-[14px] text-white">{monthLabel(month)}</span>
        <button type="button" aria-label="Next month" onClick={() => setMonth(m => addMonths(m, 1))}
          className="grid place-items-center size-9 rounded-lg text-white/70 hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1 text-center text-[10px] text-white/40">
        {DOW.map((d, i) => <span key={i}>{d}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map(c => {
          const start = isStart(value, c.iso), end = isEnd(value, c.iso), band = inBand(value, c.iso)
          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => pick(c.iso)}
              aria-label={c.iso}
              aria-selected={start || end}
              className={cn(
                'h-9 text-[12.5px] grid place-items-center transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                c.inMonth ? 'text-white/85' : 'text-white/25',
                band && 'bg-[rgba(125,34,48,.22)]',
                start && 'rounded-l-lg bg-sig text-white',
                end && 'rounded-r-lg bg-sig text-white',
                !start && !end && 'rounded-lg hover:bg-[rgba(201,162,75,.18)]',
              )}
            >
              {c.day}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="mt-3 w-full h-10 rounded-xl text-[13px] text-white/70 border border-white/14 hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        Don't know dates yet
      </button>
    </div>
  )
}

function ymOf(iso: string): YM { const { y, m } = parseISO(iso); return { y, m } }
function ymToday(): YM { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } }

export default RangeCalendar
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Manual smoke (temporary harness)**

Temporarily render `<RangeCalendar value={{start:null,end:null}} onChange={console.log} onSkip={()=>console.log('skip')} />` in a scratch route or Storybook-less harness (or just verify via the pill in Task 6). Confirm: clicking two days yields start→end with a claret band; clicking a third restarts; month arrows work; "Don't know dates yet" fires. Remove the harness before committing.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/home/RangeCalendar.tsx
git commit -m "feat: anchored dark-glass RangeCalendar UI (+ trailer)"
```

---

## Task 6: `CommandPill.tsx` — the four-beat creation pill

Evolves `HeroSearchPill` into the state machine (spec §3): intent → destination (commit + chip) → auto-opened calendar (or `Dates TBD`) → confirm (loading/error). Emits `onCommit`. **During this task it is NOT wired to creation** — it emits into a dev handler; the real `useCreateTrip` path arrives in Task 7. It must never submit into `NewTripSheet`.

**Files:**
- Create: `app/src/components/home/CommandPill.tsx`
- Reference (reuse styling/typewriter): `app/src/hero/HeroSearchPill.tsx`, `app/src/components/DestinationInput.tsx`, `app/src/data/usePlaceSearch.ts`

**Contract:**

```ts
export interface CommandPillCommit {
  destination: string          // committed clean label (spec §3.2)
  start?: string               // YYYY-MM-DD, omitted when datesTBD
  end?: string                 // YYYY-MM-DD, omitted when datesTBD
  datesTBD: boolean
}
export interface CommandPillProps {
  onCommit: (c: CommandPillCommit) => Promise<void> | void  // Task 7 wires this to create+navigate
  pending?: boolean            // parent-driven creating state (spec §3.4)
  error?: string | null        // parent-driven inline error (spec §3.4)
  className?: string
}
export interface CommandPillHandle { focus: () => void }    // forwardRef — used by "+ New trip" (Task 8)
```

- [ ] **Step 1: Implement the pill state machine**

Create `app/src/components/home/CommandPill.tsx`. Build it as a single glassy pill (reuse `HeroSearchPill`'s container classes) with three internal phases driven by state, not routes:

```tsx
import {
  forwardRef, useImperativeHandle, useRef, useState, useEffect, useId,
} from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import { usePlaceSearch } from '../../data/usePlaceSearch'
import { resolveCommitLabel } from '../../lib/destination-commit'
import { warmCover } from '../../lib/cover-prefetch'
import { formatRangeChip, type DateRange } from '../../lib/range-calendar'
import { RangeCalendar } from './RangeCalendar'
import { cn } from '../../lib/utils'

export interface CommandPillCommit {
  destination: string; start?: string; end?: string; datesTBD: boolean
}
export interface CommandPillProps {
  onCommit: (c: CommandPillCommit) => Promise<void> | void
  pending?: boolean; error?: string | null; className?: string
}
export interface CommandPillHandle { focus: () => void }

type Phase = 'destination' | 'dates'

export const CommandPill = forwardRef<CommandPillHandle, CommandPillProps>(function CommandPill(
  { onCommit, pending = false, error = null, className }, ref,
) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('destination')
  const [text, setText] = useState('')                 // raw typed text
  const [chosen, setChosen] = useState<string | null>(null)
  const [destination, setDestination] = useState<string | null>(null)  // committed label → chip
  const [acOpen, setAcOpen] = useState(false)
  const [range, setRange] = useState<DateRange>({ start: null, end: null })
  const [calOpen, setCalOpen] = useState(false)
  const [datesTBD, setDatesTBD] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const { places, loading } = usePlaceSearch(text)

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), [])

  // Commit the destination (chosen suggestion, else top result, else raw). Then
  // warm the cover and advance to the auto-opened calendar.
  const commitDestination = (chosenLabel?: string) => {
    const label = resolveCommitLabel({
      chosen: chosenLabel ?? chosen, raw: text, suggestions: places,
    })
    if (!label) return
    setDestination(label)
    setAcOpen(false)
    void warmCover(label)              // spec §3.1 — fire-and-forget, hook-free
    setPhase('dates')
    setCalOpen(true)                   // calendar auto-opens (spec §3.3 beat 3)
  }

  const clearDestination = () => {     // removing the chip → back to destination entry (§3.5)
    setDestination(null); setChosen(null); setText('')
    setRange({ start: null, end: null }); setDatesTBD(false); setCalOpen(false)
    setPhase('destination')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const canConfirm = !!destination && (datesTBD || (!!range.start && !!range.end))

  const confirm = () => {
    if (!canConfirm || pending) return
    void onCommit({
      destination: destination!,
      ...(datesTBD ? {} : { start: range.start!, end: range.end! }),
      datesTBD,
    })
  }

  // Esc priority: autocomplete → calendar → blur (spec §3.5)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (acOpen) { e.stopPropagation(); setAcOpen(false); return }
      if (calOpen) { e.stopPropagation(); setCalOpen(false); return }
      inputRef.current?.blur(); return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (phase === 'destination') commitDestination()   // Enter commits top result (§3.2)
      else if (canConfirm) confirm()
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canConfirm) confirm() }}
      className={cn('group/pill relative mx-auto w-full max-w-xl', className)}
      aria-busy={pending}
    >
      <div className={cn(
        'flex items-center gap-1.5 rounded-full p-1.5 pl-5',
        'border border-white/20 bg-[rgba(20,20,26,.34)] backdrop-blur-xl',
        'shadow-[0_10px_34px_rgba(0,0,0,.30)]',
        pending && 'opacity-90',
      )}>
        {/* committed destination chip */}
        {destination && (
          <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-white/16 bg-white/8 px-3 py-1.5 text-[14px] text-white">
            {destination}
            {!pending && (
              <button type="button" aria-label="Change destination" onClick={clearDestination}
                className="grid place-items-center -mr-1 size-5 rounded-full hover:bg-white/15">
                <X size={13} />
              </button>
            )}
          </span>
        )}

        {/* destination input OR the date token */}
        {phase === 'destination' ? (
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={acOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label="Where do you want to go?"
            autoComplete="off"
            value={text}
            disabled={pending}
            onChange={(e) => { setText(e.target.value); setChosen(null); setAcOpen(true) }}
            onFocus={() => setAcOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Where to next?"
            className="flex-1 min-w-0 bg-transparent text-[16px] text-white outline-none placeholder:text-white/55"
          />
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => { setCalOpen(o => !o); setDatesTBD(false) }}
            className="flex-1 min-w-0 text-left text-[15px] text-white/85"
          >
            {datesTBD ? <span className="text-white/55">Dates TBD</span>
              : range.start ? <span className="text-[var(--gold)]">{formatRangeChip(range)}</span>
              : <span className="text-white/50">When?</span>}
          </button>
        )}

        {/* CTA */}
        <motion.button
          type="submit"
          aria-label="Plan it"
          disabled={pending || !canConfirm}
          className={cn(
            'inline-flex h-[46px] shrink-0 items-center justify-center gap-1.5 rounded-full px-5',
            'bg-sig font-sans font-medium text-[14.5px] text-white',
            'disabled:opacity-55 hover:brightness-110',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
          )}
        >
          {pending ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : <>Plan it →</>}
        </motion.button>
      </div>

      {/* autocomplete overlay (reuses usePlaceSearch; styled for the dark pill) */}
      {phase === 'destination' && acOpen && text.trim().length >= 3 && (loading || places.length > 0) && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-white/12 bg-[rgba(16,14,20,.95)] backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,.5)]">
          {places.map((p) => (
            <li key={p} role="option" aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); setChosen(p); commitDestination(p) }}
              className="flex min-h-[44px] cursor-pointer items-center px-4 text-[14px] text-white/85 hover:bg-[rgba(125,34,48,.28)]">
              {p}
            </li>
          ))}
        </ul>
      )}

      {/* anchored calendar (auto-opened after destination commit) */}
      {phase === 'dates' && calOpen && (
        <div className="absolute left-1/2 top-full z-20 mt-3 -translate-x-1/2">
          <RangeCalendar
            value={range}
            onChange={setRange}
            onComplete={() => { setDatesTBD(false); setCalOpen(false) }}  // snap closed on completion
            onSkip={() => { setDatesTBD(true); setRange({ start: null, end: null }); setCalOpen(false) }}
          />
        </div>
      )}

      {error && <p className="mt-3 text-center text-[13px] text-[var(--gold)]">{error}</p>}

      {/* reduced-motion note: framer-motion entrance easing only; no elasticity when `reduce` */}
      <span hidden>{reduce ? 'rm' : ''}</span>
    </form>
  )
})

export default CommandPill
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: clean. (If `--gold` token isn't available as a Tailwind class, use the existing token class used elsewhere — check `tailwind.config`/`home-style.tsx` for `text-[var(--gold)]` vs a `text-gold` utility, and match the project's convention.)

- [ ] **Step 3: Manual behavior check via the hero**

Temporarily render `<CommandPill onCommit={(c) => console.log('COMMIT', c)} />` in `CinematicHero` in place of `HeroSearchPill` (dev-only; reverted/replaced properly in Task 7). `npm run dev`, then verify the full sequence: type "Kyoto" → suggestions → Enter commits "Kyoto, Japan" as a chip → calendar auto-opens → pick a range → chip shows "Jul 14 → Jul 18" → "Plan it →" logs the commit payload. Also verify "Don't know dates yet" → `Dates TBD` + enabled CTA; the × chip clears back to destination entry; Esc closes autocomplete then calendar.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/home/CommandPill.tsx
git commit -m "feat: CommandPill four-beat creation state machine (+ trailer)"
```

---

## Task 7: `MaterializeOverlay` + wire confirm → create → navigate

Spec §4/§4.1. A portal overlay owning a transition controller that survives the route change, plays the seed-card flight, and hands off when the planner mounts; reduced-motion/measure-failure → calm dissolve. This task makes `CommandPill`'s `onCommit` the **real** production path: `useCreateTrip` → navigate → overlay handoff. **Animation is cosmetic — creation+navigation must always happen.**

**Files:**
- Create: `app/src/components/home/materialize-controller.ts`
- Create: `app/src/components/home/MaterializeOverlay.tsx`
- Modify: `app/src/routes/Dashboard.tsx` (own the create→navigate handler; mount the overlay)

- [ ] **Step 1: Implement the controller (plain module, survives unmount)**

Create `app/src/components/home/materialize-controller.ts`:

```ts
/**
 * Transition state for the seed-card flight (spec §4.1). Lives OUTSIDE React
 * component state so it survives the route change from home → planner. A tiny
 * observable: the home triggers `begin`, the overlay subscribes and animates,
 * the planner (or a timeout) calls `arrive`/`fail` to hand off.
 */
export interface SeedPayload {
  destination: string
  rangeLabel: string            // "Jul 14 → Jul 18" | "Dates TBD"
  coverUrl: string | null       // cache-only peek result (null → gradient)
  sourceRect: DOMRect | null    // the pill's measured bounds
}
export type MaterializeStatus = 'idle' | 'flying' | 'arrived' | 'failed'

type Listener = () => void

class MaterializeController {
  status: MaterializeStatus = 'idle'
  payload: SeedPayload | null = null
  private listeners = new Set<Listener>()

  subscribe(l: Listener): () => void { this.listeners.add(l); return () => this.listeners.delete(l) }
  private emit() { this.listeners.forEach(l => l()) }

  begin(payload: SeedPayload) { this.payload = payload; this.status = 'flying'; this.emit() }
  arrive() { if (this.status === 'flying') { this.status = 'arrived'; this.emit() } }
  fail() { if (this.status === 'flying') { this.status = 'failed'; this.emit() } }
  reset() { this.status = 'idle'; this.payload = null; this.emit() }
}

export const materialize = new MaterializeController()
```

- [ ] **Step 2: Implement the overlay (portal, reduced-motion aware)**

Create `app/src/components/home/MaterializeOverlay.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { materialize, type SeedPayload, type MaterializeStatus } from './materialize-controller'

/**
 * Renders the flying seed card above everything during materialization. Mounted
 * once at the app root (Dashboard). Subscribes to the controller so it keeps
 * rendering across the route swap. Falls back to a plain dissolve under reduced
 * motion or if `arrive`/`fail` never comes within a window.
 */
export function MaterializeOverlay() {
  const reduce = useReducedMotion()
  const [, force] = useState(0)
  useEffect(() => materialize.subscribe(() => force(n => n + 1)), [])

  const status: MaterializeStatus = materialize.status
  const payload = materialize.payload
  const active = status === 'flying' || status === 'arrived'

  // Safety: if nothing hands off within 1.2s, dissolve out so we never get stuck.
  useEffect(() => {
    if (status !== 'flying') return
    const t = setTimeout(() => materialize.fail(), 1200)
    return () => clearTimeout(t)
  }, [status])

  // Clear shortly after arrival/failure so the seed fades, then unmounts.
  useEffect(() => {
    if (status === 'arrived' || status === 'failed') {
      const t = setTimeout(() => materialize.reset(), reduce ? 180 : 420)
      return () => clearTimeout(t)
    }
  }, [status, reduce])

  if (!active || !payload) return null

  const from = payload.sourceRect
  const start = from
    ? { top: from.top, left: from.left, width: from.width, x: 0, y: 0, scale: 1, borderRadius: 999 }
    : { top: '40%', left: '50%', width: 236, x: '-50%', y: 0, scale: 1, borderRadius: 16 }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <AnimatePresence>
        {status === 'flying' && (
          <motion.div
            key="seed"
            initial={start}
            animate={reduce
              ? { opacity: [1, 0], transition: { duration: 0.22 } }
              : { top: 96, left: '50%', x: '-50%', width: 236, scale: [1, 0.86, 0.42], borderRadius: 16,
                  transition: { duration: 0.9, ease: [0.32, 0.04, 0.18, 1] } }}
            className="absolute overflow-hidden border border-white/20 shadow-[0_26px_70px_rgba(0,0,0,.6)]"
          >
            <SeedFace payload={payload} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  )
}

function SeedFace({ payload }: { payload: SeedPayload }) {
  return (
    <div className="flex flex-col">
      <div className="relative h-[118px] bg-[linear-gradient(135deg,#3a2a30,#7d2230_70%,#a13546)]">
        {payload.coverUrl && (
          <img src={payload.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,.5),transparent_60%)]" />
      </div>
      <div className="bg-[rgba(14,12,18,.97)] px-3.5 py-2.5">
        <div className="font-serif text-[19px] text-white">{payload.destination.split(',')[0]}</div>
        <div className="font-mono text-[10.5px] text-[var(--gold)] mt-0.5">{payload.rangeLabel}</div>
      </div>
    </div>
  )
}

export default MaterializeOverlay
```

- [ ] **Step 3: Wire the create→navigate handler in Dashboard**

In `app/src/routes/Dashboard.tsx`, add a handler the pill commits into. It measures the pill, peeks the cached cover, begins the flight, creates the trip, fires the existing backfills, then navigates. Add near the other handlers:

```tsx
import { materialize } from '../components/home/MaterializeOverlay-controller-path' // -> './components/home/materialize-controller'
import { peekCover } from '../lib/cover-prefetch'
import { formatRangeChip } from '../lib/range-calendar'
// existing: useCreateTrip, useBackfillCoverImage, useBackfillDestinationGeo, useNavigate

const create = useCreateTrip()
const backfillCover = useBackfillCoverImage()
const backfillGeo = useBackfillDestinationGeo()
const [createErr, setCreateErr] = useState<string | null>(null)

const handlePillCommit = async (c: CommandPillCommit, pillEl: HTMLElement | null) => {
  setCreateErr(null)
  const rangeLabel = c.datesTBD ? 'Dates TBD' : formatRangeChip({ start: c.start!, end: c.end! })
  // begin the cosmetic flight (best-effort; never blocks the create)
  materialize.begin({
    destination: c.destination,
    rangeLabel,
    coverUrl: peekCover(c.destination) ?? null,
    sourceRect: pillEl?.getBoundingClientRect() ?? null,
  })
  try {
    const id = await create.mutateAsync({
      slug: '', title: c.destination.split(',')[0], subtitle: '',
      start: c.start ?? '', end: c.end ?? '', destination: c.destination, notes: '',
    })
    void backfillCover({ id, title: c.destination.split(',')[0],
      config: { title: c.destination.split(',')[0], destination: c.destination }, data: { days: [], completed: [] } })
    void backfillGeo({ id, destination: c.destination })
    nav(`/trip/${encodeURIComponent(id)}`)   // planner mount will call materialize.arrive() (Step 4)
  } catch (e) {
    materialize.fail()                          // dissolve the seed
    setCreateErr(REASONS[(e as Error).message] ?? "Couldn't create this trip. Try again.")
  }
}
```

(Use the correct relative import `./components/home/materialize-controller` for `materialize` — the placeholder path above is illustrative. Keep `REASONS` — lift the small map out of `NewTripSheet` into a shared spot or inline it; `NewTripSheet` is deleted in Task 9.)

Pass `handlePillCommit` + `pending`/`error` into the hero's pill (Task 8 finalizes hero wiring), and mount `<MaterializeOverlay />` once in Dashboard's returned tree.

- [ ] **Step 4: Hand off on planner mount**

In `app/src/trip/PlannerLayout.tsx` (the planner shell), call `materialize.arrive()` on mount so the seed dissolves onto the real header:

```tsx
import { materialize } from '../components/home/materialize-controller'
// inside the component:
useEffect(() => { materialize.arrive() }, [])
```

(If `PlannerLayout` cannot be measured/headered reliably, the 1.2s controller timeout already falls back to a dissolve — spec §4.1.)

- [ ] **Step 5: Typecheck + manual verify**

Run: `npx tsc -b` (clean). Then `npm run dev`: create a trip through the pill — confirm you land in the new trip's Plan view with the seed flight playing, and that creation still works with `prefers-reduced-motion` (DevTools → Rendering → emulate) showing the calm dissolve. Force an error path (e.g., temporarily throw in the handler) and confirm the pill shows the inline error and you stay on home.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/home/materialize-controller.ts app/src/components/home/MaterializeOverlay.tsx app/src/routes/Dashboard.tsx app/src/trip/PlannerLayout.tsx
git commit -m "feat: seed-card-flight materialization (controller+overlay) wired to create+navigate (+ trailer)"
```

---

## Task 8: Unified stacked home + `UpcomingJourney` + hero pill wiring

Spec §5. Replace the two-state early returns with one stacked page: hero (with the live `CommandPill`) → optional `UpcomingJourney` (State B) → travels. Reuse `homeGroups` ordering (already correct — §5.2).

**Files:**
- Create: `app/src/components/home/UpcomingJourney.tsx`
- Modify: `app/src/components/CinematicHero.tsx` (host `CommandPill`, forward a focus ref, add an in-view sentinel)
- Modify: `app/src/routes/Dashboard.tsx` (single stacked composition)
- Modify/absorb: `app/src/components/CinematicLaunchpad.tsx`, `app/src/components/CockpitHome.tsx`

- [ ] **Step 1: `UpcomingJourney` section**

Create `app/src/components/home/UpcomingJourney.tsx` — a full-width section with the focus trip's destination video (reuse `useDestinationClip` + `HeroVideoStage`), a glass status line from `cockpitModel(focus)`, and an "Open →" into Plan:

```tsx
import { ArrowRight } from 'lucide-react'
import { HeroVideoStage } from '../../hero/HeroVideoStage'
import { useDestinationClip } from '../../hero/useDestinationClip'
import { cockpitModel } from '../../lib/cockpit-model'
import type { Trip } from '../../types'
import type { Units } from '../../data/useAccountSettings'

export function UpcomingJourney({ trip, units, onOpen }: {
  trip: Trip; units: Units; onOpen: (id: string) => void
}) {
  const { clip } = useDestinationClip(trip)
  const m = cockpitModel(trip) // { phase, countdownLabel, dayPreview?, toArrange?, ... } — match existing shape
  return (
    <section className="relative min-h-[84vh] overflow-hidden flex flex-col items-center justify-center px-5 text-center">
      <div className="absolute inset-0" style={{ filter: 'brightness(1.4)' }}>
        <HeroVideoStage clip={clip} className="absolute inset-0" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,10,.82),rgba(5,6,10,.35)_42%,rgba(5,6,10,.92))]" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-3.5 text-white">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--gold)]">
          Your next journey · {m.countdownLabel}
        </div>
        <h2 className="font-serif text-[clamp(40px,9vw,84px)] leading-none">{trip.config?.destination?.split(',')[0] ?? trip.title}</h2>
        {/* glass status line — render m.dayPreview / m.toArrange / weather chips as today's CockpitCard does */}
        <button onClick={() => onOpen(trip.id)}
          className="mt-1.5 inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/8 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-white/14">
          Open {trip.config?.destination?.split(',')[0] ?? trip.title} <ArrowRight size={16} />
        </button>
      </div>
    </section>
  )
}
export default UpcomingJourney
```

(Match `cockpitModel`'s actual returned fields — read `app/src/lib/cockpit-model.ts` and reuse the same status-line pieces `CockpitCard` renders so weather/“to arrange” behave identically.)

- [ ] **Step 2: Host `CommandPill` in `CinematicHero`**

Modify `app/src/components/CinematicHero.tsx`: replace the `HeroSearchPill` usage with `CommandPill`, forward a `pillRef` (so "+ New trip" can focus it and the materialize handler can measure it), and wrap the pill in a sentinel element for the in-view observer. Change the props so the hero takes `onPillCommit`, `pending`, `error`, and a forwarded `pillRef` instead of `onSubmit`.

- [ ] **Step 3: Collapse Dashboard into one stacked composition**

Modify `app/src/routes/Dashboard.tsx`: remove the `!focus`/`focus` early returns. Render a single page:

```tsx
const groups = useMemo(() => homeGroups(trips ?? []), [trips])
// one page:
<>
  <CinematicHero
    headline="Where to next?"
    subcopy="Name a city and we'll start the itinerary, day by day."
    pillRef={pillRef}
    onPillCommit={(c) => handlePillCommit(c, pillRef.current?.measureEl ?? null)}
    pending={create.isPending}
    error={createErr}
    headerRight={headerRight}
  />
  {focus && <UpcomingJourney trip={focus} units={units} onOpen={openTrip} />}
  <TravelsSection groups={groups} onOpen={openTrip} tripActions={tripActions} /> {/* reuse existing travels list/grid */}
  <MaterializeOverlay />
  {/* share/delete dialogs stay */}
</>
```

Reuse the existing travels rendering (`TravelsList`/`TripGrid`) that `CockpitHome`/`CinematicLaunchpad` used; State C shows past, State B shows the full grouped list excluding `focus` (already handled by `homeGroups`). Keep the field-globe + starfield backdrops from the existing components.

- [ ] **Step 4: Retire the two separate home components**

Fold `CinematicLaunchpad` and `CockpitHome` into the composition (delete them if fully absorbed, or reduce each to a thin presentational helper the Dashboard composes). Ensure no dangling imports.

- [ ] **Step 5: Typecheck + manual verify both states**

Run: `npx tsc -b` (clean). `npm run dev`:
- **State C** (no upcoming trip / a past-only account): hero + pill, then "Your travels" (past). No "Your next journey".
- **State B** (an upcoming trip exists): hero + pill, then "Your next journey" with the focus trip + video, then "Your travels" (excludes the featured trip).

- [ ] **Step 6: Commit**

```bash
git add app/src/components/home/UpcomingJourney.tsx app/src/components/CinematicHero.tsx app/src/routes/Dashboard.tsx app/src/components/CinematicLaunchpad.tsx app/src/components/CockpitHome.tsx
git commit -m "feat: unified stacked home (hero pill + UpcomingJourney + travels) (+ trailer)"
```

---

## Task 9: "+ New trip" in-view fade + global navigate-then-focus

Spec §5.1/§6. The header button fades out while the hero pill is in view; clicking it scrolls to + focuses the pill (navigating Home first if elsewhere).

**Files:**
- Create: `app/src/components/home/useHeroPillInView.ts`
- Modify: `app/src/components/CinematicHero.tsx` (expose the sentinel ref), `app/src/routes/Dashboard.tsx` (drive header-button visibility), and the header "+ New trip" call sites (`AppShell`/`AccountMenu` area) for off-Home behavior.

- [ ] **Step 1: Implement the in-view hook**

Create `app/src/components/home/useHeroPillInView.ts`:

```ts
import { useEffect, useRef, useState } from 'react'

/** True while the observed element (the hero pill sentinel) is on screen. */
export function useHeroPillInView<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.01 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, inView }
}
```

- [ ] **Step 2: Drive the header button**

In `Dashboard.tsx`, attach the hook's `ref` to the hero pill sentinel and hide/fade the header "+ New trip" when `inView`:

```tsx
const { ref: pillSentinelRef, inView: pillInView } = useHeroPillInView<HTMLDivElement>()
// header "+ New trip" wrapper:
<div className={`transition-opacity duration-300 ${pillInView ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
  <Button variant="claret" onClick={focusHeroPill}><Plus size={16} strokeWidth={2.5} />New trip</Button>
</div>
```

`focusHeroPill` smooth-scrolls to the hero and focuses the pill:

```tsx
const focusHeroPill = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
  requestAnimationFrame(() => pillRef.current?.focus())
}
```

- [ ] **Step 3: Off-Home behavior**

For any "+ New trip" entry rendered on a non-Home route, make it navigate Home then focus the pill. Use a query flag or a tiny module signal the home reads on mount:

```tsx
// on click anywhere off-Home:
nav('/?new=1')
// in Dashboard, on mount:
useEffect(() => {
  if (new URLSearchParams(location.search).get('new') === '1') {
    window.scrollTo({ top: 0 }); requestAnimationFrame(() => pillRef.current?.focus())
    nav('/', { replace: true })
  }
}, [])
```

No modal/sheet ever appears (spec §6).

- [ ] **Step 4: Typecheck + manual verify**

Run: `npx tsc -b` (clean). `npm run dev`:
- At the top of Home the "+ New trip" button is hidden; scroll down → it fades in.
- Clicking it (when visible) scrolls up and focuses the pill (which hides the button again).
- From a planner route, an off-Home "+ New trip" (if present) lands on Home with the pill focused.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/home/useHeroPillInView.ts app/src/components/CinematicHero.tsx app/src/routes/Dashboard.tsx
git commit -m "feat: + New trip fades while hero pill in view; scroll/navigate-to-focus (+ trailer)"
```

---

## Task 10: Retire `NewTripSheet`

Spec §7.1. Delete the sheet and every path that creates a trip outside `CommandPill`.

**Files:**
- Delete: `app/src/routes/NewTripSheet.tsx`
- Modify: every importer (notably `app/src/routes/Dashboard.tsx`)

- [ ] **Step 1: Find all references**

Run from repo root: `git grep -n "NewTripSheet"`.
Expected: imports/usages in `Dashboard.tsx` (and possibly the explorations folder — ignore tsconfig-excluded `routes/_home-explorations/`).

- [ ] **Step 2: Remove usages**

Delete the `NewTripSheet` import, the `newOpen` state, and the `<NewTripSheet .../>` element from `Dashboard.tsx`. Ensure `openCreateTrip` (if any remaining caller) is repointed to `focusHeroPill` (Task 9). Move the `REASONS` map (used by the create handler) out of `NewTripSheet` into the create handler / a small shared const if not already done in Task 7.

- [ ] **Step 3: Delete the file**

```bash
git rm app/src/routes/NewTripSheet.tsx
```

- [ ] **Step 4: Verify no creation path remains outside CommandPill**

Run: `git grep -n "useCreateTrip"`.
Expected: only `data/useTrips.ts` (definition) and the Dashboard create handler. No other component calls it. Run `git grep -n "NewTripSheet"` → no matches (outside `_home-explorations/`).

- [ ] **Step 5: Full suite + typecheck**

Run: `npx tsc -b` (clean) and `npm test`.
Expected: all green — at least **734 + new unit tests** (range-calendar, destination-commit, cover-prefetch, the 5-day payload change), none removed except the obsolete NewTripSheet path (it had no dedicated test).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: retire NewTripSheet — CommandPill is the sole creation surface (+ trailer)"
```

---

## Final verification (after Task 10)

- [ ] `cd app && npm test` → green (≥ 734 + new units).
- [ ] `cd app && npx tsc -b` → clean.
- [ ] `cd app && npm run build` → succeeds (one pre-existing chunk-size warning is fine).
- [ ] Manual: create dated + undated trips through the pill in both States B and C; verify the seed flight, reduced-motion dissolve, error path, the "+ New trip" fade, and undated trips sorting below dated upcoming in "Your travels".
- [ ] Holistic spec re-read: every §3–§7 requirement maps to a shipped task.

---

## Self-review notes (author)

- **Spec coverage:** §3 beats → Tasks 5/6; §3.1 prefetch → Task 4 + Task 7 (peek at commit); §3.2 + §3.2.1 → Task 3 + Task 6 (`resolveCommitLabel`, label passed to backfills); §3.3 undated → Tasks 1/6; §3.4 loading/error → Task 6 props + Task 7 handler; §3.5 reset/Esc → Task 6; §3.6 mobile calendar → Task 5 (`max-w-[calc(100vw-2rem)]`, no scrim); §3.7 local dates → Task 2; §4/§4.1 materialization → Task 7; §5 unified home → Task 8; §5.1/§6 button rule → Task 9; §5.2 ordering → already in `homeGroups`, verified Task 8/final; §7.1 retirement → Task 10.
- **Known integration risks to resolve in build (not placeholders — real lookups):** the exact `cockpitModel` field names (read `lib/cockpit-model.ts`), the project's gold token class (`text-gold` vs `text-[var(--gold)]`), and how `CinematicHero` currently forwards header/pill props — match the existing code when wiring.
- **Type consistency:** `CommandPillCommit` ({ destination, start?, end?, datesTBD }) is used identically in Tasks 6 and 7; `DateRange`/`formatRangeChip` shared from `lib/range-calendar`; `materialize` controller API (`begin/arrive/fail/reset`) used identically in Tasks 7 (overlay + Dashboard + PlannerLayout).
