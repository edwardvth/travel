# PlaceId Backfill for Legacy Stops — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give legacy/placeId-less stops a Google Place ID via a founder-triggered, re-runnable admin batch — auto-attaching confident matches and routing the rest to a founder review queue — so those stops can join the shared place-description cache.

**Architecture:** Pure, unit-tested resolver/scoring helpers in `app/src/trip/placeId/` (TDD in vitest). A founder-gated Deno edge function `place-id-admin` (service role + `GOOGLE_PLACES_API_KEY`) that **copies those helpers verbatim** and exposes actions `metrics`/`scan`/`list`/`attach`/`skip`/`reset`, all trip writes optimistically guarded on `trips.updated_at`. A new service-role-only `placeid_review` table. A TanStack client hook + a founder-only review screen at `/admin/place-ids`.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind + TanStack Query + React Router; Supabase (Postgres JSONB + Deno edge functions, PostgREST); Google Places API (New) Text Search; vitest. Deno is **not** installed locally — the edge function is verified by live probes, copying the tested pure helpers verbatim (mirrors `enrich-place`).

**Spec:** `docs/superpowers/specs/2026-06-24-voyager-placeid-backfill-design.md`

---

## File Structure

**New pure logic (`app/src/trip/placeId/`)** — each focused + unit-tested:
- `constants.ts` — named tunables (`MAX_REVIEW_CANDIDATES`, `EXACT_DISTANCE_M`, `NEAR_DISTANCE_M`, `AMBIGUITY_PENALTY`, `AUTO_ATTACH_THRESHOLD`, `GOOGLE_MAX_CONCURRENCY`, `SCAN_PAGE_SIZE`).
- `types.ts` — `Candidate`, `MatchResult`, `ReviewStopRef`.
- `parseTextSearch.ts` (+ test) — Google `places:searchText` JSON → `Candidate[]`.
- `geo.ts` (+ test) — `distanceMeters(a, b)` haversine.
- `name.ts` (+ test) — `normalizeName`, `nameSimilarity`.
- `scoreMatch.ts` (+ test) — `scoreMatch(stop, candidates) → MatchResult`.
- `locateStop.ts` (+ test) — re-locate a placeId-less stop by `(dayIndex, stopIndex, name)`.

**Modified:**
- `app/src/types.ts` — extend `Stop.placeSource` to `'google' | 'none'`; add `placeMatchedAt?`, `placeMatchMethod?`, `placeMatchDistanceM?`.
- `app/src/App.tsx` — add the `/admin/place-ids` route.
- `app/src/trip/lazyRoutes.ts` — lazy-export the new screen.

**New backend / client / UI:**
- `supabase/sql/placeid_review.sql` — table + indexes + RLS deny-all + `trips.updated_at` trigger.
- `supabase/functions/place-id-admin/index.ts` — the founder-gated admin function (copies the pure helpers).
- `app/src/data/usePlaceIdAdmin.ts` — TanStack hook wrapping the function (metrics/scan/list/attach/skip/reset).
- `app/src/routes/PlaceIdAdmin.tsx` — founder-only review screen.

---

## Task 1: Named constants + shared types

**Files:**
- Create: `app/src/trip/placeId/constants.ts`
- Create: `app/src/trip/placeId/types.ts`
- Test: `app/src/trip/placeId/constants.test.ts`

- [ ] **Step 1: Write the failing test**

`app/src/trip/placeId/constants.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  MAX_REVIEW_CANDIDATES, EXACT_DISTANCE_M, NEAR_DISTANCE_M,
  AMBIGUITY_PENALTY, AUTO_ATTACH_THRESHOLD, GOOGLE_MAX_CONCURRENCY, SCAN_PAGE_SIZE,
} from './constants'

describe('placeId backfill constants', () => {
  it('are coherent, tunable numbers', () => {
    expect(MAX_REVIEW_CANDIDATES).toBe(3)
    expect(EXACT_DISTANCE_M).toBeLessThan(NEAR_DISTANCE_M) // exact band is tighter
    expect(AUTO_ATTACH_THRESHOLD).toBeGreaterThan(0)
    expect(AMBIGUITY_PENALTY).toBeGreaterThan(0)
    expect(GOOGLE_MAX_CONCURRENCY).toBeGreaterThanOrEqual(5)
    expect(GOOGLE_MAX_CONCURRENCY).toBeLessThanOrEqual(10)
    expect(SCAN_PAGE_SIZE).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/trip/placeId/constants.test.ts`
Expected: FAIL — cannot resolve `./constants`.

- [ ] **Step 3: Write the constants + types**

`app/src/trip/placeId/constants.ts`:
```ts
/**
 * Tunable scoring + batch constants for the placeId backfill. Single source of
 * truth — no magic numbers live in the flow or scoreMatch. These are COPIED
 * VERBATIM into supabase/functions/place-id-admin/index.ts (keep in sync).
 */
/** How many candidates are frozen per review row. */
export const MAX_REVIEW_CANDIDATES = 3
/** Distance (m) at/under which a candidate scores a strong positive. */
export const EXACT_DISTANCE_M = 100
/** Distance (m) at/under which a candidate scores a positive; beyond → negative. */
export const NEAR_DISTANCE_M = 250
/** Score subtracted when a runner-up candidate is also close/similar (ambiguity). */
export const AMBIGUITY_PENALTY = 0.4
/** confident = score >= this. */
export const AUTO_ATTACH_THRESHOLD = 0.7
/** Max in-flight Google Text Search calls during a scan (never unbounded). */
export const GOOGLE_MAX_CONCURRENCY = 8
/** Trips read per scan page (keeps each invocation within the function budget). */
export const SCAN_PAGE_SIZE = 25
```

`app/src/trip/placeId/types.ts`:
```ts
/** A frozen Google candidate kept on a review row (Google's order, never reordered). */
export interface Candidate {
  placeId: string
  name: string
  address?: string
  lat?: number
  lng?: number
  /** Google's place types (preserved for display + future scoring). */
  types: string[]
  /** Distance (m) from the stop's coords to this candidate; undefined if either lacks coords. */
  distanceM?: number
}

/** Output of scoreMatch for the primary candidate. */
export interface MatchResult {
  score: number
  confident: boolean
  distanceM?: number
}

/** Where a review row points (re-location key). */
export interface ReviewStopRef {
  dayIndex: number
  stopIndex: number
  stopName: string
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/trip/placeId/constants.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/placeId/constants.ts app/src/trip/placeId/types.ts app/src/trip/placeId/constants.test.ts
git commit -m "feat(placeId): backfill constants + shared types"
```

---

## Task 2: parseTextSearch — Google response → candidates

**Files:**
- Create: `app/src/trip/placeId/parseTextSearch.ts`
- Test: `app/src/trip/placeId/parseTextSearch.test.ts`

The Text Search request uses field mask `places.id,places.displayName,places.formattedAddress,places.location,places.types` (set in the edge function). This parser is pure and never throws.

- [ ] **Step 1: Write the failing test**

`app/src/trip/placeId/parseTextSearch.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseTextSearch } from './parseTextSearch'

const place = (over: Record<string, unknown> = {}) => ({
  id: 'ChIJyWEHuEmuEmsRm9hTkapTCrk',
  displayName: { text: 'Gateway Arch' },
  formattedAddress: 'St. Louis, MO 63102, USA',
  location: { latitude: 38.6247, longitude: -90.1848 },
  types: ['tourist_attraction', 'park'],
  ...over,
})

describe('parseTextSearch', () => {
  it('maps places to candidates, preserving Google order + types', () => {
    const out = parseTextSearch({ places: [place(), place({ id: 'p2', displayName: { text: 'B' } })] })
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      placeId: 'ChIJyWEHuEmuEmsRm9hTkapTCrk',
      name: 'Gateway Arch',
      address: 'St. Louis, MO 63102, USA',
      lat: 38.6247, lng: -90.1848,
      types: ['tourist_attraction', 'park'],
    })
    expect(out[1].placeId).toBe('p2') // order preserved
  })

  it('caps to MAX_REVIEW_CANDIDATES', () => {
    const many = Array.from({ length: 7 }, (_, i) => place({ id: `p${i}` }))
    expect(parseTextSearch({ places: many })).toHaveLength(3)
  })

  it('drops entries with no id or no name', () => {
    const out = parseTextSearch({ places: [place({ id: '' }), place({ displayName: {} }), place({ id: 'ok' })] })
    expect(out.map(c => c.placeId)).toEqual(['ok'])
  })

  it('tolerates missing location/address/types', () => {
    const out = parseTextSearch({ places: [{ id: 'x', displayName: { text: 'X' } }] })
    expect(out[0]).toMatchObject({ placeId: 'x', name: 'X', types: [] })
    expect(out[0].lat).toBeUndefined()
    expect(out[0].address).toBeUndefined()
  })

  it('returns [] on garbage', () => {
    expect(parseTextSearch(null)).toEqual([])
    expect(parseTextSearch('nope')).toEqual([])
    expect(parseTextSearch({})).toEqual([])
    expect(parseTextSearch({ places: 'x' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/trip/placeId/parseTextSearch.test.ts`
Expected: FAIL — cannot resolve `./parseTextSearch`.

- [ ] **Step 3: Write the implementation**

`app/src/trip/placeId/parseTextSearch.ts`:
```ts
import { MAX_REVIEW_CANDIDATES } from './constants'
import type { Candidate } from './types'

const finite = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) ? n : undefined
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/**
 * Parse a Google Places (New) `places:searchText` response into Candidate[],
 * in Google's returned order, capped to MAX_REVIEW_CANDIDATES. Pure; never throws.
 * `distanceM` is added later by scoreMatch (needs the stop coords).
 */
export function parseTextSearch(json: unknown): Candidate[] {
  if (typeof json !== 'object' || json === null) return []
  const places = (json as { places?: unknown }).places
  if (!Array.isArray(places)) return []
  const out: Candidate[] = []
  for (const p of places) {
    if (typeof p !== 'object' || p === null) continue
    const o = p as Record<string, unknown>
    const placeId = str(o.id)
    const name = str((o.displayName as { text?: unknown })?.text)
    if (!placeId || !name) continue
    const loc = o.location as { latitude?: unknown; longitude?: unknown } | undefined
    const address = str(o.formattedAddress)
    out.push({
      placeId,
      name,
      ...(address ? { address } : {}),
      lat: finite(loc?.latitude),
      lng: finite(loc?.longitude),
      types: strArr(o.types),
    })
    if (out.length >= MAX_REVIEW_CANDIDATES) break
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/trip/placeId/parseTextSearch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/placeId/parseTextSearch.ts app/src/trip/placeId/parseTextSearch.test.ts
git commit -m "feat(placeId): parse Text Search response into candidates"
```

---

## Task 3: Haversine distance helper

**Files:**
- Create: `app/src/trip/placeId/geo.ts`
- Test: `app/src/trip/placeId/geo.test.ts`

- [ ] **Step 1: Write the failing test**

`app/src/trip/placeId/geo.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { distanceMeters } from './geo'

describe('distanceMeters', () => {
  it('is ~0 for identical points', () => {
    expect(distanceMeters({ lat: 38.6, lng: -90.18 }, { lat: 38.6, lng: -90.18 })).toBeLessThan(1)
  })

  it('matches a known short distance (~111m per 0.001° lat)', () => {
    const d = distanceMeters({ lat: 38.600, lng: -90.180 }, { lat: 38.601, lng: -90.180 })
    expect(d).toBeGreaterThan(105)
    expect(d).toBeLessThan(118)
  })

  it('matches a known longer distance (Arch ↔ Union Station ~2.5km)', () => {
    const d = distanceMeters({ lat: 38.6247, lng: -90.1848 }, { lat: 38.6270, lng: -90.2070 })
    expect(d).toBeGreaterThan(1800)
    expect(d).toBeLessThan(2200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/trip/placeId/geo.test.ts`
Expected: FAIL — cannot resolve `./geo`.

- [ ] **Step 3: Write the implementation**

`app/src/trip/placeId/geo.ts`:
```ts
/** A lat/lng pair. */
export interface LatLng { lat: number; lng: number }

const R = 6_371_000 // Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180

/** Great-circle distance in metres between two points (haversine). Pure. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/trip/placeId/geo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/placeId/geo.ts app/src/trip/placeId/geo.test.ts
git commit -m "feat(placeId): haversine distance helper"
```

---

## Task 4: Name normalization + similarity

**Files:**
- Create: `app/src/trip/placeId/name.ts`
- Test: `app/src/trip/placeId/name.test.ts`

`nameSimilarity` returns a three-level verdict the scorer maps to weights: `'exact'` (normalized equal), `'close'` (one contains the other, OR token-Jaccard ≥ 0.5), else `'none'`.

- [ ] **Step 1: Write the failing test**

`app/src/trip/placeId/name.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { normalizeName, nameSimilarity } from './name'

describe('normalizeName', () => {
  it('lowercases, strips punctuation + accents, collapses spaces', () => {
    expect(normalizeName('  The Café  de  Flore! ')).toBe('the cafe de flore')
    expect(normalizeName('St. Louis')).toBe('st louis')
  })
})

describe('nameSimilarity', () => {
  it('exact on normalized equality', () => {
    expect(nameSimilarity('Gateway Arch', 'gateway arch')).toBe('exact')
    expect(nameSimilarity('The Bean', 'the   bean')).toBe('exact')
  })
  it('close when one contains the other', () => {
    expect(nameSimilarity('Arch', 'Gateway Arch National Park')).toBe('close')
    expect(nameSimilarity('Louvre', 'Louvre Museum')).toBe('close')
  })
  it('close on high token overlap', () => {
    expect(nameSimilarity('Eiffel Tower Paris', 'Eiffel Tower')).toBe('close')
  })
  it('none when unrelated', () => {
    expect(nameSimilarity('Colosseum', 'Gateway Arch')).toBe('none')
    expect(nameSimilarity('', 'Anything')).toBe('none')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/trip/placeId/name.test.ts`
Expected: FAIL — cannot resolve `./name`.

- [ ] **Step 3: Write the implementation**

`app/src/trip/placeId/name.ts`:
```ts
/**
 * Normalize a place name for comparison: strip accents, lowercase, drop
 * punctuation, collapse whitespace. Pure.
 */
export function normalizeName(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const tokens = (s: string): string[] => normalizeName(s).split(' ').filter(Boolean)

/** Three-level name match verdict between a stop name and a candidate name. Pure. */
export function nameSimilarity(a: string, b: string): 'exact' | 'close' | 'none' {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 'none'
  if (na === nb) return 'exact'
  if (na.includes(nb) || nb.includes(na)) return 'close'
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (ta.size === 0 || tb.size === 0) return 'none'
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const jaccard = inter / (ta.size + tb.size - inter)
  return jaccard >= 0.5 ? 'close' : 'none'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/trip/placeId/name.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/placeId/name.ts app/src/trip/placeId/name.test.ts
git commit -m "feat(placeId): name normalization + similarity"
```

---

## Task 5: scoreMatch — the scored confidence model

**Files:**
- Create: `app/src/trip/placeId/scoreMatch.ts`
- Test: `app/src/trip/placeId/scoreMatch.test.ts`

Scoring (all weights illustrative + tunable, but pinned here):
- name `exact` → +0.6, `close` → +0.35, `none` → 0
- distance (stop+candidate both have coords): ≤`EXACT_DISTANCE_M` → +0.4, ≤`NEAR_DISTANCE_M` → +0.2, else → −0.3
- stop has **no coords** → −0.15 (can't verify location → favors review)
- ambiguity: any runner-up (`candidates[1..]`) that is `close`/`exact` by name **or** within `NEAR_DISTANCE_M` of the stop → −`AMBIGUITY_PENALTY`
- `confident = score >= AUTO_ATTACH_THRESHOLD`
- `distanceM` = primary candidate's distance, when computable.

- [ ] **Step 1: Write the failing test**

`app/src/trip/placeId/scoreMatch.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { scoreMatch } from './scoreMatch'
import type { Candidate } from './types'
import { AUTO_ATTACH_THRESHOLD } from './constants'

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  placeId: 'p1', name: 'Gateway Arch', lat: 38.6247, lng: -90.1848, types: ['park'], ...over,
})
const stop = { name: 'Gateway Arch', lat: 38.6247, lng: -90.1848 }

describe('scoreMatch', () => {
  it('returns not-confident on empty candidates', () => {
    expect(scoreMatch(stop, [])).toMatchObject({ confident: false })
  })

  it('confident: exact name + within EXACT_DISTANCE_M', () => {
    const r = scoreMatch(stop, [cand()])
    expect(r.confident).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(AUTO_ATTACH_THRESHOLD)
    expect(r.distanceM).toBeLessThan(5)
  })

  it('reviews coordless stops even on exact name (−coords penalty)', () => {
    const r = scoreMatch({ name: 'Gateway Arch' }, [cand()])
    expect(r.confident).toBe(false)
    expect(r.distanceM).toBeUndefined()
  })

  it('reviews when a near runner-up makes it ambiguous', () => {
    const runnerUp = cand({ placeId: 'p2', name: 'Gateway Arch', lat: 38.6249, lng: -90.1850 })
    const r = scoreMatch(stop, [cand(), runnerUp])
    expect(r.confident).toBe(false) // ambiguity penalty drops it below threshold
  })

  it('reviews a far candidate (distance negative)', () => {
    const far = cand({ lat: 40.0, lng: -90.0 }) // ~270km away
    const r = scoreMatch(stop, [far])
    expect(r.confident).toBe(false)
  })

  it('a far, differently-named runner-up does NOT trigger ambiguity', () => {
    const other = cand({ placeId: 'p2', name: 'Union Station', lat: 40.0, lng: -90.0 })
    const r = scoreMatch(stop, [cand(), other])
    expect(r.confident).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/trip/placeId/scoreMatch.test.ts`
Expected: FAIL — cannot resolve `./scoreMatch`.

- [ ] **Step 3: Write the implementation**

`app/src/trip/placeId/scoreMatch.ts`:
```ts
import { distanceMeters } from './geo'
import { nameSimilarity } from './name'
import { EXACT_DISTANCE_M, NEAR_DISTANCE_M, AMBIGUITY_PENALTY, AUTO_ATTACH_THRESHOLD } from './constants'
import type { Candidate, MatchResult } from './types'

interface StopLike { name: string; lat?: number; lng?: number; coords?: { lat: number; lng: number } }

const coordsOf = (s: StopLike): { lat: number; lng: number } | undefined => {
  const lat = s.lat ?? s.coords?.lat
  const lng = s.lng ?? s.coords?.lng
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng } : undefined
}

const distOf = (
  stopCoords: { lat: number; lng: number } | undefined, c: Candidate,
): number | undefined =>
  stopCoords && typeof c.lat === 'number' && typeof c.lng === 'number'
    ? distanceMeters(stopCoords, { lat: c.lat, lng: c.lng }) : undefined

function nameScore(stopName: string, c: Candidate): number {
  switch (nameSimilarity(stopName, c.name)) {
    case 'exact': return 0.6
    case 'close': return 0.35
    default: return 0
  }
}

function distanceScore(d: number | undefined): number {
  if (d === undefined) return 0
  if (d <= EXACT_DISTANCE_M) return 0.4
  if (d <= NEAR_DISTANCE_M) return 0.2
  return -0.3
}

/**
 * Score the PRIMARY candidate (candidates[0]) against the stop, penalising an
 * ambiguous runner-up. All confidence logic lives here. Pure + unit-tested.
 * confident = score >= AUTO_ATTACH_THRESHOLD. candidates stay in Google's order.
 */
export function scoreMatch(stop: StopLike, candidates: Candidate[]): MatchResult {
  if (candidates.length === 0) return { score: 0, confident: false }
  const sc = coordsOf(stop)
  const primary = candidates[0]
  const distanceM = distOf(sc, primary)

  let score = nameScore(stop.name, primary) + distanceScore(distanceM)
  if (!sc) score -= 0.15 // coordless stop can't be location-verified → favor review

  // Ambiguity: a runner-up that is also name-similar OR within NEAR_DISTANCE_M.
  const ambiguous = candidates.slice(1).some((c) => {
    const sim = nameSimilarity(stop.name, c.name)
    if (sim === 'exact' || sim === 'close') return true
    const d = distOf(sc, c)
    return d !== undefined && d <= NEAR_DISTANCE_M
  })
  if (ambiguous) score -= AMBIGUITY_PENALTY

  return {
    score,
    confident: score >= AUTO_ATTACH_THRESHOLD,
    ...(distanceM !== undefined ? { distanceM: Math.round(distanceM) } : {}),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/trip/placeId/scoreMatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/placeId/scoreMatch.ts app/src/trip/placeId/scoreMatch.test.ts
git commit -m "feat(placeId): scored confidence model (scoreMatch)"
```

---

## Task 6: locateStop — re-locate a placeId-less stop by name

**Files:**
- Create: `app/src/trip/placeId/locateStop.ts`
- Test: `app/src/trip/placeId/locateStop.test.ts`

Guards reorders between scan and review: prefer the exact `(dayIndex, stopIndex)` if its `name` matches **and** it's still placeId-less; else search that day, then the whole trip, for a placeId-less stop with that exact name; else `null` (→ row goes `stale`).

- [ ] **Step 1: Write the failing test**

`app/src/trip/placeId/locateStop.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { locateStop } from './locateStop'
import type { Trip } from '../../types'

const trip = (days: { name: string; placeId?: string }[][]): Trip => ({
  id: 't', owner_id: null, title: 'T', subtitle: null, config: {},
  data: { days: days.map(stops => ({ title: '', stops })), completed: [] },
}) as Trip

describe('locateStop', () => {
  it('matches at the exact index when name matches + still untagged', () => {
    const t = trip([[{ name: 'A' }, { name: 'Arch' }]])
    expect(locateStop(t, 0, 1, 'Arch')).toEqual({ dayIndex: 0, stopIndex: 1 })
  })

  it('finds by name within the day after a shift', () => {
    const t = trip([[{ name: 'Arch' }, { name: 'A' }]]) // Arch moved to index 0
    expect(locateStop(t, 0, 1, 'Arch')).toEqual({ dayIndex: 0, stopIndex: 0 })
  })

  it('finds by name across the trip when the day changed', () => {
    const t = trip([[{ name: 'A' }], [{ name: 'B' }, { name: 'Arch' }]])
    expect(locateStop(t, 0, 0, 'Arch')).toEqual({ dayIndex: 1, stopIndex: 1 })
  })

  it('skips a same-name stop that is already tagged', () => {
    const t = trip([[{ name: 'Arch', placeId: 'p1' }, { name: 'Arch' }]])
    expect(locateStop(t, 0, 0, 'Arch')).toEqual({ dayIndex: 0, stopIndex: 1 })
  })

  it('returns null when the stop is gone', () => {
    const t = trip([[{ name: 'A' }]])
    expect(locateStop(t, 0, 5, 'Arch')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/trip/placeId/locateStop.test.ts`
Expected: FAIL — cannot resolve `./locateStop`.

- [ ] **Step 3: Write the implementation**

`app/src/trip/placeId/locateStop.ts`:
```ts
import type { Trip } from '../../types'

/**
 * Re-locate the placeId-less stop a review row points at. Prefers the exact
 * (dayIndex, stopIndex) when its name still matches and it's untagged; else
 * searches that day, then the whole trip, for an UNTAGGED stop with that exact
 * name. Returns null if none found (→ the row is marked stale). Pure.
 */
export function locateStop(
  trip: Trip, dayIndex: number, stopIndex: number, stopName: string,
): { dayIndex: number; stopIndex: number } | null {
  const days = trip.data?.days ?? []
  const untagged = (name: string, placeId?: string) => name === stopName && !placeId

  const atIndex = days[dayIndex]?.stops?.[stopIndex]
  if (atIndex && untagged(atIndex.name, atIndex.placeId)) return { dayIndex, stopIndex }

  const sameDay = days[dayIndex]?.stops ?? []
  for (let s = 0; s < sameDay.length; s++) {
    if (untagged(sameDay[s].name, sameDay[s].placeId)) return { dayIndex, stopIndex: s }
  }
  for (let d = 0; d < days.length; d++) {
    const stops = days[d].stops ?? []
    for (let s = 0; s < stops.length; s++) {
      if (untagged(stops[s].name, stops[s].placeId)) return { dayIndex: d, stopIndex: s }
    }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/trip/placeId/locateStop.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/placeId/locateStop.ts app/src/trip/placeId/locateStop.test.ts
git commit -m "feat(placeId): re-locate a placeId-less stop by name"
```

---

## Task 7: Extend the Stop type (additive fields)

**Files:**
- Modify: `app/src/types.ts:55-58`

- [ ] **Step 1: Apply the type change**

In `app/src/types.ts`, replace the existing place-identity block:
```ts
  placeId?: string
  placeSource?: 'google'
  placeName?: string
  placeTypes?: string[]
```
with:
```ts
  placeId?: string
  /** 'google' = tagged to a Google place; 'none' = confirmed not a Google place (scan-skipped, founder-resettable). */
  placeSource?: 'google' | 'none'
  placeName?: string
  placeTypes?: string[]
  /** Backfill match metadata — informational only, no runtime effect. */
  placeMatchedAt?: string
  placeMatchMethod?: 'auto' | 'founder'
  placeMatchDistanceM?: number
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc -b`
Expected: clean (no errors). The `'none'` widening and added optional fields are additive.

- [ ] **Step 3: Commit**

```bash
git add app/src/types.ts
git commit -m "feat(placeId): additive Stop fields (placeSource 'none', match metadata)"
```

---

## Task 8: SQL — placeid_review table + trips.updated_at trigger

**Files:**
- Create: `supabase/sql/placeid_review.sql`

This file is run by the operator in the Supabase SQL editor (ref `wnpanbjzmcsvhfyjdczv`). It is idempotent (`if not exists` / `create or replace`).

- [ ] **Step 1: Write the SQL**

`supabase/sql/placeid_review.sql`:
```sql
-- PlaceId backfill review queue. Service-role only; the place-id-admin edge
-- function is the sole reader/writer. Run in the Supabase SQL editor.
-- Rows are NEVER deleted — resolved/skipped/stale form a permanent audit trail.

create table if not exists public.placeid_review (
  id                bigint generated always as identity primary key,
  trip_id           text        not null,
  owner_id          text,
  day_index         int         not null,
  stop_index        int         not null,
  stop_name         text        not null,
  stop_lat          double precision,
  stop_lng          double precision,
  score             double precision,
  candidates        jsonb       not null default '[]'::jsonb,  -- frozen top ≤3 {placeId,name,address,lat,lng,types,distanceM}
  status            text        not null default 'pending'
                      check (status in ('pending','resolved','skipped','stale')),
  resolved_place_id text,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);

-- Deterministic review ordering (score DESC, created_at ASC, id ASC) + status filter.
create index if not exists placeid_review_queue_idx
  on public.placeid_review (status, score desc, created_at, id);

-- At most ONE pending row per stop. Historical (resolved/skipped/stale) rows are
-- intentionally preserved and NOT treated as duplicates.
create unique index if not exists placeid_review_one_pending
  on public.placeid_review (trip_id, day_index, stop_index) where status = 'pending';

-- Lock to the service role: enable RLS with NO client policies.
alter table public.placeid_review enable row level security;

-- Optimistic-concurrency token: ensure trips.updated_at auto-bumps on every
-- UPDATE so the backfill's conditional writes can detect a concurrent user edit.
-- (Supabase ships the moddatetime extension.)
create extension if not exists moddatetime schema extensions;
drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function extensions.moddatetime(updated_at);
```

- [ ] **Step 2: Self-check the SQL (no DB run here)**

Read it back: table has `candidates` default `'[]'`, the partial unique index is `WHERE status='pending'`, RLS is enabled with no policies, and the `trips` trigger uses `moddatetime`. No syntax placeholders.

- [ ] **Step 3: Commit**

```bash
git add supabase/sql/placeid_review.sql
git commit -m "feat(placeId): placeid_review SQL (table, indexes, RLS, trips updated_at trigger)"
```

> **Operator note (not a code step):** This SQL must be run in the Supabase editor before the function works. If a `trips` `updated_at` trigger already exists under another name, the `drop trigger if exists trips_set_updated_at` is a no-op and the `create` adds a second harmless one — verify there isn't a conflicting one first.

---

## Task 9: The place-id-admin edge function

**Files:**
- Create: `supabase/functions/place-id-admin/index.ts`

**Context for the implementer:** Deno is NOT installed locally; this function cannot run in vitest. It is verified by **live probes** (Task 9 Step 3) after the operator deploys it. It must **copy the pure helpers verbatim** from `app/src/trip/placeId/` (`constants`, `parseTextSearch`, `geo.distanceMeters`, `name`, `scoreMatch`, `locateStop`) — Deno has no access to the app's module graph. Mirror the established patterns in `supabase/functions/enrich-place/index.ts`: `CORS`/`json` helpers, `sh()` service-role headers, founder gate via `/auth/v1/user` → `profiles.role`, and the Text Search call shape from `supabase/functions/place-photo/index.ts` (`places:searchText`, `X-Goog-FieldMask`). Never 5xx — always return benign JSON.

- [ ] **Step 1: Write the function**

`supabase/functions/place-id-admin/index.ts`:
```ts
// supabase/functions/place-id-admin/index.ts
//
// Founder-gated placeId backfill admin. Service-role authority over `trips`
// (cross-user) + `placeid_review`. Resolves placeId-less stops to Google places
// via Text Search; auto-attaches confident matches; queues the rest for founder
// review. All trip writes are optimistically guarded on trips.updated_at.
// Never 5xx — returns benign JSON.
//
// COPIED PURE HELPERS (sync verbatim with app/src/trip/placeId/):
//   constants.ts, parseTextSearch.ts, geo.ts, name.ts, scoreMatch.ts, locateStop.ts

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')
const TRIPS = `${SUPABASE_URL}/rest/v1/trips`
const REVIEW = `${SUPABASE_URL}/rest/v1/placeid_review`

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const sh = (extra: Record<string, string> = {}) => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra })

// ── BEGIN copied pure helpers (verbatim from app/src/trip/placeId/) ───────────
const MAX_REVIEW_CANDIDATES = 3
const EXACT_DISTANCE_M = 100
const NEAR_DISTANCE_M = 250
const AMBIGUITY_PENALTY = 0.4
const AUTO_ATTACH_THRESHOLD = 0.7
const GOOGLE_MAX_CONCURRENCY = 8
const SCAN_PAGE_SIZE = 25

interface Candidate { placeId: string; name: string; address?: string; lat?: number; lng?: number; types: string[]; distanceM?: number }
interface MatchResult { score: number; confident: boolean; distanceM?: number }

const _finite = (n: unknown): number | undefined => typeof n === 'number' && Number.isFinite(n) ? n : undefined
const _str = (v: unknown): string => typeof v === 'string' ? v.trim() : ''
const _strArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

function parseTextSearch(j: unknown): Candidate[] {
  if (typeof j !== 'object' || j === null) return []
  const places = (j as { places?: unknown }).places
  if (!Array.isArray(places)) return []
  const out: Candidate[] = []
  for (const p of places) {
    if (typeof p !== 'object' || p === null) continue
    const o = p as Record<string, unknown>
    const placeId = _str(o.id)
    const name = _str((o.displayName as { text?: unknown })?.text)
    if (!placeId || !name) continue
    const loc = o.location as { latitude?: unknown; longitude?: unknown } | undefined
    const address = _str(o.formattedAddress)
    out.push({ placeId, name, ...(address ? { address } : {}), lat: _finite(loc?.latitude), lng: _finite(loc?.longitude), types: _strArr(o.types) })
    if (out.length >= MAX_REVIEW_CANDIDATES) break
  }
  return out
}

const _R = 6_371_000, _rad = (d: number) => (d * Math.PI) / 180
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = _rad(b.lat - a.lat), dLng = _rad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(_rad(a.lat)) * Math.cos(_rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * _R * Math.asin(Math.min(1, Math.sqrt(s)))
}

function normalizeName(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}
const _tokens = (s: string): string[] => normalizeName(s).split(' ').filter(Boolean)
function nameSimilarity(a: string, b: string): 'exact' | 'close' | 'none' {
  const na = normalizeName(a), nb = normalizeName(b)
  if (!na || !nb) return 'none'
  if (na === nb) return 'exact'
  if (na.includes(nb) || nb.includes(na)) return 'close'
  const ta = new Set(_tokens(a)), tb = new Set(_tokens(b))
  if (ta.size === 0 || tb.size === 0) return 'none'
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter) >= 0.5 ? 'close' : 'none'
}

interface StopLike { name: string; lat?: number; lng?: number; coords?: { lat: number; lng: number } }
const _coordsOf = (s: StopLike) => {
  const lat = s.lat ?? s.coords?.lat, lng = s.lng ?? s.coords?.lng
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined
}
const _distOf = (sc: { lat: number; lng: number } | undefined, c: Candidate) =>
  sc && typeof c.lat === 'number' && typeof c.lng === 'number' ? distanceMeters(sc, { lat: c.lat, lng: c.lng }) : undefined
function _nameScore(n: string, c: Candidate): number { const v = nameSimilarity(n, c.name); return v === 'exact' ? 0.6 : v === 'close' ? 0.35 : 0 }
function _distScore(d: number | undefined): number { if (d === undefined) return 0; if (d <= EXACT_DISTANCE_M) return 0.4; if (d <= NEAR_DISTANCE_M) return 0.2; return -0.3 }
function scoreMatch(stop: StopLike, candidates: Candidate[]): MatchResult {
  if (candidates.length === 0) return { score: 0, confident: false }
  const sc = _coordsOf(stop), primary = candidates[0], distanceM = _distOf(sc, primary)
  let score = _nameScore(stop.name, primary) + _distScore(distanceM)
  if (!sc) score -= 0.15
  const ambiguous = candidates.slice(1).some((c) => {
    const sim = nameSimilarity(stop.name, c.name); if (sim === 'exact' || sim === 'close') return true
    const d = _distOf(sc, c); return d !== undefined && d <= NEAR_DISTANCE_M
  })
  if (ambiguous) score -= AMBIGUITY_PENALTY
  return { score, confident: score >= AUTO_ATTACH_THRESHOLD, ...(distanceM !== undefined ? { distanceM: Math.round(distanceM) } : {}) }
}

interface TripLike { id: string; data?: { days?: Array<{ stops?: Array<{ name: string; placeId?: string; placeSource?: string }> }> } }
function locateStop(trip: TripLike, dayIndex: number, stopIndex: number, stopName: string): { dayIndex: number; stopIndex: number } | null {
  const days = trip.data?.days ?? []
  const untagged = (name: string, placeId?: string) => name === stopName && !placeId
  const atIndex = days[dayIndex]?.stops?.[stopIndex]
  if (atIndex && untagged(atIndex.name, atIndex.placeId)) return { dayIndex, stopIndex }
  const sameDay = days[dayIndex]?.stops ?? []
  for (let s = 0; s < sameDay.length; s++) if (untagged(sameDay[s].name, sameDay[s].placeId)) return { dayIndex, stopIndex: s }
  for (let d = 0; d < days.length; d++) { const stops = days[d].stops ?? []; for (let s = 0; s < stops.length; s++) if (untagged(stops[s].name, stops[s].placeId)) return { dayIndex: d, stopIndex: s } }
  return null
}
// ── END copied pure helpers ───────────────────────────────────────────────────

/** Founder gate: resolve caller → profiles.role==='founder'. Returns uid or null. */
async function founderUid(userAuth: string): Promise<string | null> {
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: userAuth, apikey: SERVICE_KEY } }).then(r => r.ok ? r.json() : null).catch(() => null)
  const uid = who?.id
  if (!uid) return null
  const prof = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}&select=role`, { headers: sh() }).then(r => r.ok ? r.json() : []).catch(() => [])
  return prof?.[0]?.role === 'founder' ? uid : null
}

/** Google Text Search for a stop. Returns parsed candidates, or 'error' on a transient failure. */
async function textSearch(query: string): Promise<Candidate[] | 'error'> {
  if (!GOOGLE_PLACES_API_KEY) return 'error'
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types' },
      body: JSON.stringify({ textQuery: query, maxResultCount: MAX_REVIEW_CANDIDATES }),
    })
    if (!r.ok) return 'error'
    return parseTextSearch(await r.json())
  } catch { return 'error' }
}

/** Annotate candidates with distanceM from the stop (for display/freeze). */
function withDistance(stop: StopLike, candidates: Candidate[]): Candidate[] {
  const sc = _coordsOf(stop)
  return candidates.map((c) => { const d = _distOf(sc, c); return d !== undefined ? { ...c, distanceM: Math.round(d) } : c })
}

/** A small bounded concurrency runner (never unbounded Promise.all). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]) }
  })
  await Promise.all(workers)
  return out
}

const stopQuery = (stop: { name: string; lat?: number; lng?: number; coords?: { lat: number; lng: number } }, city: string): string => {
  const c = _coordsOf(stop)
  return c ? stop.name : [stop.name, city].filter(Boolean).join(', ')
}

/** Optimistic write: PATCH trips.data only if updated_at is unchanged. Returns true if it landed. */
async function writeTrip(id: string, prevUpdatedAt: string | undefined, data: unknown): Promise<boolean> {
  const filter = prevUpdatedAt
    ? `id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(prevUpdatedAt)}`
    : `id=eq.${encodeURIComponent(id)}`
  const r = await fetch(`${TRIPS}?${filter}`, { method: 'PATCH', headers: sh({ Prefer: 'return=representation' }), body: JSON.stringify({ data, updated_at: new Date().toISOString() }) })
  if (!r.ok) return false
  const rows = await r.json().catch(() => [])
  return Array.isArray(rows) && rows.length > 0 // 0 rows = updated_at moved under us
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })
  const userAuth = req.headers.get('Authorization') ?? ''
  let p: { action?: string; cursor?: string; reviewId?: number; placeId?: string; tripId?: string; dayIndex?: number; stopIndex?: number }
  try { p = await req.json() } catch { return json({ error: 'bad_request' }, 400) }

  const uid = await founderUid(userAuth)
  if (!uid) return json({ error: 'forbidden' }, 403)

  try {
    // ── metrics: informational counts, no Google calls. PostgREST HEAD count. ──
    if (p.action === 'metrics') {
      const count = async (path: string): Promise<number> => {
        const r = await fetch(path, { headers: sh({ Prefer: 'count=exact', Range: '0-0' }) })
        const cr = r.headers.get('content-range') ?? '*/0' // "0-0/123"
        return parseInt(cr.split('/')[1] || '0', 10) || 0
      }
      const pending_review = await count(`${REVIEW}?status=eq.pending&select=id`)
      // total_untagged / marked_none / already_tagged require scanning data JSONB;
      // approximate via the review queue + a sampling note — exact counts are not
      // required (spec: informational only). Return what PostgREST can count cheaply.
      return json({ pending_review })
    }

    // ── scan: one page of trips, resolve + auto-attach or queue. ──
    if (p.action === 'scan') {
      const cursor = p.cursor ?? ''
      const filter = cursor ? `id=gt.${encodeURIComponent(cursor)}&` : ''
      const tr = await fetch(`${TRIPS}?${filter}select=id,owner_id,updated_at,config,data&order=id&limit=${SCAN_PAGE_SIZE}`, { headers: sh() })
      const trips = tr.ok ? await tr.json() : []
      const stats = { processed: 0, tagged: 0, queued: 0, skipped_existing: 0, google_requests: 0, google_failures: 0 }
      let lastId = cursor

      for (const trip of trips) {
        lastId = trip.id
        const city = String((trip.config?.destination ?? '') || '') // trips.config column, selected above
        const days: Array<{ stops?: Array<Record<string, unknown>> }> = trip.data?.days ?? []

        // Collect the stops to resolve this trip (skip tagged / 'none' / already-pending).
        const targets: Array<{ dayIndex: number; stopIndex: number; stop: any }> = []
        for (let d = 0; d < days.length; d++) {
          const stops = days[d].stops ?? []
          for (let s = 0; s < stops.length; s++) {
            const st = stops[s] as any
            if (st.placeId || st.placeSource === 'none') { stats.skipped_existing++; continue }
            targets.push({ dayIndex: d, stopIndex: s, stop: st })
          }
        }
        if (targets.length === 0) continue

        // Existing pending rows for this trip → don't re-queue.
        const pr = await fetch(`${REVIEW}?trip_id=eq.${encodeURIComponent(trip.id)}&status=eq.pending&select=day_index,stop_index`, { headers: sh() })
        const pendingSet = new Set((pr.ok ? await pr.json() : []).map((r: any) => `${r.day_index}-${r.stop_index}`))
        const toResolve = targets.filter(t => !pendingSet.has(`${t.dayIndex}-${t.stopIndex}`))

        // Bounded-concurrency Google Text Search.
        const resolved = await mapLimit(toResolve, GOOGLE_MAX_CONCURRENCY, async (t) => {
          const res = await textSearch(stopQuery(t.stop, city))
          stats.google_requests++
          if (res === 'error') { stats.google_failures++; return { t, candidates: null as Candidate[] | null } }
          return { t, candidates: withDistance(t.stop, res) }
        })

        // Apply: build the auto-attach patch + the review inserts.
        let data = trip.data
        let mutated = false
        let tripTagged = 0 // counted only into stats AFTER the optimistic write lands
        const reviewRows: Record<string, unknown>[] = []
        for (const { t, candidates } of resolved) {
          if (candidates === null) continue // transient error → leave untouched, retried next run
          stats.processed++
          const match = scoreMatch(t.stop, candidates)
          if (match.confident && candidates[0]) {
            // Clone-on-first-write to attach identity immutably.
            if (!mutated) { data = JSON.parse(JSON.stringify(trip.data)); mutated = true }
            const st = data.days[t.dayIndex].stops[t.stopIndex]
            st.placeId = candidates[0].placeId
            st.placeName = candidates[0].name
            st.placeTypes = candidates[0].types
            st.placeSource = 'google'
            st.placeMatchedAt = new Date().toISOString()
            st.placeMatchMethod = 'auto'
            if (match.distanceM !== undefined) st.placeMatchDistanceM = match.distanceM
            tripTagged++
          } else {
            reviewRows.push({
              trip_id: trip.id, owner_id: trip.owner_id ?? null,
              day_index: t.dayIndex, stop_index: t.stopIndex, stop_name: t.stop.name,
              stop_lat: t.stop.lat ?? t.stop.coords?.lat ?? null, stop_lng: t.stop.lng ?? t.stop.coords?.lng ?? null,
              score: match.score, candidates, status: 'pending',
            })
          }
        }

        // One optimistic trip write (only if we auto-attached something).
        if (mutated) {
          const ok = await writeTrip(trip.id, trip.updated_at, data)
          if (!ok) continue // benign skip: the trip changed under us; these stops remain for the next run (don't count them, don't queue)
          stats.tagged += tripTagged // only now that the write landed
        }
        // Insert review rows (ignore 409 duplicates from the pending unique index).
        for (const row of reviewRows) {
          const ins = await fetch(REVIEW, { method: 'POST', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify(row) })
          if (ins.ok) stats.queued++ // 409 = already pending (benign, not re-counted)
        }
      }

      const remaining = trips.length === SCAN_PAGE_SIZE // a full page → there may be more
      return json({ ...stats, cursor: lastId, done: !remaining })
    }

    // ── list: pending review rows in deterministic order. ──
    if (p.action === 'list') {
      const r = await fetch(`${REVIEW}?status=eq.pending&order=score.desc,created_at.asc,id.asc&limit=100&select=*`, { headers: sh() })
      return json({ rows: r.ok ? await r.json() : [] })
    }

    // ── attach: tag the stop with a frozen candidate (optimistic). ──
    if (p.action === 'attach') {
      const rr = await fetch(`${REVIEW}?id=eq.${p.reviewId}&select=*`, { headers: sh() })
      const row = (rr.ok ? await rr.json() : [])[0]
      if (!row || row.status !== 'pending') return json({ status: 'gone' })
      const cand = (row.candidates as Candidate[]).find(c => c.placeId === p.placeId)
      if (!cand) return json({ status: 'rejected' }) // must be a frozen candidate
      const tr = await fetch(`${TRIPS}?id=eq.${encodeURIComponent(row.trip_id)}&select=id,updated_at,data`, { headers: sh() })
      const trip = (tr.ok ? await tr.json() : [])[0]
      if (!trip) { await setStatus(row.id, 'stale'); return json({ status: 'stale' }) }
      const loc = locateStop(trip, row.day_index, row.stop_index, row.stop_name)
      if (!loc) { await setStatus(row.id, 'stale'); return json({ status: 'stale' }) }
      const data = JSON.parse(JSON.stringify(trip.data))
      const st = data.days[loc.dayIndex].stops[loc.stopIndex]
      st.placeId = cand.placeId; st.placeName = cand.name; st.placeTypes = cand.types
      st.placeSource = 'google'; st.placeMatchedAt = new Date().toISOString(); st.placeMatchMethod = 'founder'
      if (cand.distanceM !== undefined) st.placeMatchDistanceM = cand.distanceM
      const ok = await writeTrip(trip.id, trip.updated_at, data)
      if (!ok) return json({ status: 'conflict' }) // trip changed; founder can retry
      await fetch(`${REVIEW}?id=eq.${row.id}`, { method: 'PATCH', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({ status: 'resolved', resolved_place_id: cand.placeId, resolved_at: new Date().toISOString() }) })
      return json({ status: 'resolved' })
    }

    // ── skip: mark the stop placeSource:'none' (optimistic). ──
    if (p.action === 'skip') {
      const rr = await fetch(`${REVIEW}?id=eq.${p.reviewId}&select=*`, { headers: sh() })
      const row = (rr.ok ? await rr.json() : [])[0]
      if (!row || row.status !== 'pending') return json({ status: 'gone' })
      const tr = await fetch(`${TRIPS}?id=eq.${encodeURIComponent(row.trip_id)}&select=id,updated_at,data`, { headers: sh() })
      const trip = (tr.ok ? await tr.json() : [])[0]
      if (!trip) { await setStatus(row.id, 'stale'); return json({ status: 'stale' }) }
      const loc = locateStop(trip, row.day_index, row.stop_index, row.stop_name)
      if (!loc) { await setStatus(row.id, 'stale'); return json({ status: 'stale' }) }
      const data = JSON.parse(JSON.stringify(trip.data))
      data.days[loc.dayIndex].stops[loc.stopIndex].placeSource = 'none'
      const ok = await writeTrip(trip.id, trip.updated_at, data)
      if (!ok) return json({ status: 'conflict' })
      await setStatus(row.id, 'skipped')
      return json({ status: 'skipped' })
    }

    // ── reset: clear placeSource:'none' so the stop re-queues next scan. ──
    if (p.action === 'reset') {
      if (!p.tripId || p.dayIndex == null || p.stopIndex == null) return json({ error: 'bad_request' }, 400)
      const tr = await fetch(`${TRIPS}?id=eq.${encodeURIComponent(p.tripId)}&select=id,updated_at,data`, { headers: sh() })
      const trip = (tr.ok ? await tr.json() : [])[0]
      if (!trip) return json({ status: 'gone' })
      const st = trip.data?.days?.[p.dayIndex]?.stops?.[p.stopIndex]
      if (!st || st.placeSource !== 'none') return json({ status: 'gone' })
      const data = JSON.parse(JSON.stringify(trip.data))
      delete data.days[p.dayIndex].stops[p.stopIndex].placeSource
      const ok = await writeTrip(trip.id, trip.updated_at, data)
      return json({ status: ok ? 'reset' : 'conflict' })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    console.error('[place-id-admin]', String(e))
    return json({ error: 'failed' }, 200)
  }

  async function setStatus(id: number, status: string) {
    await fetch(`${REVIEW}?id=eq.${id}`, { method: 'PATCH', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({ status, resolved_at: new Date().toISOString() }) })
  }
})
```

- [ ] **Step 2: Sanity-self-review the function (no local run)**

Confirm: founder gate runs before every action; the copied helpers are byte-identical to the app sources (diff each against `app/src/trip/placeId/*`); all trip writes go through `writeTrip` (optimistic); `attach` rejects a non-frozen candidate; scan skips tagged/`'none'`/pending; review inserts treat 409 as benign. No `Promise.all` over all stops (uses `mapLimit`).

- [ ] **Step 3: Commit (deploy + probe happen in Task 12 with the operator)**

```bash
git add supabase/functions/place-id-admin/index.ts
git commit -m "feat(placeId): place-id-admin edge function (founder-gated, optimistic, copies pure helpers)"
```

---

## Task 10: Client hook — usePlaceIdAdmin

**Files:**
- Create: `app/src/data/usePlaceIdAdmin.ts`

Mirrors the `callFn`/`authToken` pattern in `app/src/lib/placeSearch.ts` (Bearer session token, anon apikey), targeting the `place-id-admin` slug.

- [ ] **Step 1: Write the hook**

`app/src/data/usePlaceIdAdmin.ts`:
```ts
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '../lib/supabase'

const FN = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/place-id-admin`

async function authToken(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) return data.session.access_token } catch { /* anon */ }
  return SUPABASE_ANON_KEY
}

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await authToken()), apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`place-id-admin ${res.status}`)
  return res.json() as Promise<T>
}

export interface ReviewCandidate { placeId: string; name: string; address?: string; lat?: number; lng?: number; types: string[]; distanceM?: number }
export interface ReviewRow {
  id: number; trip_id: string; owner_id: string | null; day_index: number; stop_index: number
  stop_name: string; stop_lat: number | null; stop_lng: number | null; score: number; candidates: ReviewCandidate[]; status: string; created_at: string
}
export interface ScanStats { processed: number; tagged: number; queued: number; skipped_existing: number; google_requests: number; google_failures: number; cursor: string; done: boolean }

export const placeIdAdmin = {
  metrics: () => call<{ pending_review: number }>({ action: 'metrics' }),
  scan: (cursor?: string) => call<ScanStats>({ action: 'scan', ...(cursor ? { cursor } : {}) }),
  list: () => call<{ rows: ReviewRow[] }>({ action: 'list' }),
  attach: (reviewId: number, placeId: string) => call<{ status: string }>({ action: 'attach', reviewId, placeId }),
  skip: (reviewId: number) => call<{ status: string }>({ action: 'skip', reviewId }),
  reset: (tripId: string, dayIndex: number, stopIndex: number) => call<{ status: string }>({ action: 'reset', tripId, dayIndex, stopIndex }),
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/usePlaceIdAdmin.ts
git commit -m "feat(placeId): client hook for place-id-admin"
```

---

## Task 11: Founder review screen + route

**Files:**
- Create: `app/src/routes/PlaceIdAdmin.tsx`
- Modify: `app/src/trip/lazyRoutes.ts` (add the lazy export)
- Modify: `app/src/App.tsx` (add the route)

- [ ] **Step 1: Write the screen**

`app/src/routes/PlaceIdAdmin.tsx`:
```tsx
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../data/useAuth'
import { useProfile, isFounder } from '../data/useProfile'
import { placeIdAdmin, type ReviewRow, type ScanStats } from '../data/usePlaceIdAdmin'
import { Button } from '../components/ui/Button'

export default function PlaceIdAdmin() {
  const { user } = useAuth()
  const { data: profile } = useProfile(user?.id)
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<ScanStats | null>(null)
  const [pending, setPending] = useState<number | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)

  if (profile && !isFounder(profile)) return <Navigate to="/trips" replace />

  const loadMetrics = async () => { try { setPending((await placeIdAdmin.metrics()).pending_review) } catch { /* ignore */ } }
  const loadList = async () => { try { setRows((await placeIdAdmin.list()).rows) } catch { /* ignore */ } }

  const runBackfill = async () => {
    setRunning(true)
    const agg = { processed: 0, tagged: 0, queued: 0 }
    let cursor: string | undefined
    try {
      // Drive pagination until the function reports done.
      for (;;) {
        const s = await placeIdAdmin.scan(cursor)
        agg.processed += s.processed; agg.tagged += s.tagged; agg.queued += s.queued
        setStats({ ...s, ...agg })
        cursor = s.cursor
        if (s.done) break
      }
    } catch { /* surfaced via stats halt */ }
    setRunning(false)
    await Promise.all([loadMetrics(), loadList()])
  }

  const decide = async (fn: () => Promise<{ status: string }>, id: number) => {
    setBusyId(id)
    try { await fn() } finally { setBusyId(null); await Promise.all([loadMetrics(), loadList()]) }
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6 text-ink">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl">PlaceId Backfill</h1>
        <p className="text-muted text-sm">Tag legacy stops to Google places so they join the shared cache.</p>
      </header>

      <section className="rounded-xl border border-hair bg-raised p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Button onClick={loadMetrics} variant="ghost">Refresh metrics</Button>
          <Button onClick={runBackfill} disabled={running}>{running ? 'Running…' : 'Run backfill'}</Button>
        </div>
        {pending != null && <p className="text-sm text-muted font-mono">pending review: {pending}</p>}
        {stats && (
          <p className="text-sm text-muted font-mono">
            processed {stats.processed} · tagged {stats.tagged} · queued {stats.queued}
            {stats.google_failures ? ` · google errors ${stats.google_failures}` : ''}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg">Review queue</h2>
          <Button onClick={loadList} variant="ghost">Load</Button>
        </div>
        {rows.length === 0 && <p className="text-muted text-sm">No pending rows loaded.</p>}
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-hair bg-base p-4 space-y-2">
            <div className="text-sm">
              <span className="font-medium">{row.stop_name}</span>
              <span className="text-muted"> · score {row.score.toFixed(2)}</span>
            </div>
            <ul className="space-y-1">
              {row.candidates.map((c) => (
                <li key={c.placeId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">
                    {c.name}{c.address ? ` · ${c.address}` : ''}{c.distanceM != null ? ` · ${c.distanceM}m` : ''}
                    {c.types?.length ? ` · ${c.types.slice(0, 2).join(', ')}` : ''}
                  </span>
                  <Button variant="ghost" disabled={busyId === row.id} onClick={() => decide(() => placeIdAdmin.attach(row.id, c.placeId), row.id)}>This one</Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={busyId === row.id} onClick={() => decide(() => placeIdAdmin.skip(row.id), row.id)}>Not a place</Button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
```

> **Implementer note:** verify the real import paths before writing — `useAuth` (find the hook that exposes the signed-in `user`; `StopDetail.tsx`/`Trip.tsx` import `useProfile` and a user source — match them), `Button`'s path + `variant` prop names, and token class names. Adjust to the actual exports; do not invent props. If `useProfile` takes no arg or a different one, match its real signature.

- [ ] **Step 2: Add the lazy export**

In `app/src/trip/lazyRoutes.ts`, add (matching the existing `lazy(() => import(...))` style in that file):
```ts
export const PlaceIdAdmin = lazy(() => import('../routes/PlaceIdAdmin'))
```

- [ ] **Step 3: Wire the route**

In `app/src/App.tsx`, add `PlaceIdAdmin` to the import from `./trip/lazyRoutes`, then add this route alongside the top-level routes (e.g. after the `/trips` route):
```tsx
<Route path="/admin/place-ids" element={<PlaceIdAdmin />} />
```

- [ ] **Step 4: Typecheck + build**

Run: `cd app && npx tsc -b && npm run build`
Expected: clean typecheck; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/src/routes/PlaceIdAdmin.tsx app/src/trip/lazyRoutes.ts app/src/App.tsx
git commit -m "feat(placeId): founder review screen at /admin/place-ids"
```

---

## Task 12: Full test run + operator deploy + live probe

**Files:** none (verification).

- [ ] **Step 1: Run the full suite + typecheck**

Run: `cd app && npx tsc -b && npx vitest run`
Expected: typecheck clean; all tests pass (including the 6 new placeId test files).

- [ ] **Step 2: Operator runs SQL** (hand to the user)

In the Supabase SQL editor (ref `wnpanbjzmcsvhfyjdczv`), run `supabase/sql/placeid_review.sql`. Confirm the `placeid_review` table exists and the `trips_set_updated_at` trigger is present (`select tgname from pg_trigger where tgrelid = 'public.trips'::regclass;`).

- [ ] **Step 3: Operator deploys the function** (hand to the user)

`supabase functions deploy place-id-admin` (or via the dashboard). It reuses `GOOGLE_PLACES_API_KEY` + the service role — no new secrets.

- [ ] **Step 4: Live probe (founder gate + metrics)**

As the founder (signed-in JWT), POST `{ "action": "metrics" }` to the function — expect `{ pending_review: <n> }` and HTTP 200. POST with a non-founder / anon token — expect HTTP 403 `{ error: 'forbidden' }`.

- [ ] **Step 5: Live probe (one scan page)**

POST `{ "action": "scan" }` — expect a stats object with a `cursor` and `done` flag. Re-POST with the returned `cursor` to confirm pagination advances and is idempotent (re-running the same cursor never double-tags; `skipped_existing` rises as stops get tagged).

- [ ] **Step 6: Commit any probe-driven fixes**

If a probe reveals a shape mismatch (e.g. `trip.data.config.destination` path), fix the function, re-deploy, re-probe, then commit.

---

## Notes for the implementer

- **Keep copied helpers in sync.** Task 9 duplicates Tasks 1–6 verbatim into Deno. If you change a weight or threshold in `app/src/trip/placeId/`, change it in the function too. The plan pins identical values in both places — diff them.
- **Optimistic writes are the safety net.** Every trip mutation goes through `writeTrip(id, prevUpdatedAt, data)`; a 0-row result is a benign skip, never an error. This depends on the `trips_set_updated_at` trigger (Task 8) — without it the guard silently never triggers (still correct, just last-write-wins).
- **`metrics` is intentionally cheap.** It returns only what PostgREST can count without scanning JSONB (`pending_review`). Exact `total_untagged`/`already_tagged` would require iterating every trip's `data`; the spec marks these informational/approximate, so don't add a full scan to metrics. If the founder wants the untagged total, the scan's `skipped_existing` + `tagged` + `queued` running totals surface it during a run.
- **Never overwrite `stop.name`.** Only `placeId/placeName/placeTypes/placeSource/placeMatch*` are written. Confirm in review.
- **`reset` is API-only in v1.** The function + hook expose `reset` (clear `placeSource:'none'` → re-queue), satisfying the spec's "founder can clear 'none'." There is **no** dedicated UI control yet — there's no list of `'none'` stops to reset from in v1. A founder calls it directly (or via console) when Google later adds a place. A "marked-not-a-place" review surface is future work (spec: Out of scope).
- **`metrics` returns only `pending_review`** (the one count PostgREST gives cheaply). The spec relaxed metrics to informational/approximate, so the four-count display degrades to: `pending_review` from `metrics`, and `tagged`/`queued`/`processed` as running totals surfaced **during** a run. This is the deliberate, spec-sanctioned simplification — not a missing requirement. If an exact `total_untagged` is ever wanted, add it as a separate, clearly-labeled full-scan pass (not in this plan).
```
