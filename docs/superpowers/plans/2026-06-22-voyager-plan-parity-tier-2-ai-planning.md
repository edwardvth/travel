# Tier 2 — AI Planning Power Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Plan tab's AI planning power to legacy-`Trip.html` parity, expressed natively in Voyager: a **deterministic-first "Optimize this day"** (AI breaks ties only), a **"What should I book?"** scan that flags stops with a confidence + reason and accepts into the existing reservation model, **per-stop duration suggestions** (AI with rule-based fallback), and **traveler context** folded into planning prompts only.

**Architecture:** New pure logic modules mirror the `suggest.ts` shape — a PURE prompt builder + a PURE robust-JSON parser, with `callAI` (`trip/ai.ts`) as a thin network boundary and a graceful fallback when AI is unavailable. The deterministic optimizer (`trip/optimize.ts`) is fully pure and network-free; the AI tie-break (`trip/optimize-ai.ts`) wraps it and degrades to the deterministic result. What-to-Book reuses `reservation.ts` (`status:'to_reserve'`) — **no new object type**. All writes are immutable via the lifted `save({ data } | { config })`, edit-gated by `canEdit`, additive JSONB (back-compat preserved). `completed` keys are remapped via `itinerary-helpers.remapCompletedAfterReorder`. **HARD BOUNDARY:** traveler context personalizes planning prompts only and must NEVER enter the enrichment prompt (`enrich.ts`) — an explicit test asserts this so a future shared per-location cache stays valid.

**Tech Stack:** Vite + React 18 + TS + Tailwind + Supabase ai-proxy (Claude) + vitest

---

## Dependency & ordering note

- **Tier 2 DEPENDS on Phase 0** (`docs/superpowers/specs/2026-06-22-voyager-plan-parity-design.md` §"Phase 0 — AI Reliability Verification"). The `ai-proxy` slug must be confirmed live (Suggest Places/Day return results, not `403`) **before** Tasks 3, 5, 6, and 7 can be smoke-tested end-to-end. The pure logic (prompt builders, parsers, the deterministic optimizer, rule-based duration fallback) is buildable and testable **without** live AI — those tasks do not block on Phase 0; only the live smoke-tests at the end of each AI task do.
- Recommended task order matches the spec's Tier 2 sub-sections: 2a (Optimize Day) → 2b (What-to-Book) → 2c (durations) → 2d (traveler context). Types come first.

## Conventions every task must honor

- **Immutable saves only.** Persist via the lifted `save({ data })` / `save({ config })` from `PlannerOutletContext` (see `Itinerary.tsx:23`, `StopList.tsx:34-43`, `StopDetail.tsx:27`). Clone before mutating (`cloneData()` pattern in `StopList.tsx:53-61`, `StopDetail.tsx:70-76`). Never mutate cached `trip`/`data`.
- **Edit-gated.** Every write guarded by `canEdit`; view-only users see no controls.
- **Additive JSONB back-compat.** New fields are optional; read legacy fields gracefully. No schema migration.
- **AI calls mirror `suggest.ts`:** a PURE prompt builder → `callAI(textMessage(prompt), { maxTokens })` (`ai.ts:36`, `ai.ts:17`) → a PURE robust-JSON parser. The builder and parser are unit-tested; the network call is a thin boundary that can throw (callers catch and fall back).
- **Anti-slop / a11y:** lucide icons only (no emoji); CSS-var token classes (`bg-base`, `text-muted`, `border-hair`, `bg-sig-btn`, `text-sig-link`, `--gold`); Fraunces / General Sans / JetBrains Mono per role; ≥44px touch targets; `aria-*` on icon-only buttons; focus rings; focus-trap + esc + restore on sheets/menus; `prefers-reduced-motion`; busy states on async buttons (`Button` has `busy`); no layout-shift hover.
- **Verify per task:** `cd app && npx tsc -b` (clean) and `cd app && npx vitest run <file>` (green). Before any deploy: `cd app && npm run build` and the full `cd app && npm test` (~526 today, growing).
- **Git:** branch `main`, push `origin/main` only (never `upstream`). One commit per task, message ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Deploy** (from repo root, after a task batch / checkpoint): `cd app && npm run build` then `npx wrangler deploy`.

---

## Task 1 — Additive types (`Stop.bookingRecommendation`, `TripConfig.travelerContext` + `travelerProfile`)

> `Stop.duration?` **already exists** (`types.ts:12`) — do not re-add it. This task only adds the new shapes Tier 2 needs.

**File:** `app/src/types.ts`

### Step 1.1 — Write the (compile-time) failing assertion
- [ ] Create `app/src/types-tier2.test.ts` that imports the types and asserts the new shapes exist by constructing typed literals:

```ts
import { describe, it, expect } from 'vitest'
import type { Stop, TripConfig } from './types'

describe('Tier 2 additive types', () => {
  it('Stop carries an optional bookingRecommendation with confidence + reason', () => {
    const stop: Stop = {
      name: 'Musée d’Orsay',
      bookingRecommendation: { confidence: 'high', reason: 'Popular timed-entry museum' },
    }
    expect(stop.bookingRecommendation?.confidence).toBe('high')
    expect(stop.bookingRecommendation?.reason).toBe('Popular timed-entry museum')
  })

  it('TripConfig carries optional travelerContext (freeform) and reserved travelerProfile (structured)', () => {
    const config: TripConfig = {
      travelerContext: '2 adults, foodies, hate crowds, moderate walking',
      travelerProfile: { groupSize: 2, pace: 'relaxed', accessibility: 'step-free' },
    }
    expect(config.travelerContext).toContain('foodies')
    expect(config.travelerProfile?.groupSize).toBe(2)
  })

  it('both new fields are optional (a bare stop / config still type-checks)', () => {
    const stop: Stop = { name: 'A' }
    const config: TripConfig = {}
    expect(stop.bookingRecommendation).toBeUndefined()
    expect(config.travelerContext).toBeUndefined()
  })
})
```

### Step 1.2 — Run it red (type error: properties don't exist yet)
- [ ] `cd app && npx vitest run src/types-tier2.test.ts`
  - **Expected:** FAILS to compile / run — `Object literal may only specify known properties, and 'bookingRecommendation' does not exist in type 'Stop'` (and the same for `travelerContext`/`travelerProfile`).

### Step 1.3 — Minimal implementation
- [ ] In `app/src/types.ts`, on the `Stop` interface (after the `reservation?` field, ~`types.ts:24`), add:

```ts
  /**
   * AI "What should I book?" advisory (Tier 2b). Additive; explains *why* a stop
   * is flagged so the UI can justify the suggestion. Accepting a flag sets
   * `reservation: { status: 'to_reserve' }` (reuses reservation.ts — no new object).
   */
  bookingRecommendation?: { confidence: 'high' | 'medium' | 'low'; reason: string }
```

- [ ] On the `TripConfig` interface (after `coverImage?`, before the legacy index signature ~`types.ts:65-67`), add:

```ts
  /**
   * Freeform traveler context folded into PLANNING prompts only (suggest /
   * optimize-day / what-to-book) — e.g. "2 adults, foodies, hate crowds".
   * MUST NEVER reach the enrichment prompt (enrich.ts stays trip-agnostic).
   */
  travelerContext?: string
  /**
   * Reserved structured traveler profile (Tier 2d) — NOT surfaced in UI yet;
   * the shape is reserved so future prompts can use structure instead of
   * re-parsing freeform text. Additive, no migration.
   */
  travelerProfile?: { groupSize?: number; pace?: string; accessibility?: string }
```

### Step 1.4 — Run it green
- [ ] `cd app && npx vitest run src/types-tier2.test.ts`
  - **Expected:** `Test Files 1 passed`, `Tests 3 passed`.
- [ ] `cd app && npx tsc -b` — **Expected:** clean (no output, exit 0).

### Step 1.5 — Commit
- [ ] `git add -A && git commit` — message: `Tier 2: additive types (bookingRecommendation, travelerContext, travelerProfile)` + trailer.

---

## Task 2 — PURE deterministic day optimizer (`trip/optimize.ts`)

The core architectural piece: a network-free, fully-tested optimizer that proposes a new stop order from signals already on the data. Locked priority: **(1) locked anchors stay fixed** (a stop with a reservation time, or a completed stop) → **(2) geographic clustering** (nearest-neighbour via `walk.ts` haversine) → **(3) stop duration** → **(4) meal timing** (eat-kind stops near mealtimes).

**New file:** `app/src/trip/optimize.ts`
**New file:** `app/src/trip/optimize.test.ts`

### Step 2.1 — Write failing tests first

- [ ] Create `app/src/trip/optimize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isLockedAnchor, optimizeDayOrder } from './optimize'
import type { Stop } from '../types'

const stop = (name: string, extra: Partial<Stop> = {}): Stop => ({ name, ...extra })

describe('isLockedAnchor', () => {
  it('locks a stop with a reservation time', () => {
    expect(isLockedAnchor(stop('A', { reservation: { status: 'to_reserve', time: '7:00 PM' } }), false)).toBe(true)
  })
  it('locks a completed stop', () => {
    expect(isLockedAnchor(stop('A'), true)).toBe(true)
  })
  it('does NOT lock a reservation without a time', () => {
    expect(isLockedAnchor(stop('A', { reservation: { status: 'to_reserve' } }), false)).toBe(false)
  })
  it('does NOT lock a plain stop', () => {
    expect(isLockedAnchor(stop('A'), false)).toBe(false)
  })
})

describe('optimizeDayOrder — invariants', () => {
  it('returns a permutation of the original indices (never invents/deletes/duplicates)', () => {
    const stops = [stop('A'), stop('B'), stop('C'), stop('D')]
    const order = optimizeDayOrder(stops, [])
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })

  it('returns identity for 0 or 1 stops', () => {
    expect(optimizeDayOrder([], [])).toEqual([])
    expect(optimizeDayOrder([stop('A')], [])).toEqual([0])
  })

  it('keeps locked anchors at their original positions', () => {
    // index 1 has a reservation time → it must stay at position 1.
    const stops = [
      stop('A', { lat: 0, lng: 0 }),
      stop('Dinner', { reservation: { status: 'to_reserve', time: '7:00 PM' }, lat: 0, lng: 5 }),
      stop('C', { lat: 0, lng: 0.1 }),
      stop('D', { lat: 0, lng: 0.2 }),
    ]
    const order = optimizeDayOrder(stops, [])
    expect(order[1]).toBe(1) // 'Dinner' still at position 1
  })

  it('keeps a completed stop pinned at its position', () => {
    const stops = [stop('A'), stop('B'), stop('C')]
    const order = optimizeDayOrder(stops, [1]) // completedIndices = [1]
    expect(order[1]).toBe(1)
  })
})

describe('optimizeDayOrder — geographic clustering', () => {
  it('orders free stops by nearest-neighbour proximity (haversine), not original order', () => {
    // Laid out so a greedy proximity walk reorders them.
    const stops = [
      stop('Start', { lat: 0, lng: 0 }),
      stop('Far', { lat: 0, lng: 1.0 }),
      stop('Near', { lat: 0, lng: 0.01 }),
      stop('Mid', { lat: 0, lng: 0.5 }),
    ]
    const order = optimizeDayOrder(stops, [])
    // From Start, the nearest free neighbour is 'Near' (index 2), then 'Mid' (3), then 'Far' (1).
    expect(order).toEqual([0, 2, 3, 1])
  })

  it('leaves order unchanged when no stop has coordinates (nothing to cluster on)', () => {
    const stops = [stop('A'), stop('B'), stop('C')]
    expect(optimizeDayOrder(stops, [])).toEqual([0, 1, 2])
  })
})

describe('optimizeDayOrder — meal timing tie-break', () => {
  it('pulls an eat-kind stop toward a mealtime slot when proximity is otherwise tied', () => {
    // Two equidistant free stops; the eat-kind one should win the lunch-adjacent slot.
    const stops = [
      stop('Anchor', { reservation: { status: 'to_reserve', time: '12:30 PM' }, kind: 'eat', lat: 0, lng: 0 }),
      stop('Museum', { kind: 'do', lat: 0, lng: 0.2 }),
      stop('Bistro', { kind: 'eat', lat: 0, lng: 0.2 }),
    ]
    const order = optimizeDayOrder(stops, [])
    // Both free stops equidistant from the anchor; 'Bistro' (eat) is preferred adjacent to the lunchtime anchor.
    expect(order.indexOf(2)).toBeLessThan(order.indexOf(1))
  })
})
```

### Step 2.2 — Run it red
- [ ] `cd app && npx vitest run src/trip/optimize.test.ts`
  - **Expected:** FAILS — `Failed to resolve import "./optimize"` / `optimizeDayOrder is not a function`.

### Step 2.3 — Implement `trip/optimize.ts` (minimal, pure, no network)

- [ ] Create `app/src/trip/optimize.ts`:

```ts
import type { Stop, StopKind } from '../types'
import { stopCoords, haversineKm, type LatLng } from './walk'
import { stopKind } from './icons'

/**
 * PURE deterministic day optimizer. Proposes a new stop ORDER (an array where
 * out[newPos] = oldIndex) from signals already on the data — NO network. Locked
 * anchors stay fixed; remaining stops are ordered by geographic proximity, with
 * duration and meal-timing used to break ties. The AI tie-break (optimize-ai.ts)
 * only ever refines this result; if it's unavailable, THIS stands.
 *
 * Invariant: the result is always a permutation of [0..n-1] — never invents,
 * deletes, or duplicates a stop.
 */

/** Parse a stored display time ("7:00 PM" / "19:00") to minutes-since-midnight, or null. */
export function parseMinutes(time: string | undefined): number | null {
  if (!time) return null
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * A stop is a LOCKED ANCHOR when it has a reservation TIME (a hard commitment)
 * or is already completed (the traveler has been there). Anchors keep their
 * original position; the optimizer reorders only the free stops around them.
 */
export function isLockedAnchor(stop: Stop, completed: boolean): boolean {
  if (completed) return true
  const t = stop.reservation?.time ?? stop.booking?.time
  return typeof t === 'string' && t.trim().length > 0
}

/** Mealtime windows (minutes-since-midnight) used for the eat-kind tie-break. */
const MEAL_WINDOWS: ReadonlyArray<[number, number]> = [
  [11 * 60 + 30, 13 * 60 + 30], // lunch
  [18 * 60, 20 * 60 + 30],      // dinner
  [7 * 60, 9 * 60 + 30],        // breakfast
]

function nearMealtime(minutes: number | null): boolean {
  if (minutes == null) return false
  return MEAL_WINDOWS.some(([lo, hi]) => minutes >= lo && minutes <= hi)
}

/** Distance between two stops; Infinity when either lacks coordinates. */
function distance(a: Stop, b: Stop): number {
  const ca = stopCoords(a)
  const cb = stopCoords(b)
  if (!ca || !cb) return Infinity
  return haversineKm(ca as LatLng, cb as LatLng)
}

/**
 * Propose a new order for one day's stops. Returns indices into the ORIGINAL
 * array: out[newPosition] = originalIndex. Locked anchors stay at their original
 * position; free stops are filled into the remaining slots by a greedy
 * nearest-neighbour walk (seeded from the previous placed stop), breaking ties
 * by (a) eat-kind adjacency to a mealtime anchor, then (b) longer duration first
 * (front-load demanding stops), then (c) original order for stability.
 */
export function optimizeDayOrder(stops: readonly Stop[], completedIndices: readonly number[]): number[] {
  const n = stops.length
  if (n <= 1) return stops.map((_, i) => i)

  const completed = new Set(completedIndices)
  const locked = stops.map((s, i) => isLockedAnchor(s, completed.has(i)))

  // Result slots: anchors fixed, free slots to be filled in order.
  const out: (number | null)[] = stops.map((_, i) => (locked[i] ? i : null))
  const freeIndices = stops.map((_, i) => i).filter(i => !locked[i])
  const remaining = new Set(freeIndices)

  const kindOf = (i: number): StopKind => stopKind(stops[i])
  const duration = (i: number): number => (typeof stops[i].duration === 'number' ? stops[i].duration! : 0)

  // Pick the next free stop to place after `prevIndex` (the last placed stop, or
  // null when none placed yet). Lower score wins.
  const pickNext = (prevIndex: number | null, mealtimeContext: boolean): number => {
    let best = -1
    let bestScore = Infinity
    for (const i of remaining) {
      const dist = prevIndex == null ? 0 : distance(stops[prevIndex], stops[i])
      const proximity = Number.isFinite(dist) ? dist : 9999 // no-coord stops sink, stable
      // Tie-breaks fold into the score as small deltas so proximity dominates.
      const mealBias = mealtimeContext && kindOf(i) === 'eat' ? -0.5 : 0
      const durationBias = -duration(i) / 100000 // longer first, negligible vs proximity
      const orderBias = i / 1000000 // stable original-order final tiebreak
      const score = proximity + mealBias + durationBias + orderBias
      if (score < bestScore) { bestScore = score; best = i }
    }
    return best
  }

  // Walk the slots left→right; fill each free slot with the next picked stop.
  let prevPlaced: number | null = null
  for (let pos = 0; pos < n; pos++) {
    if (out[pos] !== null) { prevPlaced = out[pos]; continue }
    // Mealtime context = the nearest already-placed anchor at/near this slot has a meal time.
    const anchorAtPos = locked[pos] ? null : nearestAnchorMinutes(stops, locked, pos)
    const mealtimeContext = nearMealtime(anchorAtPos)
    const pick = pickNext(prevPlaced, mealtimeContext)
    if (pick < 0) break
    out[pos] = pick
    remaining.delete(pick)
    prevPlaced = pick
  }

  // Safety: drop any nulls (shouldn't happen) — guarantees a full permutation.
  return out.filter((v): v is number => v !== null)
}

/** Minutes of the nearest locked anchor (by slot distance) to `pos`, or null. */
function nearestAnchorMinutes(stops: readonly Stop[], locked: readonly boolean[], pos: number): number | null {
  for (let d = 0; d < stops.length; d++) {
    for (const j of [pos - d, pos + d]) {
      if (j >= 0 && j < stops.length && locked[j]) {
        const t = stops[j].reservation?.time ?? stops[j].booking?.time
        const mins = parseMinutes(t)
        if (mins != null) return mins
      }
    }
  }
  return null
}
```

> Note: `stopKind` is re-exported from `trip/icons.tsx` (used in `StopRow.tsx:6`). The duration/meal biases are intentionally tiny so geographic proximity dominates and only genuine ties flip — keep the test expectations aligned with that ordering.

### Step 2.4 — Run it green
- [ ] `cd app && npx vitest run src/trip/optimize.test.ts`
  - **Expected:** all tests pass (4 `isLockedAnchor` + invariants + clustering + meal-timing). If a clustering/meal expectation is off by a tie, adjust the bias magnitudes (proximity must dominate) — never weaken the permutation/anchor invariants.
- [ ] `cd app && npx tsc -b` — **Expected:** clean.

### Step 2.5 — Commit
- [ ] `git add -A && git commit` — `Tier 2: pure deterministic day optimizer (anchors → clustering → duration → meals)` + trailer.

---

## Task 3 — AI tie-break wrapper (`trip/optimize-ai.ts`) — prompt builder + parser pure, thin callAI boundary, graceful fallback

The AI receives the current order + the deterministic proposed order and may improve **only if necessary** — never inventing/deleting/relocating stops, always respecting locked anchors. If AI is unavailable or returns no change / an invalid permutation, **the deterministic result stands.**

**New file:** `app/src/trip/optimize-ai.ts`
**New file:** `app/src/trip/optimize-ai.test.ts`

### Step 3.1 — Write failing tests (pure builder + parser + fallback)

- [ ] Create `app/src/trip/optimize-ai.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildOptimizePrompt, parseOptimizeOrder, optimizeDay } from './optimize-ai'
import type { Stop } from '../types'

const stop = (name: string, extra: Partial<Stop> = {}): Stop => ({ name, ...extra })
const stops = [stop('A'), stop('B'), stop('C')]

describe('buildOptimizePrompt', () => {
  it('includes the current order, the deterministic proposal, and the no-invent/anchor guardrails', () => {
    const p = buildOptimizePrompt(stops, [0, 2, 1], { lockedPositions: [0] })
    expect(p).toMatch(/A/)
    expect(p).toMatch(/\[0,\s*2,\s*1\]|0, *2, *1/)
    expect(p.toLowerCase()).toContain('do not invent')
    expect(p.toLowerCase()).toContain('locked')
    expect(p.toLowerCase()).toMatch(/json/)
  })

  it('folds traveler context into the prompt when provided', () => {
    const p = buildOptimizePrompt(stops, [0, 1, 2], { travelerContext: 'foodies, hate crowds' })
    expect(p).toContain('foodies, hate crowds')
  })
})

describe('parseOptimizeOrder', () => {
  it('parses a clean JSON array of indices', () => {
    expect(parseOptimizeOrder('[0,2,1]', 3)).toEqual([0, 2, 1])
  })
  it('strips fences/preamble and slices the array', () => {
    expect(parseOptimizeOrder('Here you go:\n```json\n[2,1,0]\n```', 3)).toEqual([2, 1, 0])
  })
  it('returns null when the result is not a valid permutation of 0..n-1', () => {
    expect(parseOptimizeOrder('[0,1,1]', 3)).toBeNull()   // duplicate
    expect(parseOptimizeOrder('[0,1]', 3)).toBeNull()     // wrong length
    expect(parseOptimizeOrder('[0,1,5]', 3)).toBeNull()   // out of range
    expect(parseOptimizeOrder('garbage', 3)).toBeNull()
  })
})

describe('optimizeDay — graceful fallback', () => {
  afterEach(() => vi.restoreAllMocks())

  it('falls back to the deterministic order when callAI throws', async () => {
    vi.mock('./ai', () => ({
      textMessage: (t: string) => [{ role: 'user', content: t }],
      callAI: vi.fn().mockRejectedValue(new Error('AI down')),
    }))
    const { optimizeDay: opt } = await import('./optimize-ai')
    const result = await opt(stops, [])
    // Deterministic order for coordless stops is identity; result is a valid permutation.
    expect([...result].sort()).toEqual([0, 1, 2])
  })
})
```

### Step 3.2 — Run it red
- [ ] `cd app && npx vitest run src/trip/optimize-ai.test.ts`
  - **Expected:** FAILS — `Failed to resolve import "./optimize-ai"`.

### Step 3.3 — Implement `trip/optimize-ai.ts`

- [ ] Create `app/src/trip/optimize-ai.ts`:

```ts
import { callAI, textMessage } from './ai'
import { optimizeDayOrder, isLockedAnchor } from './optimize'
import type { Stop } from '../types'

export interface OptimizeContext {
  /** Positions (in the deterministic order) that must not move — locked anchors. */
  lockedPositions?: number[]
  /** Freeform traveler context, folded in for tailoring (Tier 2d). PLANNING only. */
  travelerContext?: string
}

/**
 * Build the AI tie-break prompt. The model gets the named stops, the current
 * order, and the DETERMINISTIC proposed order, and may refine ONLY if a clearly
 * better order exists — never inventing, deleting, or relocating stops, always
 * keeping locked anchors fixed. Output is a strict JSON array of indices. PURE.
 */
export function buildOptimizePrompt(stops: readonly Stop[], proposed: readonly number[], ctx: OptimizeContext = {}): string {
  const list = stops.map((s, i) => `  ${i}: ${s.name}${s.time ? ` (${s.time})` : ''}${s.kind ? ` [${s.kind}]` : ''}`).join('\n')
  const locked = ctx.lockedPositions?.length ? `\nLocked positions (must NOT move): [${ctx.lockedPositions.join(', ')}].` : ''
  const traveler = ctx.travelerContext?.trim()
    ? `\nTraveler context (tailor to this): ${ctx.travelerContext.trim()}`
    : ''
  return `You are a travel planner refining the ORDER of one day's stops.

Stops (index: name):
${list}

A deterministic optimizer already proposed this order (indices into the list above):
[${proposed.join(', ')}]${locked}${traveler}

Improve this order ONLY if a clearly better one exists for a smooth day (minimize backtracking, sensible meal timing). Rules:
- Do NOT invent, delete, duplicate, or rename stops.
- Keep every locked position exactly where it is.
- If the proposed order is already good, return it unchanged.

Respond with ONLY a JSON array of the indices in the new order — no markdown, no prose:
[${proposed.join(', ')}]`
}

/**
 * Parse the model's reply into a validated index order. Returns null unless the
 * result is a PERMUTATION of 0..n-1 (right length, in range, no duplicates), so
 * a malformed reply can never corrupt the day. PURE + unit-tested.
 */
export function parseOptimizeOrder(text: string, n: number): number[] | null {
  const cleaned = (text || '').replace(/```json|```/g, '').trim()
  const tryParse = (s: string): unknown => { try { return JSON.parse(s) } catch { return null } }
  let arr = tryParse(cleaned)
  if (!Array.isArray(arr)) {
    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start >= 0 && end > start) arr = tryParse(cleaned.slice(start, end + 1))
  }
  if (!Array.isArray(arr) || arr.length !== n) return null
  const nums = arr.map(v => (typeof v === 'number' ? v : Number(v)))
  if (nums.some(v => !Number.isInteger(v) || v < 0 || v >= n)) return null
  if (new Set(nums).size !== n) return null
  return nums
}

/**
 * Deterministic-first optimize: compute the deterministic order, then ask the AI
 * to break ties. If AI is unavailable, returns an invalid permutation, or
 * doesn't improve, the DETERMINISTIC order stands. Network is a thin boundary;
 * never throws to the caller.
 */
export async function optimizeDay(
  stops: readonly Stop[],
  completedIndices: readonly number[],
  ctx: Omit<OptimizeContext, 'lockedPositions'> = {},
): Promise<number[]> {
  const deterministic = optimizeDayOrder(stops, completedIndices)
  if (deterministic.length <= 2) return deterministic

  const completed = new Set(completedIndices)
  const lockedPositions = deterministic
    .map((origIndex, pos) => (isLockedAnchor(stops[origIndex], completed.has(origIndex)) ? pos : -1))
    .filter(p => p >= 0)

  try {
    const text = await callAI(
      textMessage(buildOptimizePrompt(stops, deterministic, { ...ctx, lockedPositions })),
      { maxTokens: 400 },
    )
    const refined = parseOptimizeOrder(text, stops.length)
    if (!refined) return deterministic
    // The refined array is indices into the ORIGINAL stops; honor it directly.
    // Guard: locked anchors must still sit at the same original positions they
    // held in the deterministic order; otherwise discard the AI result.
    const ok = lockedPositions.every(pos => refined[pos] === deterministic[pos])
    return ok ? refined : deterministic
  } catch {
    return deterministic
  }
}
```

### Step 3.4 — Run it green
- [ ] `cd app && npx vitest run src/trip/optimize-ai.test.ts`
  - **Expected:** builder/parser/fallback tests pass.
- [ ] `cd app && npx tsc -b` — **Expected:** clean.

### Step 3.5 — Commit
- [ ] `git add -A && git commit` — `Tier 2: AI tie-break wrapper for optimize-day (pure builder/parser, graceful fallback)` + trailer.

---

## Task 4 — Wire "Optimize this day" into the Plan UI (Itinerary + StopList) with completed remap

Surface a per-day "Optimize this day" action; apply the resulting order immutably and remap `completed` via `remapCompletedAfterReorder`.

**Files:** `app/src/trip/itinerary-helpers.ts` (+ its test), `app/src/trip/StopList.tsx`, `app/src/trip/Itinerary.tsx`

### Step 4.1 — Failing test: a reusable "apply order" data transform

> Apply-order = `arrayMove`-free reorder by an explicit index order, with the completed remap. Add a pure helper so the wiring is testable without React.

- [ ] In `app/src/trip/itinerary-helpers.test.ts`, add:

```ts
import { applyDayOrder } from './itinerary-helpers'
import type { TripData } from '../types'

describe('applyDayOrder', () => {
  const data: TripData = {
    days: [{ title: '', stops: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }],
    completed: ['0-2'], // 'C' is done
  }

  it('reorders the day’s stops by the given order and remaps completed to follow the stop', () => {
    // order = [2,0,1] → new positions: pos0='C'(old2), pos1='A'(old0), pos2='B'(old1)
    const next = applyDayOrder(data, 0, [2, 0, 1])
    expect(next.days[0].stops.map(s => s.name)).toEqual(['C', 'A', 'B'])
    // 'C' moved old index 2 → new index 0, so completed must become '0-0'.
    expect(next.completed).toEqual(['0-0'])
  })

  it('returns an immutable clone (does not mutate input)', () => {
    const next = applyDayOrder(data, 0, [2, 0, 1])
    expect(next).not.toBe(data)
    expect(data.days[0].stops.map(s => s.name)).toEqual(['A', 'B', 'C'])
  })

  it('is a no-op for an identity order', () => {
    const next = applyDayOrder(data, 0, [0, 1, 2])
    expect(next.days[0].stops.map(s => s.name)).toEqual(['A', 'B', 'C'])
    expect(next.completed).toEqual(['0-2'])
  })
})
```

### Step 4.2 — Run it red
- [ ] `cd app && npx vitest run src/trip/itinerary-helpers.test.ts`
  - **Expected:** FAILS — `applyDayOrder is not a function`.

### Step 4.3 — Implement `applyDayOrder` in `itinerary-helpers.ts`

- [ ] Append to `app/src/trip/itinerary-helpers.ts`:

```ts
import type { TripData } from '../types'

/**
 * Immutably reorder one day's stops by an explicit `order` (out[newPos] =
 * oldIndex — the optimizer's output shape) and remap `completed` so done-state
 * follows the stop. Other days are untouched. Clones; never mutates input.
 */
export function applyDayOrder(data: TripData, day: number, order: readonly number[]): TripData {
  const src = data.days?.[day]
  if (!src) return data
  const reordered = order.map(oldIndex => src.stops[oldIndex]).filter(Boolean)
  const days = data.days.map((d, i) => (i === day ? { ...d, stops: reordered } : d))
  const completed = remapCompletedAfterReorder(data.completed, day, order)
  return { ...data, days, completed }
}
```

> `remapCompletedAfterReorder` already takes `order` where `order[newIndex] = oldIndex` — exactly the optimizer's output — so it drops in directly (see `itinerary-helpers.ts:31-53`).

### Step 4.4 — Run it green
- [ ] `cd app && npx vitest run src/trip/itinerary-helpers.test.ts`
  - **Expected:** all (existing + new `applyDayOrder`) pass.

### Step 4.5 — Wire the action into `StopList` (button + busy + error)

- [ ] In `app/src/trip/StopList.tsx`:
  - Add imports: `import { Sparkles } from './icons'` (or `lucide-react` if `Sparkles` isn't re-exported — verify `icons.tsx` first), `import { optimizeDay } from './optimize-ai'`, `import { applyDayOrder } from './itinerary-helpers'`, `import { Button } from '../components/ui/Button'`.
  - Add local state: `const [optimizing, setOptimizing] = useState(false)` and `const [optimizeError, setOptimizeError] = useState<string | null>(null)`.
  - Add an `async function handleOptimize()` (edit-gated): collect `completedIndices` for this day from `trip.data?.completed` (parse `"<day>-<n>"` keys → indices on `day`), call `optimizeDay(stops, completedIndices, { travelerContext: trip.config?.travelerContext })`, then `save({ data: applyDayOrder(trip.data, day, order) })`. Wrap in try/catch → friendly `optimizeError`; `finally` clears `optimizing`. Skip when `stops.length < 2`.
  - Render an "Optimize this day" `Button variant="soft"` with `busy={optimizing}`, a `<Sparkles size={16} aria-hidden="true" />` icon, only when `canEdit && stops.length >= 2`. Place it above the list (or pass it up to `Itinerary` — see 4.6). Show `optimizeError` in the existing token-themed error style (mirror `Itinerary.tsx:176-180`).
  - **a11y:** `Button` already supplies focus rings + busy semantics; ensure the icon is `aria-hidden`.

### Step 4.6 — Surface it in `Itinerary` (the Plan day header)

- [ ] In `app/src/trip/Itinerary.tsx`, the day header (`Itinerary.tsx:141-144`) currently shows the title + `addStopButton`. Add the Optimize action next to it for `canEdit && count > 1`. To keep the optimize logic with the stop data, the recommended placement is **inside `StopList`** (it owns `stops`, `save`, and the completed-remap) and render the button at the top of `StopList`'s returned fragment; `Itinerary` needs no new state. Keep the day header's "Add a stop" button as-is.

> Reduced-motion: no new animations introduced; the reorder is an immutable data swap (rows re-render in place). Do not add a layout-shifting transition.

### Step 4.7 — Verify
- [ ] `cd app && npx tsc -b` — **Expected:** clean.
- [ ] `cd app && npx vitest run src/trip/itinerary-helpers.test.ts src/trip/optimize.test.ts src/trip/optimize-ai.test.ts` — **Expected:** all green.
- [ ] **Live smoke (needs Phase 0):** on a day with ≥2 stops, click "Optimize this day" → order updates, completed checkmarks stay on the right stops; with AI down, the deterministic order still applies (no error toast that blocks use).

### Step 4.8 — Commit
- [ ] `git add -A && git commit` — `Tier 2: wire "Optimize this day" into Plan (applyDayOrder + StopList action, completed remap)` + trailer.

---

## Task 5 — "What should I book?" — prompt builder + parser pure/tested, surface flags, accept → reservation

Scans the itinerary, flags stops that typically need a reservation, stamps `stop.bookingRecommendation`, and lets the user accept a flag → `reservation: { status: 'to_reserve' }` (reuse `reservation.ts`; no new object type).

**New file:** `app/src/trip/whatToBook.ts`
**New file:** `app/src/trip/whatToBook.test.ts`
**UI:** surface in `Itinerary` / `StopList` / `StopRow` (accept affordance) and `StopDetail`.

### Step 5.1 — Failing tests (pure builder + parser)

- [ ] Create `app/src/trip/whatToBook.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildWhatToBookPrompt, parseBookingFlags } from './whatToBook'
import type { Stop } from '../types'

const stops: Stop[] = [
  { name: 'Musée d’Orsay', type: 'Museum' },
  { name: 'Street market stroll', type: 'Market' },
  { name: 'Le Jules Verne', type: 'Restaurant' },
]

describe('buildWhatToBookPrompt', () => {
  it('lists every stop by index and asks for confidence + reason JSON', () => {
    const p = buildWhatToBookPrompt(stops, {})
    expect(p).toContain('Musée d’Orsay')
    expect(p).toContain('Le Jules Verne')
    expect(p.toLowerCase()).toContain('confidence')
    expect(p.toLowerCase()).toContain('reason')
    expect(p.toLowerCase()).toMatch(/json/)
  })
  it('folds traveler context in when present', () => {
    const p = buildWhatToBookPrompt(stops, { travelerContext: 'party of 6' })
    expect(p).toContain('party of 6')
  })
})

describe('parseBookingFlags', () => {
  it('parses index → {confidence, reason} into a map keyed by stop index', () => {
    const text = '[{"index":0,"confidence":"high","reason":"Popular timed-entry museum"},{"index":2,"confidence":"medium","reason":"Fine-dining, books out"}]'
    const flags = parseBookingFlags(text, stops.length)
    expect(flags.get(0)).toEqual({ confidence: 'high', reason: 'Popular timed-entry museum' })
    expect(flags.get(2)?.confidence).toBe('medium')
    expect(flags.has(1)).toBe(false)
  })
  it('strips fences/preamble and ignores out-of-range or malformed entries', () => {
    const text = 'ok:\n```json\n[{"index":9,"confidence":"high","reason":"x"},{"index":0,"confidence":"bogus","reason":"y"},{"index":1,"confidence":"low","reason":"Casual, no booking"}]\n```'
    const flags = parseBookingFlags(text, stops.length)
    expect(flags.has(9)).toBe(false)       // out of range
    expect(flags.has(0)).toBe(false)       // invalid confidence dropped
    expect(flags.get(1)).toEqual({ confidence: 'low', reason: 'Casual, no booking' })
  })
  it('returns an empty map on garbage', () => {
    expect(parseBookingFlags('nope', 3).size).toBe(0)
  })
})
```

### Step 5.2 — Run it red
- [ ] `cd app && npx vitest run src/trip/whatToBook.test.ts`
  - **Expected:** FAILS — `Failed to resolve import "./whatToBook"`.

### Step 5.3 — Implement `trip/whatToBook.ts`

- [ ] Create `app/src/trip/whatToBook.ts`:

```ts
import { callAI, textMessage } from './ai'
import type { Stop } from '../types'

export type BookingConfidence = 'high' | 'medium' | 'low'
export type BookingFlag = { confidence: BookingConfidence; reason: string }
export interface WhatToBookContext {
  /** Freeform traveler context, folded in for tailoring (Tier 2d). PLANNING only. */
  travelerContext?: string
}

const CONFIDENCES: readonly BookingConfidence[] = ['high', 'medium', 'low']

/**
 * Build the "what should I book?" prompt. The model scans the listed stops and
 * returns ONLY those that typically need a reservation, each with a confidence
 * and a short human reason. PURE + unit-tested.
 */
export function buildWhatToBookPrompt(stops: readonly Stop[], ctx: WhatToBookContext): string {
  const list = stops.map((s, i) => `  ${i}: ${s.name}${s.type ? ` — ${s.type}` : ''}`).join('\n')
  const traveler = ctx.travelerContext?.trim() ? `\nTraveler context: ${ctx.travelerContext.trim()}` : ''
  return `You are a travel concierge. Review these stops and identify which ones TYPICALLY require a reservation in advance (timed-entry museums, popular restaurants, shows, ferries, guided tours). Skip stops that don't need booking (parks, casual strolls, viewpoints).${traveler}

Stops (index: name — type):
${list}

For each stop that needs booking, give a confidence ("high" | "medium" | "low") and a SHORT reason (≤12 words) the traveler will understand.

Respond with ONLY a JSON array — no markdown, no prose:
[{"index":0,"confidence":"high","reason":"Popular timed-entry museum"}]`
}

/**
 * Parse the model's reply into a Map of stopIndex → {confidence, reason}. Drops
 * out-of-range indices, invalid confidence values, and empty reasons. Garbage in
 * → empty map. PURE + unit-tested.
 */
export function parseBookingFlags(text: string, n: number): Map<number, BookingFlag> {
  const out = new Map<number, BookingFlag>()
  const cleaned = (text || '').replace(/```json|```/g, '').trim()
  const tryParse = (s: string): unknown => { try { return JSON.parse(s) } catch { return null } }
  let arr = tryParse(cleaned)
  if (!Array.isArray(arr)) {
    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start >= 0 && end > start) arr = tryParse(cleaned.slice(start, end + 1))
  }
  if (!Array.isArray(arr)) return out
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const index = typeof r.index === 'number' ? r.index : Number(r.index)
    const confidence = String(r.confidence) as BookingConfidence
    const reason = typeof r.reason === 'string' ? r.reason.trim() : ''
    if (!Number.isInteger(index) || index < 0 || index >= n) continue
    if (!CONFIDENCES.includes(confidence)) continue
    if (!reason) continue
    out.set(index, { confidence, reason })
  }
  return out
}

/** Run the scan against a day's stops; returns the flag map. Thin boundary. */
export async function whatToBook(stops: readonly Stop[], ctx: WhatToBookContext = {}): Promise<Map<number, BookingFlag>> {
  if (!stops.length) return new Map()
  const text = await callAI(textMessage(buildWhatToBookPrompt(stops, ctx)), { maxTokens: 800 })
  return parseBookingFlags(text, stops.length)
}
```

### Step 5.4 — Run it green
- [ ] `cd app && npx vitest run src/trip/whatToBook.test.ts` — **Expected:** all pass.
- [ ] `cd app && npx tsc -b` — **Expected:** clean.

### Step 5.5 — Wire the scan + flags into the UI

- [ ] **Stamp flags (data):** in `StopList.tsx`, add `async function handleWhatToBook()` (edit-gated): call `whatToBook(stops, { travelerContext: trip.config?.travelerContext })`, then for each `[index, flag]` immutably patch `stop.bookingRecommendation = flag` via the existing `cloneData()` + `save({ data })` pattern (set on each flagged stop). Busy + friendly error state mirror Task 4.
- [ ] **Surface the flag (StopRow):** in `StopRow.tsx`, when `stop.bookingRecommendation` is present **and** the stop has no reservation yet (`reservationStatus(stop) === null`), render a compact, token-themed advisory chip — a lucide `Calendar`/`Info` icon + the `reason` (truncated), with the confidence reflected in tone (e.g. `high` → claret/`bg-sig-btn/10 text-sig`, `medium`/`low` → muted). When `canEdit`, the chip is a button "Add to reservations" that calls `onSetReservation(index, { status: 'to_reserve' })` (already plumbed, `StopRow.tsx:25`, `StopList.tsx:86-93`). Accepting it sets the reservation → it appears in Plan and the Trip tab (already wired to `stop.reservation`). a11y: ≥44px target via min-height, `aria-label` describing the recommendation, focus ring.
- [ ] **Surface in StopDetail:** when `stop.bookingRecommendation` is present and unreserved, show the reason as a small notice above the Reservation card (`StopDetail.tsx:411`), with the same "Add to reservations" action that already exists (`patchReservation({ status: 'to_reserve' })`).
- [ ] **Trigger:** add a "What should I book?" `Button variant="soft"` (lucide `Calendar`/`Sparkles`) in the Plan day toolbar (alongside Optimize, in `StopList`), `busy` while scanning, edit-gated, only when `stops.length > 0`.

> No new persisted object — `bookingRecommendation` is advisory metadata; accepting it writes a `reservation`. The recommendation may remain on the stop (informational) or be cleared on accept; **decision: keep it** (it explains why the reservation exists) — but never render the advisory chip once a reservation exists (avoid duplicate affordances).

### Step 5.6 — Verify
- [ ] `cd app && npx tsc -b` — clean. `cd app && npx vitest run src/trip/whatToBook.test.ts src/trip/reservation.test.ts` — green.
- [ ] **Live smoke (needs Phase 0):** run the scan on a mixed day → museum/restaurant get flagged with reasons, a park does not; accept a flag → it becomes a `to_reserve` reservation visible in Plan + Trip tab.

### Step 5.7 — Commit
- [ ] `git add -A && git commit` — `Tier 2: "What should I book?" scan (pure builder/parser, confidence+reason → reservation)` + trailer.

---

## Task 6 — Stop-duration suggestions (AI + rule-based fallback) surfaced in StopDetail

A per-stop "suggest a typical visit time" that fills `stop.duration` (minutes). Rule-based fallback by kind/type when AI is unavailable (mirrors legacy). Feeds Tier 3's day-utilization summary.

**New file:** `app/src/trip/duration.ts`
**New file:** `app/src/trip/duration.test.ts`
**UI:** `app/src/trip/StopDetail.tsx`

### Step 6.1 — Failing tests (pure parser + pure fallback)

- [ ] Create `app/src/trip/duration.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fallbackDuration, parseDuration, buildDurationPrompt } from './duration'
import type { Stop } from '../types'

describe('fallbackDuration (rule-based, no AI)', () => {
  it('gives an eat-kind stop a meal-length default', () => {
    expect(fallbackDuration({ name: 'Bistro', kind: 'eat' })).toBe(90)
  })
  it('gives a museum a longer default than a viewpoint', () => {
    const museum = fallbackDuration({ name: 'Louvre', type: 'Museum' })
    const park = fallbackDuration({ name: 'Park', type: 'Park' })
    expect(museum).toBeGreaterThan(park)
  })
  it('falls back to a sensible generic default for an unknown stop', () => {
    expect(fallbackDuration({ name: 'Mystery' })).toBe(60)
  })
})

describe('parseDuration', () => {
  it('parses a bare number of minutes', () => {
    expect(parseDuration('90')).toBe(90)
  })
  it('parses "{"minutes":120}" JSON', () => {
    expect(parseDuration('{"minutes":120}')).toBe(120)
  })
  it('parses "2 hours" / "1.5h" phrasing', () => {
    expect(parseDuration('about 2 hours')).toBe(120)
    expect(parseDuration('1.5h')).toBe(90)
  })
  it('returns null on garbage / non-positive', () => {
    expect(parseDuration('soon')).toBeNull()
    expect(parseDuration('0')).toBeNull()
  })
})

describe('buildDurationPrompt', () => {
  it('names the stop and asks for minutes', () => {
    const p = buildDurationPrompt({ name: 'Colosseum', type: 'Monument' } as Stop)
    expect(p).toContain('Colosseum')
    expect(p.toLowerCase()).toContain('minutes')
  })
})
```

### Step 6.2 — Run it red
- [ ] `cd app && npx vitest run src/trip/duration.test.ts` — **Expected:** FAILS (`Failed to resolve import "./duration"`).

### Step 6.3 — Implement `trip/duration.ts`

- [ ] Create `app/src/trip/duration.ts`:

```ts
import { callAI, textMessage } from './ai'
import { stopKind } from './icons'
import type { Stop } from '../types'

/**
 * Rule-based typical visit duration (minutes) by kind/type. Pure; mirrors the
 * legacy fallbacks so durations exist even when AI is unavailable.
 */
export function fallbackDuration(stop: Stop): number {
  const kind = stopKind(stop)
  if (kind === 'eat') return 90
  if (kind === 'stay') return 0
  const type = (stop.type ?? '').toLowerCase()
  if (/museum|gallery|palace|aquarium/.test(type)) return 120
  if (/monument|church|cathedral|castle|tower/.test(type)) return 75
  if (/park|garden|viewpoint|market|square|street/.test(type)) return 45
  if (/show|theatre|theater|concert/.test(type)) return 150
  return 60
}

/**
 * Parse an AI duration reply into minutes. Accepts a bare number, {"minutes":N},
 * or "N hours/h/min" phrasing. Returns null on garbage or non-positive. PURE.
 */
export function parseDuration(text: string): number | null {
  const raw = (text || '').trim()
  if (!raw) return null
  try {
    const j = JSON.parse(raw)
    if (j && typeof j === 'object' && typeof (j as { minutes?: unknown }).minutes === 'number') {
      const m = (j as { minutes: number }).minutes
      return m > 0 ? Math.round(m) : null
    }
  } catch { /* fall through */ }
  const hours = raw.match(/(\d+(?:\.\d+)?)\s*(?:h|hour|hours)\b/i)
  if (hours) { const m = Math.round(parseFloat(hours[1]) * 60); return m > 0 ? m : null }
  const mins = raw.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minute|minutes)?\b/)
  if (mins) { const m = Math.round(parseFloat(mins[1])); return m > 0 ? m : null }
  return null
}

/** Build the duration prompt. PURE. */
export function buildDurationPrompt(stop: Stop): string {
  return `How long does a typical visit to "${stop.name}"${stop.type ? ` (${stop.type})` : ''} take? Reply with ONLY the number of minutes (e.g. 90).`
}

/**
 * Suggest a duration in minutes: try AI, fall back to the rule-based default if
 * AI is unavailable or unparseable. Never throws. Thin network boundary.
 */
export async function suggestDuration(stop: Stop): Promise<number> {
  try {
    const text = await callAI(textMessage(buildDurationPrompt(stop)), { maxTokens: 50 })
    return parseDuration(text) ?? fallbackDuration(stop)
  } catch {
    return fallbackDuration(stop)
  }
}
```

### Step 6.4 — Run it green
- [ ] `cd app && npx vitest run src/trip/duration.test.ts` — **Expected:** all pass.
- [ ] `cd app && npx tsc -b` — clean.

### Step 6.5 — Surface in StopDetail (edit-gated)

- [ ] In `app/src/trip/StopDetail.tsx`, in the "Edit this stop" grid (`StopDetail.tsx:374-409`, alongside Time/Type), add a **Duration** control:
  - A small "Suggest" button (lucide `Clock`/`Sparkles`, `busy` while running) that calls `suggestDuration(stop)` then `patchStop({ duration })` (the `patchStop` helper already exists, `StopDetail.tsx:79-84`).
  - A numeric/minutes display + a manual editable field so the user can override (e.g. an `Input type="number"` writing `patchStop({ duration: Number(...) || undefined })`).
  - Render the current duration as a humane "~1h 30m" label. a11y: labelled input, ≥44px target, busy state, focus ring; friendly error reuse like `genError` (`StopDetail.tsx:38`).
- [ ] No new persisted shape — `stop.duration` already exists (`types.ts:12`).

### Step 6.6 — Verify
- [ ] `cd app && npx tsc -b` — clean. `cd app && npx vitest run src/trip/duration.test.ts` — green.
- [ ] **Live smoke (AI optional — fallback proves it works offline):** "Suggest" fills a sensible duration; with AI down, the rule-based default still fills.

### Step 6.7 — Commit
- [ ] `git add -A && git commit` — `Tier 2: stop-duration suggestions (AI + rule-based fallback) in StopDetail` + trailer.

---

## Task 7 — Traveler context: config field + fold into PLANNING prompt builders (and assert enrich.ts excludes it)

Expose `config.travelerContext` (freeform) in the UI, fold it into the planning prompt builders (`suggest.ts`, optimize-day, what-to-book — already plumbed in Tasks 3 & 5), and lock the boundary with a test asserting the **enrichment** prompt never includes it.

**Files:** `app/src/trip/suggest.ts` (+ test), a Trip-details surface for the field, and a new boundary test referencing `enrich.ts`.

### Step 7.1 — Failing tests: planning prompts include context; enrich does NOT

- [ ] In `app/src/trip/suggest.test.ts`, add to the `buildSuggestPrompt`/`buildSuggestDayPrompt` describe(s):

```ts
import { buildSuggestPrompt, buildSuggestDayPrompt } from './suggest'

describe('traveler context in planning prompts', () => {
  it('buildSuggestPrompt folds travelerContext in when provided', () => {
    const p = buildSuggestPrompt('ramen', { tripTitle: 'Tokyo', travelerContext: 'vegetarian, no pork' })
    expect(p).toContain('vegetarian, no pork')
  })
  it('buildSuggestDayPrompt folds travelerContext in when provided', () => {
    const p = buildSuggestDayPrompt({ tripTitle: 'Tokyo', travelerContext: 'with two kids' })
    expect(p).toContain('with two kids')
  })
  it('omits any traveler line when context is empty', () => {
    const p = buildSuggestPrompt('ramen', { tripTitle: 'Tokyo' })
    expect(p.toLowerCase()).not.toContain('traveler context')
  })
})
```

- [ ] Create `app/src/trip/enrich-boundary.test.ts` (the HARD BOUNDARY guard):

```ts
import { describe, it, expect } from 'vitest'
import { buildEnrichPrompt } from './enrich'
import type { Stop } from '../types'

/**
 * HARD BOUNDARY: traveler context personalizes PLANNING prompts only. The
 * enrichment prompt must stay trip-agnostic so a future shared per-location
 * cache remains valid. buildEnrichPrompt must not accept, reference, or emit
 * traveler context.
 */
describe('enrich.ts excludes traveler context (trip-agnostic boundary)', () => {
  it('does not include any traveler-context string in the enrichment prompt', () => {
    const stop: Stop = { name: 'Notre-Dame', type: 'Cathedral' }
    const prompt = buildEnrichPrompt(stop, 'Paris', {})
    const TRAVELER = 'TRAVELER_CONTEXT_SENTINEL_2_adults_foodies'
    expect(prompt).not.toContain(TRAVELER)
    // And the function signature offers no traveler hook to begin with.
    expect(prompt.toLowerCase()).not.toContain('traveler context')
  })
})
```

> Verify `enrich.ts` exposes a pure `buildEnrichPrompt(stop, destination, grounding)` builder. If the prompt is currently inlined inside `generateStopDetail`, **extract a pure `buildEnrichPrompt` first** (no behavior change) so this boundary is testable — do that as the first sub-step here, keeping `enrich.test.ts` green. The builder must take **no traveler argument**, structurally guaranteeing the boundary.

### Step 7.2 — Run it red
- [ ] `cd app && npx vitest run src/trip/suggest.test.ts src/trip/enrich-boundary.test.ts`
  - **Expected:** suggest tests FAIL (context not folded yet); boundary test FAILS if `buildEnrichPrompt` isn't exported yet.

### Step 7.3 — Implement

- [ ] In `app/src/trip/suggest.ts`:
  - Extend `SuggestContext` with `travelerContext?: string` (after `kind?`, ~`suggest.ts:9`).
  - In `buildSuggestPrompt` and `buildSuggestDayPrompt`, add a traveler line only when non-empty, e.g.:
    ```ts
    const traveler = ctx.travelerContext?.trim() ? `\n\nTraveler context (tailor suggestions to this): ${ctx.travelerContext.trim()}` : ''
    ```
    and append `${traveler}` to the prompt body (before the JSON-format instruction).
  - In `suggestPlaces` / `suggestDay`, pass `ctx` through unchanged (callers already pass a `SuggestContext`).
- [ ] In callers (`AddStop`, `Itinerary.handleSuggestDay` at `Itinerary.tsx:65`), pass `travelerContext: trip.config?.travelerContext` into the `ctx`.
- [ ] In `enrich.ts`: extract the inlined prompt into a pure exported `buildEnrichPrompt(stop, destination, grounding: EnrichGrounding)` (no traveler param), and have `generateStopDetail` call it. Keep `enrich.test.ts` green (add a builder test if helpful). **Do not** add any traveler parameter.

### Step 7.4 — Surface the field (Trip details)

- [ ] Add a labelled freeform textarea **"Who's traveling?"** that reads/writes `config.travelerContext` via `save({ config: { ...trip.config, travelerContext: value } })`, edit-gated. Place it on the Trip-details surface (where `config.notes` is edited — search `trip/Trip.tsx` for the notes field and add it beside it). a11y: labelled control, ≥44px, focus ring; helper copy ("e.g. 2 adults, foodies, hate crowds, moderate walking"). Do **not** add UI for `travelerProfile` (reserved shape only).

### Step 7.5 — Run it green
- [ ] `cd app && npx vitest run src/trip/suggest.test.ts src/trip/enrich-boundary.test.ts src/trip/enrich.test.ts` — **Expected:** all pass, boundary holds.
- [ ] `cd app && npx tsc -b` — clean.

### Step 7.6 — Commit
- [ ] `git add -A && git commit` — `Tier 2: traveler context in planning prompts (suggest/optimize/what-to-book); enrich.ts boundary test` + trailer.

---

## Task 8 — Tier 2 integration check + full suite + deploy

### Step 8.1 — Full verification
- [ ] `cd app && npx tsc -b` — **Expected:** clean.
- [ ] `cd app && npm test` — **Expected:** the full suite passes (~526 + the new tests added across Tasks 1–7), `Tests N passed`, 0 failed.
- [ ] `cd app && npm run build` — **Expected:** succeeds (the one pre-existing chunk-size warning is fine).

### Step 8.2 — Phase-0-gated live smoke (do AFTER confirming `ai-proxy` is live)
- [ ] Optimize a day with a reservation-timed stop → the timed stop stays put, others recluster; completed stays correct.
- [ ] AI offline → optimize still applies the deterministic order (no blocking error).
- [ ] "What should I book?" flags timed-entry/restaurant with reasons; accept → reservation shows in Plan + Trip tab.
- [ ] "Suggest duration" fills a stop; AI offline → rule-based default fills.
- [ ] Set traveler context → suggestions/optimize reflect it; enrichment output is unchanged by context (boundary holds).

### Step 8.3 — Deploy
- [ ] `cd app && npm run build` then (from repo root) `npx wrangler deploy`.
- [ ] Smoke routes return 200 (`/`, `/trips`, `/trip/x/guide`, `/trip/x/trip`).

### Step 8.4 — Commit / push
- [ ] Push `origin/main` at the checkpoint. (Each task already committed with the trailer.)

---

## Definition of done

- [ ] **Types (Task 1):** `Stop.bookingRecommendation?: { confidence: 'high'|'medium'|'low'; reason: string }` and `TripConfig.travelerContext?: string` + reserved `TripConfig.travelerProfile?: { groupSize?; pace?; accessibility? }` added; `Stop.duration?` left as-is (already existed). All optional, back-compat preserved. `types-tier2.test.ts` green.
- [ ] **Deterministic optimizer (Task 2):** `trip/optimize.ts` is pure, network-free, fully tested — permutation invariant, locked anchors (reservation time **or** completed) fixed, geographic clustering (haversine via `walk.ts`), duration + meal-timing tie-breaks.
- [ ] **AI tie-break (Task 3):** `trip/optimize-ai.ts` — pure prompt builder + pure permutation-validating parser; thin `callAI` boundary; **graceful fallback** to the deterministic order on failure / invalid result / unchanged; never throws to caller; respects locked anchors.
- [ ] **Optimize wiring (Task 4):** `applyDayOrder` reorders + remaps `completed` via `remapCompletedAfterReorder`; "Optimize this day" surfaced in Plan (`StopList`/`Itinerary`), edit-gated, immutable `save`, busy + friendly error.
- [ ] **What-to-Book (Task 5):** `trip/whatToBook.ts` pure builder/parser tested (confidence enum + reason validated, out-of-range dropped); flags stamped onto `bookingRecommendation`; accept → `reservation { status: 'to_reserve' }` (reuses `reservation.ts`, **no new object type**); surfaced in `StopRow`/`StopDetail` and the Plan toolbar; reflected in Trip tab.
- [ ] **Duration (Task 6):** `trip/duration.ts` — pure `parseDuration` + `fallbackDuration` (rule-based by kind/type) tested; `suggestDuration` never throws; surfaced + manually editable in `StopDetail`, edit-gated; fills `stop.duration`.
- [ ] **Traveler context (Task 7):** `config.travelerContext` folded into `suggest.ts` + optimize-day + what-to-book builders; surfaced as an edit-gated freeform field on Trip details; `travelerProfile` shape reserved (no UI). **HARD BOUNDARY enforced by `enrich-boundary.test.ts`:** `buildEnrichPrompt` takes no traveler argument and never emits traveler context.
- [ ] **Conventions:** every write immutable via lifted `save`, edit-gated by `canEdit`; additive JSONB back-compat; AI calls mirror `suggest.ts` (pure builder → `callAI` → pure parser); lucide icons only; CSS-var token theming (light+dark); a11y (≥44px, aria, focus rings, busy states, reduced-motion); one commit per task with the Co-Authored-By trailer; branch `main`.
- [ ] **Green gates:** `npx tsc -b` clean; full `npm test` passes; `npm run build` succeeds; deployed; smoke routes 200; Phase-0-gated AI smoke matrix passes.

---

## Writing-plans self-review

**Spec coverage (against `docs/superpowers/specs/2026-06-22-voyager-plan-parity-design.md` §"Tier 2 — AI planning power" + §"Data model" + §"Testing"):**
- 2a Optimize Day, deterministic-first + AI tie-break → Tasks 2, 3, 4 (locked anchors, clustering, duration, meal timing; `remapCompletedAfterReorder` reuse). ✔
- 2b What-to-Book with confidence + reason, accept → `to_reserve` reservation (no new object) → Task 5. ✔
- 2c Stop-duration suggestions + rule-based fallback → Task 6. ✔
- 2d Traveler context (`travelerContext` surfaced; `travelerProfile` reserved) folded into PLANNING prompts; enrichment boundary → Task 7. Stretch multi-day optimize **noted as optional, not specced** (see note below). ✔
- Data-model additions (`bookingRecommendation`, `travelerContext`, `travelerProfile`; `duration` already present) → Task 1. ✔
- Testing: pure deterministic optimizer; what-to-book selection + confidence shape; durations; **enrich.ts excludes traveler context** → Tasks 2/3/5/6/7. ✔
- **Tier 2 DEPENDS on Phase 0** — stated up front and gating every live smoke. ✔

**Stretch (optional, not fully specced):** multi-day optimize (cluster by location, balance museums/meals across days) is intentionally left out of the task list; it would be a larger prompt + UX surface and is not required for Tier 2 to ship. Decide at a future plan stage.

**Placeholder scan:** no `TODO`/`FIXME`/`...`/"implement here" left in code blocks — every step shows real, compilable code. ✔

**Type-consistency scan:** `bookingRecommendation` (confidence `'high' | 'medium' | 'low'` + `reason: string`), `travelerContext: string`, `travelerProfile: { groupSize?; pace?; accessibility? }` are spelled identically in Task 1, the builders/parsers (Tasks 3/5), the DoD, and the spec's data-model section. `reservation: { status: 'to_reserve' }` matches `reservation.ts`/`types.ts`. The optimizer's order convention (`out[newPos] = oldIndex`) matches `remapCompletedAfterReorder`'s expected `order` arg. ✔

**Boundary integrity:** the enrichment boundary is enforced *structurally* (no traveler parameter on `buildEnrichPrompt`) **and** by an explicit test — not just a comment. ✔
