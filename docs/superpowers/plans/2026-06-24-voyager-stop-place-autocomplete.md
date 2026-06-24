# Stop Place Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google-Places-backed, country-scoped as-you-type place autocomplete to AddStop, creating a normalized stop (with `placeId`) immediately and resolving its coordinates in the background, with in-trip duplicate prevention.

**Architecture:** A thin Supabase edge function (`place-search`) injects the server-side Google key and proxies the two whitelisted Places (New) endpoints; **all request-building and response-parsing is pure client code in `lib/placeSearch.ts`** (vitest-tested). A `region.ts` module resolves the trip's country + bias center. AddStop wires dedup → immediate create → background details patch (guarded by `placeId`).

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, Framer Motion, vitest (test runner: `npx vitest run`), Supabase Edge Functions (Deno), Google Places API (New).

> **Spec:** `docs/superpowers/specs/2026-06-24-voyager-stop-place-autocomplete-design.md` (reference).
>
> **Architecture deviation from spec (deliberate, for testability):** the spec put Google request-building/parsing server-side. Deno is **not installed in this environment**, so that logic would be untestable here. We moved it **client-side** (pure, vitest-tested) and made the edge function a thin key-injecting proxy to the two fixed Google URLs. Payloads are not sensitive — only the API key is — so the security goal (key stays server-side) is preserved.

---

## File Structure

**Create:**
- `app/src/trip/region.ts` — `resolveRegion(destination)` (Photon → `{lat,lng,countryCode,state}`) + `biasCenter(trip, dayIndex)`.
- `app/src/trip/region.test.ts`
- `app/src/lib/placeSearch.ts` — contract types, `buildAutocompleteBody`, `parsePredictions`, `parseDetails`, `fetchPredictions`, `fetchPlaceDetails`.
- `app/src/lib/placeSearch.test.ts`
- `app/src/data/useStopSearch.ts` — TanStack autocomplete hook (debounced upstream).
- `app/src/trip/StopSearchInput.tsx` — the typeahead UI (fork of `DestinationInput`).
- `app/src/data/useBackfillDestinationGeo.ts` — eager `destinationGeo` resolver/saver.
- `supabase/functions/place-search/index.ts` — thin proxy edge function.

**Modify:**
- `app/src/types.ts` — `Stop.{placeId,placeSource,placeName,placeTypes}`, `TripConfig.destinationGeo`.
- `app/src/lib/geocode.ts` — `canApplyPlaceDetails` guard + `patchStopByPlaceId` helper.
- `app/src/lib/geocode.test.ts` — guard tests.
- `app/src/trip/AddStop.tsx` — dedup + immediate-create + background-patch via `StopSearchInput`.
- `app/src/routes/NewTripSheet.tsx` — eager `destinationGeo` on create.
- `app/src/trip/Trip.tsx` — eager `destinationGeo` on destination edit.

---

## Task 1: Data-model types

**Files:**
- Modify: `app/src/types.ts`
- Test: `app/src/trip/stop-fields.test.ts` (existing additive-field test)

- [ ] **Step 1: Write the failing test** (append to `app/src/trip/stop-fields.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import type { Stop, TripConfig } from '../types'

describe('normalized-place fields', () => {
  it('accepts placeId/placeName/placeTypes/placeSource on a Stop', () => {
    const s: Stop = {
      name: 'Meet Sarah Here', // editable title differs from canonical
      placeId: 'ChIJxxxx',
      placeSource: 'google',
      placeName: 'Gateway Arch',
      placeTypes: ['tourist_attraction', 'point_of_interest'],
    }
    expect(s.placeId).toBe('ChIJxxxx')
    expect(s.placeName).toBe('Gateway Arch')
    expect(s.placeTypes).toContain('tourist_attraction')
  })
  it('accepts destinationGeo on TripConfig', () => {
    const c: TripConfig = { destinationGeo: { lat: 38.62, lng: -90.19, countryCode: 'us', state: 'Missouri' } }
    expect(c.destinationGeo?.countryCode).toBe('us')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/trip/stop-fields.test.ts`
Expected: FAIL — TS errors "Object literal may only specify known properties" for `placeId`/`destinationGeo`.

- [ ] **Step 3: Add the fields** — in `app/src/types.ts`, inside `interface Stop` after the `wikiTitle?: string` line:

```ts
  /**
   * Canonical normalized-place identity from a place-search provider (Google
   * Places). `placeId` is the authoritative dedupe/enrichment/caching key;
   * `placeName` is the provider's canonical display name (SEPARATE from the
   * editable `name`); `placeTypes` are the provider's categories. Optional/
   * additive — absent on by-name and legacy stops.
   */
  placeId?: string
  placeSource?: 'google'
  placeName?: string
  placeTypes?: string[]
```

In `interface TripConfig`, after the `destination?: string` line:

```ts
  /**
   * Resolved geo for `destination` — center + ISO-3166-1 alpha-2 `countryCode`
   * (lowercased, ready for Places `includedRegionCodes`; '' when unknown) +
   * `state`. Canonical derived metadata, written eagerly on create + destination
   * change; used to country-restrict + seed the autocomplete bias center.
   */
  destinationGeo?: { lat: number; lng: number; countryCode: string; state?: string }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/trip/stop-fields.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/types.ts app/src/trip/stop-fields.test.ts
git commit -m "feat(types): normalized-place fields (placeId/placeName/placeTypes) + destinationGeo"
```

---

## Task 2: `region.ts` — resolveRegion (Photon → country + center)

**Files:**
- Create: `app/src/trip/region.ts`, `app/src/trip/region.test.ts`
- Reference: `app/src/lib/geocode.ts` (`geocodeUrl`), `app/src/lib/photon.test.ts` (fetch-mock pattern)

- [ ] **Step 1: Write the failing test** (`app/src/trip/region.test.ts`)

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseRegion, resolveRegion } from './region'

const feat = (coordinates: number[], properties: Record<string, unknown>) =>
  ({ geometry: { coordinates }, properties })

describe('parseRegion', () => {
  it('reads center + lowercased countrycode + state (US)', () => {
    const json = { features: [feat([-90.19, 38.62], { countrycode: 'US', state: 'Missouri', name: 'St. Louis' })] }
    expect(parseRegion(json)).toEqual({ lat: 38.62, lng: -90.19, countryCode: 'us', state: 'Missouri' })
  })
  it('omits state when absent (non-US)', () => {
    const json = { features: [feat([139.7, 35.68], { countrycode: 'JP', name: 'Tokyo' })] }
    expect(parseRegion(json)).toEqual({ lat: 35.68, lng: 139.7, countryCode: 'jp' })
  })
  it('keeps center with empty countryCode when countrycode missing', () => {
    const json = { features: [feat([2.35, 48.85], { name: 'Somewhere' })] }
    expect(parseRegion(json)).toEqual({ lat: 48.85, lng: 2.35, countryCode: '' })
  })
  it('returns null for garbage / no features / bad coords', () => {
    expect(parseRegion(null)).toBeNull()
    expect(parseRegion({ features: [] })).toBeNull()
    expect(parseRegion({ features: [feat(['x' as unknown as number, 1], {})] })).toBeNull()
  })
})

describe('resolveRegion', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns null (no fetch) for empty input', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await resolveRegion('  ')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })
  it('parses a good Photon response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ features: [feat([-90.19, 38.62], { countrycode: 'US', state: 'Missouri' })] }),
    } as Response)
    expect(await resolveRegion('St. Louis, Missouri, United States')).toEqual({ lat: 38.62, lng: -90.19, countryCode: 'us', state: 'Missouri' })
  })
  it('returns null on non-OK / throw', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await resolveRegion('X')).toBeNull()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('net'))
    expect(await resolveRegion('X')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/trip/region.test.ts`
Expected: FAIL — "Failed to resolve import './region'".

- [ ] **Step 3: Write `app/src/trip/region.ts`** (resolveRegion half)

```ts
import { geocodeUrl } from '../lib/geocode'

/** Resolved geo for a trip destination — center + ISO-3166-1 alpha-2 country + state. */
export interface RegionGeo {
  lat: number
  lng: number
  /** Lowercased ISO-3166-1 alpha-2 (ready for Places `includedRegionCodes`); '' when unknown. */
  countryCode: string
  state?: string
}

const finite = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) ? n : undefined
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Parse a Photon GeoJSON response into a RegionGeo — first feature's center
 * ([lng,lat]) + lowercased countrycode + state. Returns null on any miss/shape
 * error. countryCode may be '' (center still usable for bias). Pure.
 */
export function parseRegion(json: unknown): RegionGeo | null {
  if (typeof json !== 'object' || json === null) return null
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features) || features.length === 0) return null
  const first = features[0] as { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }
  const coords = first?.geometry?.coordinates
  if (!Array.isArray(coords)) return null
  const lng = finite(coords[0])
  const lat = finite(coords[1])
  if (lat === undefined || lng === undefined) return null
  const props = first.properties ?? {}
  const countryCode = str(props.countrycode).toLowerCase()
  const state = str(props.state)
  return state ? { lat, lng, countryCode, state } : { lat, lng, countryCode }
}

/**
 * Resolve a destination string to its RegionGeo via Photon, or null. Guards an
 * empty query (no fetch). Any failure resolves to null — never throws.
 */
export async function resolveRegion(destination: string, signal?: AbortSignal): Promise<RegionGeo | null> {
  const q = (destination || '').trim()
  if (!q) return null
  try {
    const res = await fetch(geocodeUrl(q), { signal })
    if (!res.ok) return null
    return parseRegion(await res.json())
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/trip/region.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/region.ts app/src/trip/region.test.ts
git commit -m "feat(region): resolveRegion — Photon → {lat,lng,countryCode,state}"
```

---

## Task 3: `region.ts` — biasCenter (planning-aware bias)

**Files:**
- Modify: `app/src/trip/region.ts`, `app/src/trip/region.test.ts`
- Reference: `app/src/trip/walk.ts` (`stopCoords`, `LatLng`)

> Priority chain (returns the first available): (1) most recently added coord-bearing stop in the **current day**; (2) most recently added coord-bearing stop **anywhere in the trip** (so a fresh day biases to your latest work rather than back to the start — this realizes the spec's "current-day fallback" intent in a reachable, testable way; flagged for reviewer); (3) `destinationGeo` center; else `undefined`.

- [ ] **Step 1: Write the failing test** (append to `region.test.ts`)

```ts
import { biasCenter } from './region'
import type { Trip } from '../types'

const mkTrip = (days: Array<Array<{ lat?: number; lng?: number }>>, destinationGeo?: Trip['config']['destinationGeo']): Trip =>
  ({ id: 't', owner_id: null, title: 'T', subtitle: null,
     config: { destinationGeo },
     data: { days: days.map(stops => ({ title: '', stops: stops.map((s, i) => ({ name: 'S' + i, ...s })) })), completed: [] } }) as Trip

describe('biasCenter', () => {
  it('1) uses the most recent coord stop in the current day', () => {
    const t = mkTrip([[{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]])
    expect(biasCenter(t, 0)).toEqual({ lat: 2, lng: 2 })
  })
  it('2) falls back to the most recent coord stop anywhere when the day has none', () => {
    const t = mkTrip([[{ lat: 5, lng: 5 }], [{}]]) // day 1 has a no-coord stop
    expect(biasCenter(t, 1)).toEqual({ lat: 5, lng: 5 })
  })
  it('3) falls back to destinationGeo when no stop has coords', () => {
    const t = mkTrip([[{}]], { lat: 9, lng: 9, countryCode: 'us' })
    expect(biasCenter(t, 0)).toEqual({ lat: 9, lng: 9 })
  })
  it('returns undefined when nothing is available', () => {
    expect(biasCenter(mkTrip([[]]), 0)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/trip/region.test.ts`
Expected: FAIL — "biasCenter is not a function".

- [ ] **Step 3: Add `biasCenter`** to `app/src/trip/region.ts`

```ts
import { stopCoords, type LatLng } from './walk'
import type { Stop, Trip } from '../types'

/** The last (most recently added) coord-bearing stop in a list, or null. */
function lastCoordStop(stops: Stop[]): LatLng | null {
  for (let i = stops.length - 1; i >= 0; i--) {
    const c = stopCoords(stops[i])
    if (c) return c
  }
  return null
}

/**
 * Autocomplete bias center for the day being planned, by priority:
 *   1. most recent coord-bearing stop in the current day,
 *   2. most recent coord-bearing stop anywhere in the trip,
 *   3. the trip's destinationGeo center,
 * else undefined (caller omits locationBias). Pure.
 */
export function biasCenter(trip: Pick<Trip, 'config' | 'data'>, dayIndex: number): LatLng | undefined {
  const days = trip.data?.days ?? []
  const inDay = lastCoordStop(days[dayIndex]?.stops ?? [])
  if (inDay) return inDay
  const inTrip = lastCoordStop(days.flatMap(d => d?.stops ?? []))
  if (inTrip) return inTrip
  const geo = trip.config?.destinationGeo
  if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) return { lat: geo.lat, lng: geo.lng }
  return undefined
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/trip/region.test.ts`
Expected: PASS (all 8 region tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/region.ts app/src/trip/region.test.ts
git commit -m "feat(region): biasCenter — planning-aware autocomplete bias"
```

---

## Task 4: `placeSearch.ts` — pure builders + parsers

**Files:**
- Create: `app/src/lib/placeSearch.ts`, `app/src/lib/placeSearch.test.ts`

- [ ] **Step 1: Write the failing test** (`app/src/lib/placeSearch.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { buildAutocompleteBody, parsePredictions, parseDetails } from './placeSearch'

describe('buildAutocompleteBody', () => {
  it('includes input/sessionToken/lang + country + 50km circle bias', () => {
    const b = buildAutocompleteBody('gate', 'tok-1', { countryCode: 'us', lat: 38.6, lng: -90.2 })
    expect(b).toMatchObject({
      input: 'gate', sessionToken: 'tok-1', languageCode: 'en',
      includedRegionCodes: ['us'],
      locationBias: { circle: { center: { latitude: 38.6, longitude: -90.2 }, radius: 50000 } },
    })
  })
  it('omits includedRegionCodes when countryCode is empty, and locationBias when no center', () => {
    const b = buildAutocompleteBody('gate', 'tok-1', { countryCode: '' })
    expect(b).not.toHaveProperty('includedRegionCodes')
    expect(b).not.toHaveProperty('locationBias')
  })
})

describe('parsePredictions', () => {
  it('maps Google suggestions to {placeId,primaryText,secondaryText,types}', () => {
    const json = { suggestions: [
      { placePrediction: { placeId: 'p1',
        structuredFormat: { mainText: { text: 'Gateway Arch' }, secondaryText: { text: 'St. Louis, MO' } },
        types: ['tourist_attraction'] } },
      { queryPrediction: { text: { text: 'ignored' } } }, // non-place prediction → dropped
    ] }
    expect(parsePredictions(json)).toEqual([
      { placeId: 'p1', primaryText: 'Gateway Arch', secondaryText: 'St. Louis, MO', types: ['tourist_attraction'] },
    ])
  })
  it('returns [] for garbage', () => {
    expect(parsePredictions(null)).toEqual([])
    expect(parsePredictions({})).toEqual([])
    expect(parsePredictions({ suggestions: 'no' })).toEqual([])
  })
})

describe('parseDetails', () => {
  it('maps Google place to {name,lat,lng,address,types}', () => {
    const json = { location: { latitude: 38.62, longitude: -90.18 },
      formattedAddress: '11 N 4th St, St. Louis, MO', displayName: { text: 'Gateway Arch' },
      types: ['tourist_attraction'] }
    expect(parseDetails(json)).toEqual({
      name: 'Gateway Arch', lat: 38.62, lng: -90.18, address: '11 N 4th St, St. Louis, MO', types: ['tourist_attraction'],
    })
  })
  it('returns null without finite coords', () => {
    expect(parseDetails({ displayName: { text: 'X' } })).toBeNull()
    expect(parseDetails(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/placeSearch.test.ts`
Expected: FAIL — "Failed to resolve import './placeSearch'".

- [ ] **Step 3: Write `app/src/lib/placeSearch.ts`** (pure half)

```ts
/** A place-search prediction surfaced in the typeahead. */
export interface Prediction {
  placeId: string
  primaryText: string
  secondaryText: string
  types: string[]
}

/** A resolved place (from Place Details) used to patch a stop. */
export interface ResolvedPlace {
  name: string
  lat: number
  lng: number
  address?: string
  types: string[]
}

/** Bias inputs for an autocomplete request (country + optional center). */
export interface SearchRegion {
  countryCode: string
  lat?: number
  lng?: number
}

const finite = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) ? n : undefined
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/**
 * Build the Google Places (New) autocomplete request body. Country-restricts when
 * a code is present and adds a 50 km circle bias when a center is present (the
 * Google max). Pure.
 */
export function buildAutocompleteBody(input: string, sessionToken: string, region: SearchRegion): Record<string, unknown> {
  const body: Record<string, unknown> = { input, sessionToken, languageCode: 'en' }
  if (region.countryCode) body.includedRegionCodes = [region.countryCode]
  const lat = finite(region.lat)
  const lng = finite(region.lng)
  if (lat !== undefined && lng !== undefined) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } }
  }
  return body
}

/** Parse a Google autocomplete response into Prediction[]. Pure; never throws. */
export function parsePredictions(json: unknown): Prediction[] {
  if (typeof json !== 'object' || json === null) return []
  const suggestions = (json as { suggestions?: unknown }).suggestions
  if (!Array.isArray(suggestions)) return []
  const out: Prediction[] = []
  for (const s of suggestions) {
    const p = (s as { placePrediction?: Record<string, unknown> })?.placePrediction
    if (!p) continue
    const placeId = str(p.placeId)
    const sf = (p.structuredFormat ?? {}) as { mainText?: { text?: unknown }; secondaryText?: { text?: unknown } }
    const primaryText = str(sf.mainText?.text)
    if (!placeId || !primaryText) continue
    out.push({ placeId, primaryText, secondaryText: str(sf.secondaryText?.text), types: strArr(p.types) })
  }
  return out
}

/** Parse a Google Place Details response into a ResolvedPlace, or null. Pure. */
export function parseDetails(json: unknown): ResolvedPlace | null {
  if (typeof json !== 'object' || json === null) return null
  const j = json as { location?: { latitude?: unknown; longitude?: unknown }; formattedAddress?: unknown; displayName?: { text?: unknown }; types?: unknown }
  const lat = finite(j.location?.latitude)
  const lng = finite(j.location?.longitude)
  if (lat === undefined || lng === undefined) return null
  const address = str(j.formattedAddress)
  return {
    name: str(j.displayName?.text),
    lat, lng,
    ...(address ? { address } : {}),
    types: strArr(j.types),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/placeSearch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/placeSearch.ts app/src/lib/placeSearch.test.ts
git commit -m "feat(placeSearch): pure autocomplete body builder + response parsers"
```

---

## Task 5: `placeSearch.ts` — fetch wrappers (client → edge fn)

**Files:**
- Modify: `app/src/lib/placeSearch.ts`, `app/src/lib/placeSearch.test.ts`
- Reference: `app/src/trip/guide/placePhoto.ts` (`authToken()` + `SUPABASE_*` usage)

- [ ] **Step 1: Write the failing test** (append to `placeSearch.test.ts`)

```ts
import { vi, afterEach } from 'vitest'
import { fetchPredictions, fetchPlaceDetails } from './placeSearch'

vi.mock('./supabase', () => ({
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

describe('fetchPredictions', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns [] (no fetch) under 1 char', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchPredictions('', 'tok', { countryCode: 'us' })).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
  it('POSTs action:autocomplete and parses suggestions', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ suggestions: [{ placePrediction: { placeId: 'p1', structuredFormat: { mainText: { text: 'Gateway Arch' } }, types: [] } }] }),
    } as Response)
    const out = await fetchPredictions('gate', 'tok', { countryCode: 'us', lat: 1, lng: 2 })
    expect(out).toEqual([{ placeId: 'p1', primaryText: 'Gateway Arch', secondaryText: '', types: [] }])
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.action).toBe('autocomplete')
    expect(body.body.input).toBe('gate')
  })
  it('returns [] on non-OK / throw', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    expect(await fetchPredictions('gate', 'tok', { countryCode: 'us' })).toEqual([])
  })
})

describe('fetchPlaceDetails', () => {
  afterEach(() => vi.restoreAllMocks())
  it('POSTs action:details and parses the place', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ location: { latitude: 1, longitude: 2 }, displayName: { text: 'X' }, types: [] }),
    } as Response)
    expect(await fetchPlaceDetails('p1', 'tok')).toEqual({ name: 'X', lat: 1, lng: 2, types: [] })
  })
  it('returns null on miss', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    expect(await fetchPlaceDetails('p1', 'tok')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/placeSearch.test.ts`
Expected: FAIL — "fetchPredictions is not a function".

- [ ] **Step 3: Add fetch wrappers** to `app/src/lib/placeSearch.ts`

```ts
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './supabase'

const PLACE_SEARCH_FN_SLUG = 'place-search'
const fnUrl = () => `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${PLACE_SEARCH_FN_SLUG}`

async function authToken(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) return data.session.access_token } catch { /* anon */ }
  return SUPABASE_ANON_KEY
}

async function callFn(payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown | null> {
  try {
    const res = await fetch(fnUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await authToken()), apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(payload),
      signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Autocomplete predictions for `input`, or [] on any miss. Never throws. */
export async function fetchPredictions(input: string, sessionToken: string, region: SearchRegion, signal?: AbortSignal): Promise<Prediction[]> {
  const q = input.trim()
  if (!q) return []
  const json = await callFn({ action: 'autocomplete', body: buildAutocompleteBody(q, sessionToken, region) }, signal)
  return parsePredictions(json)
}

/** Resolve a place's details, or null on any miss. Never throws. */
export async function fetchPlaceDetails(placeId: string, sessionToken: string): Promise<ResolvedPlace | null> {
  if (!placeId) return null
  const json = await callFn({ action: 'details', placeId, sessionToken })
  return parseDetails(json)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/placeSearch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/placeSearch.ts app/src/lib/placeSearch.test.ts
git commit -m "feat(placeSearch): client fetch wrappers to the place-search proxy"
```

---

## Task 6: Stop lookup + details-patch guard

**Files:**
- Modify: `app/src/lib/geocode.ts`, `app/src/lib/geocode.test.ts`

- [ ] **Step 1: Write the failing test** (append to `app/src/lib/geocode.test.ts`)

```ts
import { findStopByPlaceId, canApplyPlaceDetails } from './geocode'
import type { Trip } from '../types'

const trip = (): Trip => ({ id: 't', owner_id: null, title: 'T', subtitle: null, config: {},
  data: { days: [{ title: '', stops: [{ name: 'A' }, { name: 'Arch', placeId: 'p1' }] }], completed: [] } }) as Trip

describe('findStopByPlaceId', () => {
  it('locates a stop by placeId', () => {
    expect(findStopByPlaceId(trip(), 'p1')).toMatchObject({ dayIndex: 0, stopIndex: 1 })
  })
  it('returns null when absent', () => {
    expect(findStopByPlaceId(trip(), 'nope')).toBeNull()
  })
})

describe('canApplyPlaceDetails', () => {
  it('applies only when the stop exists and placeId matches', () => {
    expect(canApplyPlaceDetails({ name: 'Arch', placeId: 'p1' }, 'p1')).toBe(true)
    expect(canApplyPlaceDetails({ name: 'Arch', placeId: 'p2' }, 'p1')).toBe(false)
    expect(canApplyPlaceDetails(null, 'p1')).toBe(false)
    expect(canApplyPlaceDetails(undefined, 'p1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/geocode.test.ts`
Expected: FAIL — "findStopByPlaceId is not a function".

- [ ] **Step 3: Add the helpers** to `app/src/lib/geocode.ts`

```ts
import type { Stop, Trip } from '../types'

/** Locate a stop by its canonical placeId. Returns its position + the stop, or null. */
export function findStopByPlaceId(trip: Pick<Trip, 'data'>, placeId: string): { dayIndex: number; stopIndex: number; stop: Stop } | null {
  const days = trip.data?.days ?? []
  for (let d = 0; d < days.length; d++) {
    const stops = days[d]?.stops ?? []
    for (let s = 0; s < stops.length; s++) {
      if (stops[s].placeId === placeId) return { dayIndex: d, stopIndex: s, stop: stops[s] }
    }
  }
  return null
}

/**
 * May an in-flight place-details response patch this stop? Only when the stop
 * still exists AND its `placeId` still matches the response's. Guards against a
 * deleted/relocated stop being mutated by a stale response. Pure.
 */
export function canApplyPlaceDetails(current: Pick<Stop, 'placeId'> | null | undefined, detailsPlaceId: string): boolean {
  return !!current && current.placeId === detailsPlaceId
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/geocode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/geocode.ts app/src/lib/geocode.test.ts
git commit -m "feat(geocode): findStopByPlaceId + canApplyPlaceDetails guard"
```

---

## Task 7: `useStopSearch` hook

**Files:**
- Create: `app/src/data/useStopSearch.ts`
- Reference: `app/src/data/usePlaceSearch.ts` (TanStack pattern)

> No new pure logic to unit-test (it composes tested `fetchPredictions`); verified by the component test in Task 8 + the live smoke test. Mirrors `usePlaceSearch`.

- [ ] **Step 1: Write `app/src/data/useStopSearch.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchPredictions, type Prediction, type SearchRegion } from '../lib/placeSearch'

const MIN_QUERY = 3
const SESSION_STALE = 5 * 60 * 1000 // predictions are stable within a typing session

export interface UseStopSearchResult {
  predictions: Prediction[]
  loading: boolean
}

/**
 * Autocomplete predictions for `query`, country-scoped + proximity-biased by
 * `region`, billed under `sessionToken`. Enabled at ≥3 chars; fails soft to [].
 * Debounce + in-flight cancellation live in the consuming component
 * (`StopSearchInput`). Mirrors `usePlaceSearch`.
 */
export function useStopSearch(query: string, region: SearchRegion, sessionToken: string): UseStopSearchResult {
  const q = query.trim()
  const enabled = q.length >= MIN_QUERY
  const result = useQuery({
    queryKey: ['place-search', q.toLowerCase(), region.countryCode, region.lat, region.lng, sessionToken],
    enabled,
    staleTime: SESSION_STALE,
    gcTime: SESSION_STALE,
    retry: 1,
    queryFn: ({ signal }) => fetchPredictions(q, sessionToken, region, signal),
  })
  return { predictions: result.data ?? [], loading: enabled && result.isLoading }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/useStopSearch.ts
git commit -m "feat(data): useStopSearch — country-scoped autocomplete hook"
```

---

## Task 8: `StopSearchInput` typeahead component

**Files:**
- Create: `app/src/trip/StopSearchInput.tsx`
- Test: `app/src/trip/StopSearchInput.test.tsx`
- Reference: `app/src/components/DestinationInput.tsx` (a11y/keyboard shell), `app/src/trip/icons.tsx` (`stopTypeIcon`)

- [ ] **Step 1: Write the failing test** (`app/src/trip/StopSearchInput.test.tsx`)

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StopSearchInput } from './StopSearchInput'

vi.mock('../lib/placeSearch', async (orig) => ({
  ...(await orig<typeof import('../lib/placeSearch')>()),
  fetchPredictions: vi.fn(async () => [{ placeId: 'p1', primaryText: 'Gateway Arch', secondaryText: 'St. Louis, MO', types: ['tourist_attraction'] }]),
}))

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

describe('StopSearchInput', () => {
  it('shows predictions and calls onSelect with the prediction + session token', async () => {
    const onSelect = vi.fn()
    wrap(<StopSearchInput region={{ countryCode: 'us' }} onSelect={onSelect} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'gateway' } })
    const opt = await screen.findByText('Gateway Arch')
    fireEvent.mouseDown(opt)
    await waitFor(() => expect(onSelect).toHaveBeenCalled())
    expect(onSelect.mock.calls[0][0]).toMatchObject({ placeId: 'p1', primaryText: 'Gateway Arch' })
    expect(typeof onSelect.mock.calls[0][1]).toBe('string') // session token
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/trip/StopSearchInput.test.tsx`
Expected: FAIL — "Failed to resolve import './StopSearchInput'".

- [ ] **Step 3: Write `app/src/trip/StopSearchInput.tsx`**

```tsx
import { useEffect, useId, useRef, useState } from 'react'
import { MapPin, Search, Loader2, stopTypeIcon } from './icons'
import { useStopSearch } from '../data/useStopSearch'
import type { Prediction, SearchRegion } from '../lib/placeSearch'
import { cn } from '../lib/utils'

const DEBOUNCE_MS = 300
const MIN_QUERY = 3
const newToken = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`)

/**
 * As-you-type place search for AddStop. Country-scoped + proximity-biased via
 * `region`; debounced (~300ms); one Google session token per typing session
 * (reset after a select). Selecting a prediction calls `onSelect(prediction,
 * sessionToken)` — the parent resolves details under the same token. Keyboard +
 * a11y parity with DestinationInput.
 */
export function StopSearchInput({ region, onSelect, placeholder = 'Search for a place…' }:
  { region: SearchRegion; onSelect: (p: Prediction, sessionToken: string) => void; placeholder?: string }) {
  const [value, setValue] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const tokenRef = useRef(newToken())
  const listId = useId()
  const optionId = (i: number) => `${listId}-opt-${i}`

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [value])

  const { predictions, loading } = useStopSearch(debounced, region, tokenRef.current)
  const showList = open && value.trim().length >= MIN_QUERY && (loading || predictions.length > 0)
  useEffect(() => { setActive(-1) }, [predictions])

  const select = (p: Prediction) => {
    onSelect(p, tokenRef.current)
    tokenRef.current = newToken() // new billing session for the next search
    setValue('')
    setDebounced('')
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { if (showList) { e.stopPropagation(); e.preventDefault(); setOpen(false); setActive(-1) } return }
    if (!showList || predictions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % predictions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? predictions.length - 1 : i - 1)) }
    else if (e.key === 'Enter' && active >= 0 && active < predictions.length) { e.preventDefault(); select(predictions[active]) }
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"><Search size={16} aria-hidden="true" /></span>
      <input
        type="text" role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined} aria-label="Search for a place" autoComplete="off"
        value={value} placeholder={placeholder}
        onChange={e => { setValue(e.target.value); setOpen(true) }}
        onFocus={() => { if (value.trim().length >= MIN_QUERY) setOpen(true) }}
        onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
        className={cn('w-full rounded-btn bg-fill border border-hair pl-10 pr-10 py-3 text-[15px] text-ink',
          'placeholder:text-muted outline-none focus:border-sig-link transition-colors')}
      />
      {loading && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" /></span>}

      {showList && (
        <ul id={listId} role="listbox" aria-label="Place suggestions"
          className={cn('absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-btn border border-hair bg-base shadow-lift')}>
          {predictions.length === 0 && loading && (
            <li className="flex min-h-[44px] items-center gap-2 px-3.5 text-[13px] text-muted" aria-hidden="true"><Search size={15} /> Searching…</li>
          )}
          {predictions.map((p, i) => {
            const TypeIcon = stopTypeIcon(p.types[0])
            return (
              <li key={p.placeId} id={optionId(i)} role="option" aria-selected={i === active}
                onMouseDown={e => { e.preventDefault(); select(p) }} onMouseEnter={() => setActive(i)}
                className={cn('flex min-h-[44px] cursor-pointer items-start gap-2.5 px-3.5 py-2 text-[14px] text-ink transition-colors', i === active ? 'bg-fill' : 'hover:bg-fill')}>
                <TypeIcon size={15} className="shrink-0 mt-0.5 text-muted" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.primaryText}</span>
                  {p.secondaryText && <span className="block truncate text-[12.5px] text-muted">{p.secondaryText}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

> Note: confirm `stopTypeIcon` is exported from `app/src/trip/icons.tsx` (it is — used in AddStop/ChangeLocation). If `Search`/`Loader2`/`MapPin` are not re-exported there, import them from `lucide-react` instead (as `DestinationInput` imports from `../trip/icons`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/trip/StopSearchInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/StopSearchInput.tsx app/src/trip/StopSearchInput.test.tsx
git commit -m "feat(trip): StopSearchInput typeahead (Google autocomplete UI)"
```

---

## Task 8b: Verify icon re-exports

- [ ] **Step 1: Check exports**

Run: `grep -nE "export .*(stopTypeIcon|Search|Loader2|MapPin)" app/src/trip/icons.tsx`
Expected: `stopTypeIcon` present. If `Search`/`Loader2`/`MapPin` are missing, change the `StopSearchInput.tsx` import line to `import { Search, Loader2, MapPin } from 'lucide-react'` and keep `import { stopTypeIcon } from './icons'`. Re-run Task 8 Step 4.

---

## Task 9: Background details-patch hook

**Files:**
- Create: `app/src/data/useBackfillPlaceDetails.ts`
- Reference: `app/src/data/useGeocodeBackfill.ts` (mirror this **exactly** — it solves the freshness + stale-response race by re-reading the trip from the query cache via `qc.getQueryData<Trip>(tripKey(tripId))`)

> No new pure logic (it composes tested `fetchPlaceDetails` + `findStopByPlaceId` + `canApplyPlaceDetails`); verified by Task 12's smoke test. Read `useGeocodeBackfill.ts` first so this matches its structure and `tripKey` import.

- [ ] **Step 1: Write `app/src/data/useBackfillPlaceDetails.ts`**

```ts
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchPlaceDetails } from '../lib/placeSearch'
import { findStopByPlaceId, canApplyPlaceDetails } from '../lib/geocode'
import { tripKey } from '../trip/useTrip'
import type { Trip, TripData } from '../types'

/**
 * Fire-and-forget place-details backfill for a stop just created from an
 * autocomplete pick. Resolves coords/address/types under the autocomplete
 * session token, then patches the stop — but ONLY through canApplyPlaceDetails:
 * it re-reads the latest trip from the query cache and applies just when the
 * matching stop still exists and still carries this placeId (a delete/relocate
 * mid-flight discards the result). NEVER overwrites the editable `name`. Mirrors
 * useGeocodeBackfill.
 */
export function useBackfillPlaceDetails(
  tripId: string | undefined,
  save: (partial: { data: TripData }) => void,
) {
  const qc = useQueryClient()
  const backfillPlaceDetails = useCallback((placeId: string, sessionToken: string) => {
    if (!tripId || !placeId) return
    void (async () => {
      const details = await fetchPlaceDetails(placeId, sessionToken)
      if (!details) return // by-name geocode backfill still resolves coords
      const current = qc.getQueryData<Trip>(tripKey(tripId))
      if (!current) return
      const hit = findStopByPlaceId(current, placeId)
      if (!hit || !canApplyPlaceDetails(hit.stop, placeId)) return
      const data: TripData = {
        ...current.data,
        days: current.data.days.map((d, i) => i !== hit.dayIndex ? d : {
          ...d,
          stops: d.stops.map((s, j) => j !== hit.stopIndex ? s : {
            ...s,
            lat: details.lat, lng: details.lng,
            coords: { lat: details.lat, lng: details.lng },
            ...(details.address ? { address: details.address } : {}),
            placeName: details.name || s.placeName,
            ...(details.types.length ? { placeTypes: details.types } : {}),
          }),
        }),
      }
      save({ data })
    })()
  }, [tripId, qc, save])
  return { backfillPlaceDetails }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc -b`
Expected: exit 0. (Confirm `tripKey` is exported from `app/src/trip/useTrip.ts` — `useGeocodeBackfill` imports it the same way.)

- [ ] **Step 3: Commit**

```bash
git add app/src/data/useBackfillPlaceDetails.ts
git commit -m "feat(data): useBackfillPlaceDetails — guarded place-details backfill"
```

---

## Task 9b: Wire AddStop — dedup + immediate create + background patch

**Files:**
- Modify: `app/src/trip/AddStop.tsx`
- Reference: existing `addStop()` in AddStop; `findStopByPlaceId` (Task 6); `useBackfillPlaceDetails` (Task 9); `biasCenter` (Task 3)

- [ ] **Step 1: Add imports + hook instance** (top of `AddStop.tsx`; do not duplicate the existing React import)

```ts
import { StopSearchInput } from './StopSearchInput'
import { type Prediction } from '../lib/placeSearch'
import { findStopByPlaceId } from '../lib/geocode'
import { biasCenter } from './region'
import { useBackfillPlaceDetails } from '../data/useBackfillPlaceDetails'
```

Near the existing `const { backfillCoords } = useGeocodeBackfill(trip.id, save)`:

```ts
  const { backfillPlaceDetails } = useBackfillPlaceDetails(trip.id, save)
  const [dupNotice, setDupNotice] = useState<string | null>(null)
```

- [ ] **Step 2: Add the select handler** inside the `AddStop` component (after the existing `addStop` function)

```ts
  // The trip's country (stable) + the planning-aware bias center for this day.
  const region = {
    countryCode: trip.config?.destinationGeo?.countryCode ?? '',
    ...biasCenter(trip, day),
  }

  /** Pick a real place from autocomplete: dedup → create immediately → resolve
   *  coords/types in the background (guarded by placeId in the hook). */
  function onPickPlace(p: Prediction, sessionToken: string) {
    // 1. Duplicate guard — same normalized place already in the trip (placeId only).
    if (p.placeId && findStopByPlaceId(trip, p.placeId)) {
      setError(null)
      setLastAdded(null)
      setDupNotice(p.primaryText)
      return
    }
    setDupNotice(null)
    // 2. Immediate create from the prediction (no wait on details).
    addStop({
      name: p.primaryText,
      placeName: p.primaryText,
      placeId: p.placeId,
      placeSource: 'google',
      ...(p.types.length ? { placeTypes: p.types } : {}),
    })
    // 3. Background, guarded details patch (re-reads fresh trip from cache).
    if (p.placeId) backfillPlaceDetails(p.placeId, sessionToken)
  }
```

> Note: `addStop` already tags `kind` and triggers `backfillCoords` (covers coords on a details miss). It currently takes a `Stop`; passing the place fields through is additive — confirm `placeFromSuggestion` (called inside `addStop`) preserves `placeId`/`placeName`/`placeTypes`/`placeSource`. If it strips unknown fields, set them on the result after `placeFromSuggestion` (mirror how `addStop` already re-applies `note`).

- [ ] **Step 3: Render the input + dup notice**

In the JSX, **above** the existing AI search `<form>`:

```tsx
      {/* Primary: real-place autocomplete. */}
      <div className="mb-2">
        <StopSearchInput region={region} onSelect={onPickPlace} placeholder="Search for a place…" />
      </div>
      {dupNotice && (
        <p role="status" className="mb-3 text-[13px] text-muted bg-fill border border-hair rounded-card px-3.5 py-2">
          “{dupNotice}” is already in your trip.
        </p>
      )}
      <p className="text-[12px] text-muted mb-2">Or describe what you want and let AI suggest:</p>
```

Reset `dupNotice` in the sheet-open effect (add `setDupNotice(null)` alongside the other resets).

- [ ] **Step 4: Verify build + tests**

Run: `npx tsc -b && npx vitest run src/trip`
Expected: exit 0; tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/AddStop.tsx
git commit -m "feat(addstop): place autocomplete — dedup + immediate create + background details patch"
```

---

## Task 10: Eager `destinationGeo` (create + destination edit)

**Files:**
- Create: `app/src/data/useBackfillDestinationGeo.ts`
- Reference: `app/src/data/useTrips.ts:99-130` (`useBackfillCoverImage` — config patch pattern)
- Modify: `app/src/routes/NewTripSheet.tsx`, `app/src/trip/Trip.tsx`

- [ ] **Step 1: Write `app/src/data/useBackfillDestinationGeo.ts`** (model on `useBackfillCoverImage`)

```ts
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { resolveRegion } from '../trip/region'
import type { TripConfig } from '../types'

/**
 * Resolve `destination` to its RegionGeo and persist it as `config.destinationGeo`
 * (immutably) on the given trip. Fire-and-forget, edit-gated by the caller; a
 * miss is a no-op (autocomplete falls back to country-less). Mirrors
 * useBackfillCoverImage's config-patch shape.
 */
export function useBackfillDestinationGeo() {
  const qc = useQueryClient()
  return useCallback(async (args: { id: string; destination: string; config: TripConfig }) => {
    const geo = await resolveRegion(args.destination)
    if (!geo) return
    const { error } = await supabase.from('trips').update({ config: { ...args.config, destinationGeo: geo } }).eq('id', args.id)
    if (!error) void qc.invalidateQueries({ queryKey: ['trips'] })
  }, [qc])
}
```

> Verify the exact table/column + invalidation key against `useBackfillCoverImage` in `useTrips.ts:99-130` and match them precisely (it uses `.from('trips').update({ config: {...} }).eq('id', id)`).

- [ ] **Step 2: Wire trip creation** — in `app/src/routes/NewTripSheet.tsx`, after the existing `void backfillCover({...})` call in `submit()`:

```ts
      void backfillDestinationGeo({ id, destination, config: { title, ...(destination.trim() ? { destination: destination.trim() } : null) } })
```

Add the hook near `const backfillCover = useBackfillCoverImage()`:

```ts
  const backfillDestinationGeo = useBackfillDestinationGeo()
```

and import it: `import { useBackfillDestinationGeo } from '../data/useBackfillDestinationGeo'`.

- [ ] **Step 3: Wire destination edit** — in `app/src/trip/Trip.tsx`, find the handler that saves the edited `destination` (around the `DestinationInput` at line ~695). After it persists the new destination, call:

```ts
  void backfillDestinationGeo({ id: trip.id, destination: nextDestination, config: { ...trip.config, destination: nextDestination } })
```

(Use the same hook import; `nextDestination` is whatever local variable holds the edited value.)

- [ ] **Step 4: Lazy backfill for legacy trips** — in `AddStop.tsx`, in the sheet-open effect, kick a one-shot resolve when missing:

```ts
    if (open && canEdit && !trip.config?.destinationGeo && destinationOf(trip)) {
      void backfillDestinationGeo({ id: trip.id, destination: destinationOf(trip), config: trip.config })
    }
```

(Import `useBackfillDestinationGeo` + already-imported `destinationOf`; add `const backfillDestinationGeo = useBackfillDestinationGeo()`. AddStop must have `canEdit` — if not in scope, gate on the existing edit signal or drop the guard since the caller is already edit-gated.)

- [ ] **Step 5: Verify build + tests + commit**

Run: `npx tsc -b && npx vitest run`
Expected: exit 0; full suite PASS.

```bash
git add app/src/data/useBackfillDestinationGeo.ts app/src/routes/NewTripSheet.tsx app/src/trip/Trip.tsx app/src/trip/AddStop.tsx
git commit -m "feat(trip): eager destinationGeo on create + destination edit (+ legacy backfill)"
```

---

## Task 11: `place-search` edge function (thin proxy)

**Files:**
- Create: `supabase/functions/place-search/index.ts`
- Reference: `supabase/functions/place-photo/index.ts` (key/CORS/rate-limit/graceful pattern)

> Cannot be unit-tested locally (no Deno). Verified by deploy + curl (Task 12). Build it to the same graceful-when-unset, never-500 discipline as `place-photo`.

- [ ] **Step 1: Write `supabase/functions/place-search/index.ts`**

```ts
// supabase/functions/place-search/index.ts
//
// PAID place autocomplete proxy: Google Places API (New). The Google key lives
// ONLY here (server-side) and is NEVER returned to the client. The client builds
// the autocomplete request body + parses responses (see app/src/lib/placeSearch.ts);
// this function only injects the key and forwards to the two whitelisted endpoints.
//
// GRACEFUL: when GOOGLE_PLACES_API_KEY is unset, returns {predictions:[]} / {place:null}
// so the UI falls back. NEVER 500s the app. Reuses the shared place-photo key.
//   supabase functions deploy place-search

const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')
const RATE_LIMIT_PER_HOUR = 600
const rate = new Map<string, { count: number; resetAt: number }>()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...CORS, 'Content-Type': 'application/json' } })

function ok(ip: string): boolean {
  const now = Date.now(); const e = rate.get(ip)
  if (!e || now > e.resetAt) { rate.set(ip, { count: 1, resetAt: now + 3600_000 }); return true }
  if (e.count >= RATE_LIMIT_PER_HOUR) return false
  e.count++; return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })
  if (!GOOGLE_PLACES_API_KEY) return json({ predictions: [], place: null })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!ok(ip)) return new Response('Rate limit', { status: 429, headers: CORS })

  let payload: { action?: string; body?: unknown; placeId?: string; sessionToken?: string }
  try { payload = await req.json() } catch { return json({ predictions: [], place: null }) }

  try {
    if (payload.action === 'autocomplete') {
      const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY as string },
        body: JSON.stringify(payload.body ?? {}),
      })
      if (!r.ok) { console.error(`[place-search] autocomplete ${r.status}: ${await r.text().catch(() => '')}`); return json({ predictions: [] }) }
      return json(await r.json())
    }
    if (payload.action === 'details') {
      const placeId = (payload.placeId ?? '').replace(/[^A-Za-z0-9_-]/g, '')
      if (!placeId) return json({ place: null })
      const token = encodeURIComponent(payload.sessionToken ?? '')
      const url = `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${token}`
      const r = await fetch(url, {
        headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY as string, 'X-Goog-FieldMask': 'location,formattedAddress,displayName,types' },
      })
      if (!r.ok) { console.error(`[place-search] details ${r.status}: ${await r.text().catch(() => '')}`); return json({ place: null }) }
      return json(await r.json())
    }
    return json({ predictions: [], place: null })
  } catch (e) {
    console.error(`[place-search] error: ${String(e)}`)
    return json({ predictions: [], place: null })
  }
})
```

> **Contract note:** the function returns Google's raw JSON for the happy path; the client parsers (`parsePredictions`/`parseDetails`) read `suggestions[]` / `location`+`displayName`. On error it returns `{predictions:[]}` / `{place:null}`, which those parsers also treat as empty — so the client is null-safe either way.

- [ ] **Step 2: Commit (deploy is Task 12)**

```bash
git add supabase/functions/place-search/index.ts
git commit -m "feat(edge): place-search proxy for Google Places (New) autocomplete + details"
```

---

## Task 12: Full verification, deploy, smoke test

- [ ] **Step 1: Full typecheck + test suite**

Run: `cd app && npx tsc -b && npx vitest run`
Expected: exit 0; all tests PASS.

- [ ] **Step 2: Operator — deploy the function**

Run (operator, from repo root): `supabase functions deploy place-search`
Expected: deploys under slug `place-search` to ref `wnpanbjzmcsvhfyjdczv`. Confirm a Places **budget + quota cap** is set in Google Cloud.

- [ ] **Step 3: Live probe — confirm autocomplete is enabled**

```bash
ANON="<VITE_SUPABASE_ANON_KEY from app/.env.local>"
curl -s -X POST "https://wnpanbjzmcsvhfyjdczv.supabase.co/functions/v1/place-search" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  --data '{"action":"autocomplete","body":{"input":"gateway arch","languageCode":"en","includedRegionCodes":["us"]}}'
```
Expected: JSON containing `suggestions` with a Gateway Arch prediction. (If `{"predictions":[]}` and the key is set → the Autocomplete quota is 0; raise it. If `PERMISSION_DENIED` text → enable Places API (New).)

- [ ] **Step 4: Manual smoke (dev server)**

Run: `cd app && npm run dev` → open Guide/Plan → AddStop → type a place → confirm scoped predictions, instant stop creation, a pin filling in a beat later, and a dedup notice on re-pick. Watch Google billing: one session per add.

- [ ] **Step 5: Merge**

```bash
git checkout main && git merge --no-ff guide-facts-experience
```
(Carries the Guide facts/experience UX work + this feature. Push per project convention.)

---

## Out of scope (tracked follow-ups)
- Cross-trip shared enrichment cache keyed on `placeId`/`placeName`.
- Rectangle/hard state restriction (50 km circle bias is the v1 default).
- Per-category `includedPrimaryTypes` (Eat→restaurant, Stay→lodging).
- Unified autocomplete + AI-ideas search surface (architecture kept compatible).
- Cross-border regional travel (country restriction is a known v1 limitation).
