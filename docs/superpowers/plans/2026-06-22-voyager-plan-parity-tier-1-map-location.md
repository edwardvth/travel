# Tier 1 — Map & Location Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Plan map feel as premium as the Guide minimap (claret token pins, drop-shadow, hidden chrome, refined polyline, muted multi-day colors), remove the "navigate the user" affordances from Plan (no external maps deep-links), and make **every** stop mappable by resolving real coordinates through a shared key-less geocoder when AI omits them — with origin-vs-edit coordinate provenance and a last-write-wins stale-write guard.

**Architecture:** This is Tier 1 of the three-tier "Plan-tab parity" initiative (spec: `docs/superpowers/specs/2026-06-22-voyager-plan-parity-design.md` → "Tier 1 — Map & location foundation", lines 91–127, plus the Data model/Testing sections lines 222–237). The stop stays the atomic object; Plan/Guide are projections over one `data`; the geocoder is a **platform** utility (`app/src/lib/geocode.ts`, not `trip/`) so Plan, Guide, destination search and the future location cache all share it. The single "suggestion → location" mapping site (`app/src/trip/location.ts`) is where provenance is stamped. Geocoder fallback wires into the two callers that add/relocate stops (`AddStop`, `ChangeLocation`) fire-and-forget, mirroring the existing landmark-photo backfill (`app/src/data/useLandmarkBackfill.ts`). Walk times stay haversine (`app/src/trip/walk.ts`) — **no OSRM**; the map draws straight point-to-point lines.

**Tech Stack:** Vite + React 18 + TS + Tailwind (token theming) + Leaflet + vitest

---

## Grounding references (read before starting)

- Conventions: `C:\Users\edwar\travel\CLAUDE.md` (immutable saves §"Working conventions" line 84; tokens line 59; anti-slop line 56–62; data shapes line 74–80; Leaflet gotchas line 92), `C:\Users\edwar\travel\handoff.md` (queued sub-task: restyle Plan map line 19; test count "526" line 9; deploy line 9).
- Spec: `C:\Users\edwar\travel\docs\superpowers\specs\2026-06-22-voyager-plan-parity-design.md` — Tier 1 (1a restyle lines 97–106; 1b de-navigation lines 108–115; 1c geocoder lines 117–127), Data model (line 224), Testing (lines 234–237).
- Restyle source-of-aesthetic: `C:\Users\edwar\travel\app\src\trip\guide\StopMinimap.tsx` — claret pin via `var(--sig-btn)` + `drop-shadow` divIcon (lines 9–19), `userIcon` (lines 23–33), `zoomControl:false` / `attributionControl:false` (lines 96–97), the **computed `--sig-btn` read** for the SVG `stroke` attribute (lines 152–155), dashed rounded polyline (lines 159–165).
- Restyle target: `C:\Users\edwar\travel\app\src\trip\TripMapView.tsx` — hardcoded `CLARET='#8b2942'`/`GOLD='#c79a3b'` (lines 58–61), `dayColor` vivid HSL (lines 51–55), inline `pinIcon`/`stayIcon` divIcon HTML (lines 67–111), `zoomControl:true` (line 182), polyline weight/dash (lines 293–299).
- De-navigation target: `C:\Users\edwar\travel\app\src\trip\StopDetail.tsx` — `mapsUrl` (lines 163–167), "Navigate" anchor (lines 225–235), Google static-map peek (lines 239–254).
- Single mapping site: `C:\Users\edwar\travel\app\src\trip\location.ts` — `placeFromSuggestion` (lines 37–54), `applyLocation` (lines 71–90).
- Callers: `C:\Users\edwar\travel\app\src\trip\AddStop.tsx` — `addStop`/`addTyped` (lines 83–111), landmark backfill pattern (lines 36–37, 96–104). `C:\Users\edwar\travel\app\src\trip\ChangeLocation.tsx` — `pick`/`pickTyped` (lines 72–81).
- Photon to mirror: `C:\Users\edwar\travel\app\src\lib\photon.ts` (URL builder + guarded fetch, lines 24–111) and its test `C:\Users\edwar\travel\app\src\lib\photon.test.ts` (mocked-fetch pattern, lines 88–116).
- Types: `C:\Users\edwar\travel\app\src\types.ts` — `Stop` (lines 4–37).
- Haversine (stays, no OSRM): `C:\Users\edwar\travel\app\src\trip\walk.ts`.

## Conventions every task must honour (from CLAUDE.md / spec)

- **Immutable saves only** via the lifted `save({ data })` from `PlannerOutletContext`; never mutate cached `trip`/`data` — clone then save (CLAUDE.md line 84).
- **Edit-gated:** all writes guarded by `canEdit` (the geocoder wiring lives inside already-edit-gated `save` paths).
- **Additive JSONB back-compat:** new `Stop` fields are optional; never a migration; legacy reads preserved.
- **Anti-slop / a11y:** lucide icons only (no emoji); CSS-var **token** classes — no theme-breaking hex. Note `TripMapView` currently hardcodes `#8b2942` / `GOLD` / HSL and injects divIcon **HTML** where a `var()` resolves in a `style` attribute but **not** in Leaflet's polyline `stroke` SVG attribute — so reading the **computed** `--sig-btn` (exactly as `StopMinimap.tsx:152–155` does) is required for the polyline. ≥44px targets, `aria-*`, focus rings, `prefers-reduced-motion`.
- **Tests:** vitest unit tests for **pure** logic only (Leaflet is jsdom-skipped — test `dayColor`/the geocoder/the guard, never the map render). `cd app && npx tsc -b` clean; `cd app && npm run build` succeeds.
- **Per task:** commit with trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Branch `main`.
- **Deploy (end only):** `cd app && npm run build` then `npx wrangler deploy` from repo root.

> **TDD rhythm for every task:** write the failing test → run it (see it fail) → minimal implementation → run it (see it pass) → `npx tsc -b` → commit. Keep the whole suite green (`cd app && npm test`).

---

## Task 1 — `types.ts`: add the Tier-1 optional `Stop` fields

Add **only** the Tier-1 provenance fields. `hours`/`price`/`goodFor`/`bookingRecommendation` belong to Tiers 2/3 — do **not** add them here. `duration` already exists (`types.ts:9`). These are additive and may be touched by another tier later; keep them non-conflicting (alphabetical insertion near the other optional metadata, with the documented distinction origin-vs-edit).

- [ ] **1.1** Add a type-level test asserting the new fields are assignable. Create `C:\Users\edwar\travel\app\src\trip\stop-fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Stop } from '../types'

describe('Stop coordinate-provenance fields (Tier 1)', () => {
  it('accepts coordinateSource and locationEditedAt', () => {
    const s: Stop = {
      name: 'X',
      lat: 1,
      lng: 2,
      coordinateSource: 'geocoder',
      locationEditedAt: '2026-06-22T10:00:00.000Z',
    }
    expect(s.coordinateSource).toBe('geocoder')
    expect(s.locationEditedAt).toBe('2026-06-22T10:00:00.000Z')
  })

  it('allows the ai origin and omitting both (back-compat)', () => {
    const ai: Stop = { name: 'Y', coordinateSource: 'ai' }
    const legacy: Stop = { name: 'Z' }
    expect(ai.coordinateSource).toBe('ai')
    expect(legacy.coordinateSource).toBeUndefined()
    expect(legacy.locationEditedAt).toBeUndefined()
  })
})
```

- [ ] **1.2** Run it — it **fails to typecheck** (fields don't exist yet). `cd app && npx vitest run src/trip/stop-fields.test.ts` → expect a TS error / failing run referencing `coordinateSource`.
- [ ] **1.3** Add the fields to `Stop` in `C:\Users\edwar\travel\app\src\types.ts` (insert after the `coords` line ~20, before `wikiTitle`):

```ts
  /**
   * Where this stop's coordinates ORIGINATED — `'ai'` (model-supplied in a
   * suggestion) or `'geocoder'` (resolved by lib/geocode.ts after the fact).
   * Origin only; a later manual relocate does NOT change this (see
   * `locationEditedAt`). Optional/additive — absent on legacy stops.
   */
  coordinateSource?: 'ai' | 'geocoder'
  /**
   * ISO timestamp set when a human manually relocated this stop (Change
   * location). Distinct from `coordinateSource`: it records edit history, not
   * origin, so an AI→relocate sequence keeps the origin while marking the edit.
   * Optional/additive.
   */
  locationEditedAt?: string
```

- [ ] **1.4** Run it — passes. `cd app && npx vitest run src/trip/stop-fields.test.ts` → expect `Test Files 1 passed`, `Tests 2 passed`.
- [ ] **1.5** `cd app && npx tsc -b` (clean). Commit: `Tier 1: add coordinateSource + locationEditedAt to Stop (additive)`.

---

## Task 2 — `lib/geocode.ts`: `geocodePlace` (Photon forward geocoder)

A shared platform helper. `geocodePlace(query: string, near?: string): Promise<{ lat: number; lng: number; address?: string } | null>`. Key-less Photon (mirror `lib/photon.ts`), biases the query with `near` (the trip destination) for disambiguation, never throws (null on miss/error). Pure URL builder + parser, network boundary unit-tested with mocked fetch.

> Note: `lib/photon.ts`'s `parsePhotonPlaces` filters to **place-level** results (cities/regions) and returns labels, not coordinates — wrong for geocoding a specific POI. `geocode.ts` is a **separate** helper that accepts POIs and returns `lat`/`lng`. Mirror photon's *structure* (pure builder/parser + guarded fetch), not its place-only filter.

- [ ] **2.1** Write the failing test `C:\Users\edwar\travel\app\src\lib\geocode.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { geocodeUrl, parseGeocode, geocodePlace } from './geocode'

/** A Photon point feature with geometry + properties. */
const feat = (lng: number, lat: number, properties: Record<string, unknown> = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties,
})

describe('geocodeUrl', () => {
  it('URL-encodes the query, caps limit, asks English', () => {
    const url = geocodeUrl('Eiffel Tower')
    expect(url).toContain('https://photon.komoot.io/api?')
    expect(url).toContain('q=Eiffel+Tower')
    expect(url).toContain('limit=1')
    expect(url).toContain('lang=en')
  })

  it('appends the `near` bias into the query (disambiguation)', () => {
    const url = geocodeUrl('Trastevere', 'Rome, Italy')
    // near is folded into q so Photon ranks the right locality first
    expect(url).toContain('q=Trastevere%2C+Rome%2C+Italy')
  })
})

describe('parseGeocode', () => {
  it('reads lng,lat from the first feature geometry (note GeoJSON order)', () => {
    expect(parseGeocode({ features: [feat(2.2945, 48.8584)] })).toEqual({
      lat: 48.8584,
      lng: 2.2945,
    })
  })

  it('assembles an address label when present', () => {
    const json = {
      features: [feat(-0.1, 51.5, { name: 'Tate Modern', street: 'Bankside', city: 'London', country: 'UK' })],
    }
    expect(parseGeocode(json)).toEqual({
      lat: 51.5,
      lng: -0.1,
      address: 'Bankside, London, UK',
    })
  })

  it('returns null for a miss / garbage / non-finite coords', () => {
    expect(parseGeocode({ features: [] })).toBeNull()
    expect(parseGeocode(null)).toBeNull()
    expect(parseGeocode('nope')).toBeNull()
    expect(parseGeocode({ features: [{ geometry: { coordinates: ['x', 'y'] } }] })).toBeNull()
    expect(parseGeocode({ features: [{ properties: {} }] })).toBeNull() // no geometry
  })
})

describe('geocodePlace', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns null (no fetch) for an empty / whitespace query', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await geocodePlace('   ')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('resolves coords on a good response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ features: [feat(2.2945, 48.8584, { name: 'Eiffel Tower' })] }),
    } as Response)
    expect(await geocodePlace('Eiffel Tower')).toMatchObject({ lat: 48.8584, lng: 2.2945 })
  })

  it('biases the request URL with `near`', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ features: [feat(12.46, 41.89)] }),
    } as Response)
    await geocodePlace('Trastevere', 'Rome, Italy')
    const calledUrl = String((spy.mock.calls[0] ?? [])[0])
    expect(calledUrl).toContain('Trastevere')
    expect(calledUrl).toContain('Rome')
  })

  it('returns null on a non-OK status (miss)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await geocodePlace('Nowhere')).toBeNull()
  })

  it('returns null when fetch throws (network error) — never throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'))
    await expect(geocodePlace('Nowhere')).resolves.toBeNull()
  })
})
```

- [ ] **2.2** Run it — fails (module missing). `cd app && npx vitest run src/lib/geocode.test.ts` → expect "Cannot find module './geocode'".
- [ ] **2.3** Implement `C:\Users\edwar\travel\app\src\lib\geocode.ts`:

```ts
/**
 * Forward geocoding via Photon (komoot) — an OSM-backed, key-less, CORS-enabled
 * geocoder. Resolves a place query (a POI or address, unlike the place-only
 * `lib/photon.ts` autocomplete) into a single `{ lat, lng, address? }`, biased
 * by an optional `near` locality so "Trastevere" disambiguates to Rome.
 *
 * The URL builder + parser are pure (unit-tested); `geocodePlace` wraps them in
 * a guarded `fetch` that NEVER throws — any miss/error resolves to `null`, so
 * callers degrade gracefully (the stop simply earns no pin yet). Shared platform
 * helper: Plan, Guide, destination search and the future location cache use it.
 */

export interface GeoPoint {
  lat: number
  lng: number
  address?: string
}

/** A finite real number, else undefined. */
function finite(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Build the Photon forward-geocode URL for `query`, optionally biased by a
 * `near` locality (folded into the query so Photon ranks the right place first).
 * Caps to a single best result and asks for English labels. URL-encoded.
 */
export function geocodeUrl(query: string, near?: string): string {
  const q = near && near.trim() ? `${query.trim()}, ${near.trim()}` : query.trim()
  const params = new URLSearchParams({ q, limit: '1', lang: 'en' })
  return `https://photon.komoot.io/api?${params.toString()}`
}

/** A Photon point feature, loosely typed. */
interface PhotonFeature {
  geometry?: { coordinates?: unknown }
  properties?: {
    name?: unknown
    street?: unknown
    housenumber?: unknown
    city?: unknown
    state?: unknown
    country?: unknown
  }
}

/** Assemble a compact "<street>, <city>, <country>" label, dropping blanks. */
function addressOf(props: PhotonFeature['properties']): string | undefined {
  if (!props) return undefined
  const street = [str(props.housenumber), str(props.street)].filter(Boolean).join(' ').trim()
  const label = [street, str(props.city) || str(props.state), str(props.country)]
    .filter(Boolean)
    .join(', ')
  return label || undefined
}

/**
 * Parse a Photon GeoJSON response into the first feature's `{ lat, lng,
 * address? }`. GeoJSON coordinates are `[lng, lat]` (note the order). Returns
 * `null` on any miss or shape error — never throws.
 */
export function parseGeocode(json: unknown): GeoPoint | null {
  if (typeof json !== 'object' || json === null) return null
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features) || features.length === 0) return null
  const first = features[0] as PhotonFeature
  const coords = first?.geometry?.coordinates
  if (!Array.isArray(coords)) return null
  const lng = finite(coords[0])
  const lat = finite(coords[1])
  if (lat === undefined || lng === undefined) return null
  const address = addressOf(first.properties)
  return address ? { lat, lng, address } : { lat, lng }
}

/**
 * Resolve `query` to a single `{ lat, lng, address? }`, biased by `near`, or
 * `null`. Guards an empty query (no fetch). Any failure (network, non-OK, bad
 * JSON, no result) resolves to `null` — never throws.
 */
export async function geocodePlace(query: string, near?: string): Promise<GeoPoint | null> {
  const q = query.trim()
  if (!q) return null
  try {
    const res = await fetch(geocodeUrl(q, near))
    if (!res.ok) return null
    const json: unknown = await res.json()
    return parseGeocode(json)
  } catch {
    return null
  }
}
```

- [ ] **2.4** Run it — passes. `cd app && npx vitest run src/lib/geocode.test.ts` → expect `Test Files 1 passed`, `Tests 11 passed`.
- [ ] **2.5** `cd app && npx tsc -b` (clean). Commit: `Tier 1: add shared lib/geocode.ts (Photon forward geocoder, never-throws)`.

---

## Task 3 — `location.ts`: stamp `coordinateSource` (origin) and `locationEditedAt` (edit)

Stamp provenance at the **single mapping site** so each value is set in exactly one place. `placeFromSuggestion` stamps `coordinateSource:'ai'` **only when it carries finite coords** (AI supplied them). `applyLocation` is the manual-relocate path → set `locationEditedAt` to an ISO timestamp, and carry through a `coordinateSource` provided on the `PlaceLocation` (so a geocoder re-pick can stamp `'geocoder'`). To keep `applyLocation` pure/testable, accept an injectable `now` (defaulting to `new Date().toISOString()`).

- [ ] **3.1** Extend `C:\Users\edwar\travel\app\src\trip\location.test.ts` — add at the end:

```ts
describe('placeFromSuggestion — coordinate provenance', () => {
  it('stamps coordinateSource "ai" when finite coords are present', () => {
    expect(placeFromSuggestion({ name: 'X', lat: 48.8584, lng: 2.2945 })).toMatchObject({
      coordinateSource: 'ai',
    })
  })

  it('does NOT stamp a source when there are no coords (typed name)', () => {
    expect(placeFromSuggestion({ name: 'X' }).coordinateSource).toBeUndefined()
  })
})

describe('applyLocation — edit history vs origin', () => {
  it('sets locationEditedAt to the provided ISO timestamp on relocate', () => {
    const next = applyLocation(stop({ name: 'Old' }), { name: 'New' }, '2026-06-22T10:00:00.000Z')
    expect(next.locationEditedAt).toBe('2026-06-22T10:00:00.000Z')
  })

  it('carries a coordinateSource provided on the place (e.g. geocoder re-pick)', () => {
    const next = applyLocation(
      stop({ name: 'Old' }),
      { name: 'New', lat: 1, lng: 2, coordinateSource: 'geocoder' },
      '2026-06-22T10:00:00.000Z',
    )
    expect(next.coordinateSource).toBe('geocoder')
    expect(next.locationEditedAt).toBe('2026-06-22T10:00:00.000Z')
  })

  it('clears a stale coordinateSource when the new place has no coords', () => {
    const s = stop({ name: 'Old', lat: 1, lng: 1, coordinateSource: 'ai' })
    const next = applyLocation(s, { name: 'New' }, '2026-06-22T10:00:00.000Z')
    expect(next.coordinateSource).toBeUndefined()
  })
})
```

- [ ] **3.2** Run it — fails (`coordinateSource`/3rd arg not handled). `cd app && npx vitest run src/trip/location.test.ts` → expect the new cases failing.
- [ ] **3.3** Edit `C:\Users\edwar\travel\app\src\trip\location.ts`:
  - Add `coordinateSource?: 'ai' | 'geocoder'` to the `PlaceLocation` interface (after `coords`, ~line 15).
  - In `placeFromSuggestion`, after setting coords (after line 52), stamp the origin:

```ts
  if (lat !== undefined && lng !== undefined) {
    place.lat = lat
    place.lng = lng
    place.coords = { lat, lng }
    place.coordinateSource = 'ai' // origin: the model supplied these numbers
  }
```

  - Change `applyLocation`'s signature to accept an injectable timestamp and stamp provenance. Replace the signature + return assembly (lines 71–90):

```ts
export function applyLocation(
  stop: Stop,
  place: PlaceLocation,
  now: string = new Date().toISOString(),
): Stop {
  // Drop everything the location owns or derives (incl. the old origin); keep rest.
  const {
    name: _n, type: _t, address: _a, lat: _la, lng: _lo, coords: _c,
    wikiTitle: _w, facts: _f, history: _h, tips: _ti, image: _i,
    coordinateSource: _cs,
    ...preserved
  } = stop
  void _n; void _t; void _a; void _la; void _lo; void _c
  void _w; void _f; void _h; void _ti; void _i; void _cs

  const next: Stop = { ...preserved, name: place.name, locationEditedAt: now }
  if (place.type) next.type = place.type
  if (place.address) next.address = place.address
  if (place.lat !== undefined && place.lng !== undefined) {
    next.lat = place.lat
    next.lng = place.lng
    next.coords = { lat: place.lat, lng: place.lng }
    if (place.coordinateSource) next.coordinateSource = place.coordinateSource
  }
  return next
}
```

  > Destructuring out `coordinateSource: _cs` ensures the **origin is cleared** on relocate unless the new `place` re-supplies one — matching the "no stale source" test. `locationEditedAt` is always set because the function only runs on a manual relocate.

- [ ] **3.4** Run it — passes (existing cases still green). `cd app && npx vitest run src/trip/location.test.ts` → expect all passing (original 13 + new cases).
- [ ] **3.5** `cd app && npx tsc -b` (clean — `StopDetail.tsx:117` calls `applyLocation(current, place)`; the new 3rd arg is defaulted, so it still compiles). Commit: `Tier 1: stamp coordinate provenance at the single mapping site (location.ts)`.

---

## Task 4 — Stale-write guard helper (pure, tested)

A pure function deciding whether an async geocoder result may patch a stop, given the **current** stop state and the **originating** query identity. It may apply **only if** the stop still lacks finite coords **and** still matches the name/address that started the lookup. Lives in `lib/geocode.ts` (alongside the geocoder) so the wiring imports both from one place.

- [ ] **4.1** Add to `C:\Users\edwar\travel\app\src\lib\geocode.test.ts`:

```ts
import { canApplyGeocode } from './geocode'

describe('canApplyGeocode (stale-write guard, last-write-wins)', () => {
  const origin = { name: 'Trastevere', address: 'Rome' }

  it('applies when the stop still lacks coords and still matches the query', () => {
    expect(canApplyGeocode({ name: 'Trastevere', address: 'Rome' }, origin)).toBe(true)
  })

  it('discards when the stop already gained coords (flat)', () => {
    expect(canApplyGeocode({ name: 'Trastevere', address: 'Rome', lat: 41.8, lng: 12.4 }, origin)).toBe(false)
  })

  it('discards when the stop already gained coords (nested)', () => {
    expect(
      canApplyGeocode({ name: 'Trastevere', address: 'Rome', coords: { lat: 41.8, lng: 12.4 } }, origin),
    ).toBe(false)
  })

  it('discards when the user relocated to a different name (race)', () => {
    expect(canApplyGeocode({ name: 'Colosseum', address: 'Rome' }, origin)).toBe(false)
  })

  it('discards when the address changed', () => {
    expect(canApplyGeocode({ name: 'Trastevere', address: 'Florence' }, origin)).toBe(false)
  })

  it('matches when neither has an address (typed name only)', () => {
    expect(canApplyGeocode({ name: 'Foo' }, { name: 'Foo' })).toBe(true)
  })

  it('discards a zero/non-finite placeholder coord as "no coords" → still applies', () => {
    // a 0/0 placeholder is NOT real coords, so the guard still allows the fill
    expect(canApplyGeocode({ name: 'Foo', lat: 0, lng: 0 }, { name: 'Foo' })).toBe(true)
  })
})
```

- [ ] **4.2** Run it — fails (`canApplyGeocode` missing). `cd app && npx vitest run src/lib/geocode.test.ts` → expect new block failing.
- [ ] **4.3** Add to `C:\Users\edwar\travel\app\src\lib\geocode.ts`:

```ts
/** The identity of the unresolved place that initiated a geocoder lookup. */
export interface GeocodeOrigin {
  name: string
  address?: string
}

/** True when a stop already has finite, non-placeholder coordinates. */
function hasFiniteCoords(stop: { lat?: number; lng?: number; coords?: { lat: number; lng: number } }): boolean {
  const lat = stop.lat ?? stop.coords?.lat
  const lng = stop.lng ?? stop.coords?.lng
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) // 0/0 is the suggest placeholder, not a real pin
  )
}

/**
 * Last-write-wins guard: may an in-flight geocoder result patch this stop?
 *
 * Only when the stop STILL lacks real coordinates AND STILL matches the
 * name/address that initiated the lookup. If the user relocated the stop (new
 * name/address) or it otherwise gained coords while the lookup was in flight,
 * the result is stale and MUST be discarded. Kills the
 * create→geocode→relocate→clobber race. Pure + unit-tested.
 */
export function canApplyGeocode(
  current: { name: string; address?: string; lat?: number; lng?: number; coords?: { lat: number; lng: number } },
  origin: GeocodeOrigin,
): boolean {
  if (hasFiniteCoords(current)) return false
  if (current.name !== origin.name) return false
  if ((current.address ?? undefined) !== (origin.address ?? undefined)) return false
  return true
}
```

- [ ] **4.4** Run it — passes. `cd app && npx vitest run src/lib/geocode.test.ts` → expect `Tests 18 passed` (11 + 7).
- [ ] **4.5** `cd app && npx tsc -b` (clean). Commit: `Tier 1: add canApplyGeocode stale-write guard (last-write-wins)`.

---

## Task 5 — Wire the geocoder fallback into `AddStop` + `ChangeLocation`

Call `geocodePlace` **only when coords are absent**, merge resolved coords (+ `coordinateSource:'geocoder'`) before save, and patch fire-and-forget if it resolves after save (guarded by `canApplyGeocode`, mirroring `useLandmarkBackfill`). The immutable patch re-reads the latest trip from the query cache, finds the still-coordless matching stop, and `save({ data })`.

> Leaflet/jsdom can't render here; the **wiring logic is exercised by Tasks 2 & 4's pure helpers**. These steps are integration glue with no new pure unit (do a manual smoke at deploy). Keep them tiny and verify with `tsc -b` + the full suite staying green.

### 5a — `AddStop` typed/coordless path

- [ ] **5.1** In `C:\Users\edwar\travel\app\src\trip\AddStop.tsx`, add a geocoder backfill helper modeled on `useLandmarkBackfill`. First create `C:\Users\edwar\travel\app\src\data\useGeocodeBackfill.ts`:

```ts
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { geocodePlace, canApplyGeocode } from '../lib/geocode'
import { tripKey } from '../trip/useTrip'
import type { Trip, TripData } from '../types'

/**
 * Fire-and-forget coordinate backfill for stops added/typed without coords.
 *
 * After the stop is saved (non-blocking), forward-geocodes its name (biased by
 * the trip destination) and patches `lat`/`lng`/`coords` + `coordinateSource:
 * 'geocoder'` — but ONLY through the `canApplyGeocode` guard: it re-reads the
 * latest trip from the query cache and applies just when the matching stop still
 * lacks coords and still matches the originating name/address. A relocate (or any
 * coords gained) mid-flight discards the result. Writes go through the caller's
 * edit-gated, immutable `save`. Mirrors `useLandmarkBackfill`.
 */
export function useGeocodeBackfill(
  tripId: string | undefined,
  save: (partial: { data: TripData }) => void,
) {
  const qc = useQueryClient()

  const backfillCoords = useCallback(
    (dayIndex: number, name: string, address: string | undefined, near: string) => {
      if (!tripId) return
      void (async () => {
        const point = await geocodePlace(name, near)
        if (!point) return
        const current = qc.getQueryData<Trip>(tripKey(tripId))
        const day = current?.data?.days?.[dayIndex]
        if (!day) return
        const idx = day.stops.findIndex(
          s => s.name === name && (address === undefined || s.address === address) &&
            canApplyGeocode(s, { name, address }),
        )
        if (idx < 0) return
        const data: TripData = {
          ...current!.data,
          days: current!.data.days.map((d, i) =>
            i === dayIndex
              ? {
                  ...d,
                  stops: d.stops.map((s, j) =>
                    j === idx
                      ? { ...s, lat: point.lat, lng: point.lng, coords: { lat: point.lat, lng: point.lng }, coordinateSource: 'geocoder' as const }
                      : s,
                  ),
                }
              : d,
          ),
        }
        save({ data })
      })()
    },
    [tripId, qc, save],
  )

  return { backfillCoords }
}
```

- [ ] **5.2** In `AddStop.tsx`: import `useGeocodeBackfill` and pull `backfillCoords` (next to `backfillStop`, line 37). In `addStop` (after the save + landmark backfill, ~line 104), when the tagged stop has **no** coords, fire the geocoder:

```ts
    // Fire-and-forget: resolve coordinates for a typed / coordless stop so it
    // still earns a pin + walk times. Guarded against the relocate race.
    if (tagged.lat == null && tagged.lng == null) {
      backfillCoords(day, tagged.name, tagged.address, destinationOf(trip))
    }
```

  (`destinationOf` is already imported, line 5. `addTyped` calls `addStop({ name: q })`, so it inherits this automatically.)

- [ ] **5.3** Verify: `cd app && npx tsc -b` clean and `cd app && npm test` green (no test references the removed/added behaviour negatively). Commit: `Tier 1: geocode coordless added stops in AddStop (fire-and-forget, guarded)`.

### 5b — `ChangeLocation` typed re-pick path

- [ ] **5.4** In `C:\Users\edwar\travel\app\src\trip\ChangeLocation.tsx`, the typed re-pick (`pickTyped`, lines 77–81) previews a name with no coords. The geocode happens **on confirm in the caller** so the relocate stamps `locationEditedAt` + (if resolved) `coordinateSource:'geocoder'` through `applyLocation`. Two acceptable wirings — pick the **caller-side** one to keep `ChangeLocation` presentational:
  - In `C:\Users\edwar\travel\app\src\trip\StopDetail.tsx` `handleChangeLocation` (lines 112–119): when `place.lat == null`, after the immediate `save`, fire a guarded geocoder backfill for the relocated stop (reuse `useGeocodeBackfill`'s `backfillCoords` — add the hook to `StopDetail` with `trip.id` + `save`). Pass `near = destinationOf(trip)` (already imported, line 6). The guard's name/address identity = the new place's name/address, so a subsequent relocate still discards a stale result.
- [ ] **5.5** Verify: `cd app && npx tsc -b` clean and `cd app && npm test` green. Commit: `Tier 1: geocode coordless relocations from StopDetail (guarded backfill)`.

---

## Task 6 — Restyle `TripMapView` to the minimap aesthetic

Claret token pins via the **computed** `--sig-btn` + drop-shadow; hide `zoomControl`; refined claret dashed polyline (rounded caps); **muted, low-saturation** per-day differentiation for the "all" overview (not vivid HSL). Keep straight point-to-point lines, the gold Stay pin, the responsive single-instance lifecycle, escaped popups. Leaflet is jsdom-skipped, so extract + unit-test the **pure** `dayColor` only.

- [ ] **6.1** Extract `dayColor` to a pure, testable module and write its test. Create `C:\Users\edwar\travel\app\src\trip\map-style.ts`:

```ts
/**
 * Muted, low-saturation hue per day index for the "all days" map overview.
 * Replaces the old vivid `hsl(…, 65%, 48%)` ramp with a calmer treatment so
 * multi-day overviews stay legible against CARTO tiles and read as one premium
 * map, not a rainbow. Single-day views use the claret signature instead (the
 * caller passes the computed `--sig-btn`); this is only for `scope === 'all'`.
 * Pure + unit-tested.
 */
export function dayColor(day: number, total: number): string {
  const n = Math.max(total, 1)
  const hue = Math.round((day * 360) / n)
  return `hsl(${hue}, 32%, 52%)` // muted saturation, gentle lightness
}
```

  Test `C:\Users\edwar\travel\app\src\trip\map-style.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { dayColor } from './map-style'

describe('dayColor (muted multi-day ramp)', () => {
  it('is deterministic per (day, total)', () => {
    expect(dayColor(0, 3)).toBe(dayColor(0, 3))
  })

  it('spreads hues around the wheel by index', () => {
    expect(dayColor(0, 4)).not.toBe(dayColor(1, 4))
    expect(dayColor(0, 4)).toBe('hsl(0, 32%, 52%)')
  })

  it('uses a MUTED saturation (≤ 40%), not the old vivid 65%', () => {
    const sat = Number(/hsl\(\d+,\s*(\d+)%/.exec(dayColor(2, 5))![1])
    expect(sat).toBeLessThanOrEqual(40)
  })

  it('guards total=0 (no divide-by-zero)', () => {
    expect(dayColor(0, 0)).toBe('hsl(0, 32%, 52%)')
  })
})
```

- [ ] **6.2** Run it — fails (module missing). `cd app && npx vitest run src/trip/map-style.test.ts` → expect "Cannot find module './map-style'".
- [ ] **6.3** Implement `map-style.ts` as above; run it — passes. `cd app && npx vitest run src/trip/map-style.test.ts` → expect `Tests 4 passed`.
- [ ] **6.4** Restyle `C:\Users\edwar\travel\app\src\trip\TripMapView.tsx`:
  - Import the extracted helper: `import { dayColor } from './map-style'` and **delete** the inline `dayColor` (lines 51–55).
  - Read the **computed** claret once inside the render effect (mirror `StopMinimap.tsx:152–155`) — Leaflet writes the polyline color to an SVG `stroke` **attribute** where `var()` won't resolve:

```ts
    const claret =
      getComputedStyle(document.documentElement).getPropertyValue('--sig-btn').trim() || '#8b2942'
```

  Use `claret` in place of the `CLARET` constant for single-day routes/pins, and pass `claret` (not the literal) into `pinIcon`/`stayIcon`. Keep `GOLD` for the Stay glyph (it's the deliberate gold accent; spec line 104 keeps the gold Stay pin). Remove the now-unused `const CLARET = '#8b2942'` (line 58) — or keep it solely as the `|| '#8b2942'` fallback literal inline.
  - Pins → drop-shadow treatment: in `pinIcon` (lines 100–110) and `stayIcon` (lines 74–84), swap the heavy `box-shadow:0 2px 8px rgba(0,0,0,0.4)` for the minimap's `filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))` on the pin wrapper (keep the white border + selected glow). Keep the divIcon HTML approach (jsdom-skipped) but make the **fill** use the passed-in computed `color`.
  - Hide chrome: change `zoomControl: true` → `zoomControl: false` (line 182). Keep `attributionControl: false` + `scrollWheelZoom: false`.
  - Refined polyline (lines 293–299): adopt the minimap treatment — `weight: 3`, `opacity: scope === 'all' ? 0.7 : 0.9`, `dashArray: '1 7'`, and add `lineCap: 'round'`. Color = `scope === 'all' ? dayColor(day, totalDays) : claret`.
  - In the render loop, replace `const color = scope === 'all' ? dayColor(...) : CLARET` (line 291) with the computed `claret` for single-day. Popups already escape user text — leave `esc` intact.
- [ ] **6.5** Verify the rest of the suite still passes (no `TripMapView` render test exists; `map-style.test.ts` covers the extracted pure logic). `cd app && npm test` → expect the full suite green (was 526; now +map-style/geocode/etc.). `cd app && npx tsc -b` clean.
- [ ] **6.6** Commit: `Tier 1: restyle TripMapView to the minimap aesthetic (claret token pins, drop-shadow, hidden chrome, muted multi-day ramp)`.

---

## Task 7 — Remove `StopDetail`'s Navigate button + Google static-map peek

Per the locked principle (the map orients, never navigates), delete the "Navigate" deep-link, the Google static-map peek, and the now-unused `mapsUrl`. Plan keeps **no** external "open in maps" escape hatch. No `StopDetail` test references these (none exists for the component), so this is a deletion + a guard test that the strings are gone.

- [ ] **7.1** Write a content guard test `C:\Users\edwar\travel\app\src\trip\stopdetail-no-nav.test.ts` (a cheap source-level assertion, since the component isn't render-tested under jsdom):

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = readFileSync(fileURLToPath(new URL('./StopDetail.tsx', import.meta.url)), 'utf8')

describe('StopDetail has no external-navigation affordances (Plan = designing)', () => {
  it('has no google.com/maps deep link', () => {
    expect(src).not.toContain('google.com/maps')
  })
  it('has no static-map peek image', () => {
    expect(src).not.toContain('staticmap.openstreetmap.de')
  })
  it('has no "Navigate" CTA', () => {
    expect(src).not.toMatch(/>\s*Navigate\s*</)
  })
})
```

- [ ] **7.2** Run it — fails (strings still present). `cd app && npx vitest run src/trip/stopdetail-no-nav.test.ts` → expect 3 failing.
- [ ] **7.3** Edit `C:\Users\edwar\travel\app\src\trip\StopDetail.tsx`:
  - Delete `mapsUrl` + its `hasCoords`-based ternary (lines 163–167). (Keep `const hasCoords` only if still used elsewhere — it is only used by `mapsUrl` and the peek, so remove `hasCoords` too.)
  - Delete the "Navigate" `<a>` (lines 225–235). The header `flex items-start justify-between` wrapper (line 192) now has a single child — simplify to drop the right-hand slot (the title block becomes the row; remove the trailing `<a>` and the surrounding `justify-between` if it leaves an empty gap, or keep the title left-aligned).
  - Delete the entire "Map peek" block (lines 238–254).
  - Remove `MapPin` from the import **only if** it's now unused — it's still used by the "Change location" button (line 220), so **keep** the import.
- [ ] **7.4** Run it — passes. `cd app && npx vitest run src/trip/stopdetail-no-nav.test.ts` → expect `Tests 3 passed`.
- [ ] **7.5** `cd app && npx tsc -b` clean (watch for an unused-var error on `hasCoords`/`mapsUrl` — remove both). `cd app && npm test` full suite green. Commit: `Tier 1: remove Plan navigation affordances from StopDetail (no external maps)`.

---

## Final verification + deploy

- [ ] Full suite green: `cd app && npm test` (≥ 526 + the new tests — geocode 18, location additions, map-style 4, stop-fields 2, stopdetail-no-nav 3).
- [ ] Typecheck clean: `cd app && npx tsc -b`.
- [ ] Build succeeds: `cd app && npm run build` (one pre-existing chunk-size warning is fine).
- [ ] Manual smoke (dev): add a **typed** stop with no coords → after a moment it gains a pin + walk connector (geocoder fill). Relocate a stop mid-geocode → the user's choice wins (guard discards stale). Plan map shows claret pins + drop-shadow, no zoom control, gold Stay pin; "all days" overview is muted, not rainbow. `StopDetail` has no Navigate button / static map.
- [ ] Deploy: `cd app && npm run build` then `npx wrangler deploy` from repo root. Smoke-test routes return 200 (`/`, `/trips`, a `/trip/:id` Plan view).
- [ ] Update `handoff.md` (Shipped & live) with the Tier-1 entry.

## Definition of done

- [ ] **Suite green** — `cd app && npm test` passes (all new pure-logic tests + the prior suite).
- [ ] **Typecheck clean** — `cd app && npx tsc -b` reports no errors.
- [ ] **Build ok** — `cd app && npm run build` succeeds; deployed via `npx wrangler deploy`.
- [ ] **Navigation removed** — `StopDetail` has no `google.com/maps` link, no `staticmap.openstreetmap.de` peek, no "Navigate" CTA (guarded by `stopdetail-no-nav.test.ts`). Plan exposes **no** external "open in maps".
- [ ] **Every typed / AI-coordless stop gets a pin via the geocoder** — `AddStop` (typed + coordless suggestion) and `StopDetail` relocate fire `geocodePlace` (biased by `destinationOf(trip)`) when coords are absent, then patch immutably with `coordinateSource:'geocoder'`.
- [ ] **Provenance stamped at the single site** — `coordinateSource:'ai'` on AI coords, `'geocoder'` on Photon fills, `locationEditedAt` on manual relocate (origin vs edit kept distinct), all in `location.ts` / the backfill hook.
- [ ] **Stale-write guard verified** — `canApplyGeocode` discards a result after a relocate or once coords exist (`geocode.test.ts`), and the backfill hooks only apply through it.
- [ ] **Map restyled** — computed `--sig-btn` claret pins + drop-shadow, hidden `zoomControl`, refined dashed rounded polyline, muted multi-day `dayColor` (`map-style.test.ts`), gold Stay pin + responsive lifecycle retained.
- [ ] **No OSRM** — walk times remain haversine via `walk.ts`; map lines are straight point-to-point.
- [ ] **Conventions held** — immutable `save`, `canEdit`-gated, additive JSONB, lucide icons, token classes, a11y (≥44px / aria / focus rings), `prefers-reduced-motion`; commit-per-task with the Co-Authored-By trailer on `main`.

---

## Writing-plans self-review

- **Spec coverage:** 1a restyle → Task 6; 1b de-navigation → Task 7; 1c geocoder (`lib/geocode.ts`, provenance, wiring, stale-write guard, graceful miss) → Tasks 2–5; data-model additive fields → Task 1; testing matrix (mocked-fetch geocode, provenance stamping, stale-write guard, `dayColor`) → Tasks 2/3/4/6. The "no map pin yet" graceful-miss copy in `ChangeLocation` (spec line 125) is unchanged — geocoder fills it asynchronously, and on a miss the existing copy stands. ✔
- **No placeholders:** every code block is real, compilable TS/TSX with exact file paths and exact `cd app && npx vitest run <file>` commands + expected output. ✔
- **Type consistency:** new `Stop` fields are optional/additive (Task 1) and `coordinateSource` literals (`'ai' | 'geocoder'`) match across `types.ts`, `location.ts`'s `PlaceLocation`, and the backfill hook (`as const`). `applyLocation`'s new defaulted 3rd arg keeps existing call sites (`StopDetail.tsx:117`) compiling. `dayColor` signature preserved on extraction. ✔
- **Out-of-scope guard:** Tier-2/3 fields (`hours`/`price`/`goodFor`/`bookingRecommendation`/`travelerContext`) are explicitly **not** added here (Task 1 note); no OSRM; Guide's Directions hand-off untouched. ✔
