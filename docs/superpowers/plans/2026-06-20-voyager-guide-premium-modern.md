# Guide (Phase 3) "Premium Modern" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Guide teaser with the real Phase-3 living companion — a Today checklist, image-forward current-stop card, geofence soft-arrival, story (Story/Notice/Experience), one-tap Directions hand-off, and ElevenLabs narration — built to `docs/design/Guide - Premium Modern.html`.

**Architecture:** Guide is a new read-mostly **lens** rendered inside `PlannerLayout`'s outlet; it reads `trip`/`activeDay` from `PlannerOutletContext`, writes only `data.completed` via the lifted `save`. New pure helpers (`guide/geo.ts`, `guide/arrival.ts`, `guide/maps.ts`) carry all logic and are unit-tested. Narration goes through a new `narrate` Supabase edge function (ElevenLabs + Storage cache) with a Web-Speech fallback; account settings (incl. the chosen voice) move to a `profiles.settings` JSONB column for cross-device sync.

**Tech Stack:** React 18 + TS + Tailwind (CSS-var tokens), vitest, Supabase (edge functions + Storage + Postgres), Framer Motion / CSS keyframes, lucide. Reuses `walk.ts`, `photo.ts`, `landmark.ts`/`landmark-context.ts`, `enrich.ts`, `ai.ts`, `useAccountSettings`.

**Spec:** `docs/superpowers/specs/2026-06-20-voyager-guide-premium-modern.md` (read first). **Fidelity reference:** `docs/design/Guide - Premium Modern.html`.

**Locked product decisions (do not violate):** no embedded map; narration NEVER auto-plays; arrival is a soft, non-blocking banner that auto-opens after ~5s; ambient discovery is out.

**Per-task verification (run from repo root unless noted):**
```bash
cd app && npm test && npx tsc -b && npm run build
```
Commit per task with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. Push at the end of each task group.

---

## File structure

**New (logic + tests):**
- `app/src/trip/guide/geo.ts` — `bearing()`, `compassLabel()`, `useGeolocation()` hook.
- `app/src/trip/guide/geo.test.ts`
- `app/src/trip/guide/arrival.ts` — `isArrived()` geofence + hysteresis.
- `app/src/trip/guide/arrival.test.ts`
- `app/src/trip/guide/maps.ts` — device-default Directions URL builder.
- `app/src/trip/guide/maps.test.ts`
- `app/src/trip/guide/narrate.ts` — narration client (ElevenLabs proxy + Web-Speech fallback + cache key).
- `app/src/trip/guide/narrate.test.ts`
- `app/src/trip/guide/voices.ts` — `NARRATION_VOICES`, `DEFAULT_VOICE_ID`, `voiceLabel()`.
- `app/src/trip/guide/voices.test.ts`
- `app/src/trip/guide/guide-helpers.ts` — `currentStopIndex()`, `dayForGuide()`, `stopHeroQuery()`.
- `app/src/trip/guide/guide-helpers.test.ts`

**New (components, built to the reference via Magic MCP + ui-ux-pro-max):**
- `app/src/trip/guide/GuideProgress.tsx`, `CurrentStopCard.tsx`, `StoryTabs.tsx`, `ListenButton.tsx`, `UpcomingRow.tsx`, `ArrivingBanner.tsx`, `ArrivalView.tsx`.

**Modified:**
- `app/src/trip/Guide.tsx` — teaser → orchestrator.
- `app/src/trip/enrich.ts` + `app/src/trip/enrich.test.ts` — add `notice`, city grounding.
- `app/src/types.ts` — `Stop.notice?`, `Profile.settings?`.
- `app/src/data/useAccountSettings.ts` (+ test) — add `voiceId`, Supabase backing.
- `app/src/components/AccountSettings.tsx` — voice picker.
- `app/src/index.css` — Guide keyframes.
- `handoff.md`.

**Backend (operator-run, captured in repo):**
- `supabase/functions/narrate/index.ts` — edge function.
- `docs/supabase/2026-06-20-guide-migration.sql` — `profiles.settings` + storage bucket + RLS.

---

## Task Group 1 — Pure helpers

### Task 1: `bearing()` + `compassLabel()`

**Files:**
- Create: `app/src/trip/guide/geo.ts`
- Test: `app/src/trip/guide/geo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/src/trip/guide/geo.test.ts
import { describe, it, expect } from 'vitest'
import { bearing, compassLabel } from './geo'

describe('bearing', () => {
  it('returns ~0° for due north', () => {
    expect(bearing({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 0)
  })
  it('returns ~90° for due east', () => {
    expect(bearing({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 0)
  })
  it('returns ~180° for due south', () => {
    expect(bearing({ lat: 1, lng: 0 }, { lat: 0, lng: 0 })).toBeCloseTo(180, 0)
  })
  it('normalizes into [0,360)', () => {
    const b = bearing({ lat: 0, lng: 0 }, { lat: -1, lng: -0.0001 })
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })
})

describe('compassLabel', () => {
  it('maps degrees to 8-point labels', () => {
    expect(compassLabel(0)).toBe('N')
    expect(compassLabel(45)).toBe('NE')
    expect(compassLabel(90)).toBe('E')
    expect(compassLabel(200)).toBe('SW')
    expect(compassLabel(359)).toBe('N')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/trip/guide/geo.test.ts`
Expected: FAIL — cannot find module `./geo`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/src/trip/guide/geo.ts
import type { LatLng } from '../walk'

/** Initial great-circle bearing from `a` to `b`, degrees in [0,360). Pure. */
export function bearing(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180
  const φ1 = a.lat * toRad
  const φ2 = b.lat * toRad
  const Δλ = (b.lng - a.lng) * toRad
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const deg = (Math.atan2(y, x) * 180) / Math.PI
  return (deg + 360) % 360
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

/** 8-point compass label for a bearing in degrees. Pure. */
export function compassLabel(deg: number): string {
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8
  return POINTS[i]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/trip/guide/geo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/guide/geo.ts app/src/trip/guide/geo.test.ts
git commit -m "feat(guide): bearing + compass label helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2: `useGeolocation()` hook

**Files:**
- Modify: `app/src/trip/guide/geo.ts`
- Test: `app/src/trip/guide/geo.test.ts`

- [ ] **Step 1: Add failing test** (append)

```ts
import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, afterEach } from 'vitest'
import { useGeolocation } from './geo'

describe('useGeolocation', () => {
  afterEach(() => vi.restoreAllMocks())

  it("reports 'unsupported' when geolocation is absent", () => {
    const orig = navigator.geolocation
    // @ts-expect-error force-remove for the test
    delete (navigator as { geolocation?: unknown }).geolocation
    const { result } = renderHook(() => useGeolocation(true))
    expect(result.current.status).toBe('unsupported')
    // @ts-expect-error restore
    navigator.geolocation = orig
  })

  it('reports a granted position from watchPosition', async () => {
    const watch = vi.fn((ok: PositionCallback) => {
      ok({ coords: { latitude: 38.6, longitude: -90.2 } } as GeolocationPosition)
      return 1
    })
    vi.stubGlobal('navigator', { geolocation: { watchPosition: watch, clearWatch: vi.fn() } })
    const { result } = renderHook(() => useGeolocation(true))
    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(result.current.pos).toEqual({ lat: 38.6, lng: -90.2 })
  })

  it('does not watch when disabled', () => {
    const watch = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { watchPosition: watch, clearWatch: vi.fn() } })
    renderHook(() => useGeolocation(false))
    expect(watch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run src/trip/guide/geo.test.ts`
Expected: FAIL — `useGeolocation` not exported.

- [ ] **Step 3: Implement** (append to `geo.ts`)

```ts
import { useEffect, useRef, useState } from 'react'

export type GeoStatus = 'idle' | 'prompt' | 'granted' | 'denied' | 'unsupported'
export interface GeoState { pos: LatLng | null; status: GeoStatus; error: string | null }

/**
 * Watch the device position while `enabled` (Guide is open/visible). Cleans up
 * on unmount / disable. Never tracks in the background. Soft-fails to a status
 * the UI can degrade on.
 */
export function useGeolocation(enabled: boolean): GeoState {
  const [state, setState] = useState<GeoState>({ pos: null, status: 'idle', error: null })
  const idRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState(s => ({ ...s, status: 'unsupported' }))
      return
    }
    setState(s => ({ ...s, status: 'prompt' }))
    const id = navigator.geolocation.watchPosition(
      p => setState({ pos: { lat: p.coords.latitude, lng: p.coords.longitude }, status: 'granted', error: null }),
      err => setState(s => ({ ...s, status: err.code === err.PERMISSION_DENIED ? 'denied' : s.status, error: err.message })),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    idRef.current = id
    return () => { if (idRef.current != null) navigator.geolocation.clearWatch(idRef.current) }
  }, [enabled])

  return state
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run src/trip/guide/geo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/guide/geo.ts app/src/trip/guide/geo.test.ts
git commit -m "feat(guide): useGeolocation watch hook (foreground only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3: `isArrived()` geofence + hysteresis

**Files:**
- Create: `app/src/trip/guide/arrival.ts`
- Test: `app/src/trip/guide/arrival.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/src/trip/guide/arrival.test.ts
import { describe, it, expect } from 'vitest'
import { isArrived, ARRIVE_RADIUS_M, LEAVE_RADIUS_M } from './arrival'

const stop = { lat: 38.6247, lng: -90.1848 } // Old Courthouse

describe('isArrived', () => {
  it('is true within the arrive radius', () => {
    expect(isArrived({ lat: 38.6247, lng: -90.1848 }, stop, false)).toBe(true)
  })
  it('is false far away', () => {
    expect(isArrived({ lat: 38.65, lng: -90.20 }, stop, false)).toBe(false)
  })
  it('hysteresis: stays arrived between arrive and leave radius', () => {
    // ~50m away (between 40m arrive and 80m leave) while already arrived
    const near = { lat: 38.6247 + 0.00045, lng: -90.1848 }
    expect(isArrived(near, stop, true)).toBe(true)   // was arrived → stays
    expect(isArrived(near, stop, false)).toBe(false) // wasn't → not yet
  })
  it('returns false when stop has no coords', () => {
    expect(isArrived({ lat: 38.6, lng: -90.2 }, { lat: undefined, lng: undefined }, false)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run src/trip/guide/arrival.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/src/trip/guide/arrival.ts
import { haversineKm, type LatLng } from '../walk'

/** Enter arrival inside this radius (m). */
export const ARRIVE_RADIUS_M = 40
/** Only leave arrival past this larger radius (m) — hysteresis to avoid flapping. */
export const LEAVE_RADIUS_M = 80

/**
 * Geofence predicate with hysteresis. `wasArrived` is the previous arrival
 * state for this stop: once arrived, stays arrived until past LEAVE_RADIUS_M.
 * Returns false when the stop has no finite coordinates. Pure.
 */
export function isArrived(
  pos: LatLng,
  stop: { lat?: number; lng?: number },
  wasArrived: boolean,
): boolean {
  if (typeof stop.lat !== 'number' || typeof stop.lng !== 'number') return false
  const meters = haversineKm(pos, { lat: stop.lat, lng: stop.lng }) * 1000
  return wasArrived ? meters <= LEAVE_RADIUS_M : meters <= ARRIVE_RADIUS_M
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run src/trip/guide/arrival.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/guide/arrival.ts app/src/trip/guide/arrival.test.ts
git commit -m "feat(guide): isArrived geofence with hysteresis

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4: `maps.ts` — device-default Directions URL

**Files:**
- Create: `app/src/trip/guide/maps.ts`
- Test: `app/src/trip/guide/maps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/src/trip/guide/maps.test.ts
import { describe, it, expect } from 'vitest'
import { directionsUrl } from './maps'

const coords = { lat: 38.6247, lng: -90.1848 }

describe('directionsUrl', () => {
  it('iOS → Apple Maps walking url', () => {
    const u = directionsUrl({ name: 'Old Courthouse', coords, destination: 'St. Louis' }, 'ios')
    expect(u).toContain('maps.apple.com')
    expect(u).toContain('daddr=38.6247,-90.1848')
    expect(u).toContain('dirflg=w')
  })
  it('Android → geo: uri so the default app opens', () => {
    const u = directionsUrl({ name: 'Old Courthouse', coords, destination: 'St. Louis' }, 'android')
    expect(u.startsWith('geo:38.6247,-90.1848')).toBe(true)
    expect(u).toContain('Old%20Courthouse')
  })
  it('desktop → Google Maps walking url', () => {
    const u = directionsUrl({ name: 'Old Courthouse', coords, destination: 'St. Louis' }, 'desktop')
    expect(u).toContain('google.com/maps/dir/')
    expect(u).toContain('destination=38.6247,-90.1848')
    expect(u).toContain('travelmode=walking')
  })
  it('no coords → name+destination query', () => {
    const u = directionsUrl({ name: 'Old Courthouse', destination: 'St. Louis' }, 'desktop')
    expect(u).toContain('query=Old%20Courthouse%2C%20St.%20Louis')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run src/trip/guide/maps.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/src/trip/guide/maps.ts
export type Platform = 'ios' | 'android' | 'desktop'

export interface DirectionsTarget {
  name: string
  destination?: string
  coords?: { lat: number; lng: number }
}

/** Detect the platform from the UA (browser-only; defaults to 'desktop'). */
export function detectPlatform(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

/**
 * Build a "Directions" URL that opens the device's DEFAULT maps app. No embedded
 * map, no provider menu (locked product decision). Coordinate-less stops fall
 * back to a name+destination text query. Pure + tested.
 */
export function directionsUrl(t: DirectionsTarget, platform: Platform): string {
  const enc = encodeURIComponent
  if (t.coords) {
    const { lat, lng } = t.coords
    if (platform === 'ios') return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`
    if (platform === 'android') return `geo:${lat},${lng}?q=${lat},${lng}(${enc(t.name)})`
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`
  }
  const q = enc([t.name, t.destination].filter(Boolean).join(', '))
  if (platform === 'ios') return `https://maps.apple.com/?q=${q}`
  if (platform === 'android') return `geo:0,0?q=${q}`
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run src/trip/guide/maps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/guide/maps.ts app/src/trip/guide/maps.test.ts
git commit -m "feat(guide): device-default Directions url builder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 5: `guide-helpers.ts` — current stop, day selection, hero query

**Files:**
- Create: `app/src/trip/guide/guide-helpers.ts`
- Test: `app/src/trip/guide/guide-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/src/trip/guide/guide-helpers.test.ts
import { describe, it, expect } from 'vitest'
import { currentStopIndex, stopHeroQuery } from './guide-helpers'

describe('currentStopIndex', () => {
  it('returns the first not-completed stop index', () => {
    expect(currentStopIndex(1, ['Hotel', 'Arch', 'Museum'], ['1-0'])).toBe(1)
  })
  it('returns -1 when all complete', () => {
    expect(currentStopIndex(0, ['A', 'B'], ['0-0', '0-1'])).toBe(-1)
  })
  it('returns 0 when nothing complete', () => {
    expect(currentStopIndex(2, ['A'], [])).toBe(0)
  })
})

describe('stopHeroQuery', () => {
  it('appends the destination to the stop name', () => {
    expect(stopHeroQuery('Old Courthouse', 'St. Louis, Missouri, United States'))
      .toBe('Old Courthouse, St. Louis, Missouri, United States')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run src/trip/guide/guide-helpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (reuse existing `isCompleted` + `stopLandmarkQuery`)

```ts
// app/src/trip/guide/guide-helpers.ts
import { isCompleted } from '../helpers'
import { stopLandmarkQuery } from '../landmark-context'

/** First not-completed stop index in `dayIndex`, or -1 if all done. Pure. */
export function currentStopIndex(dayIndex: number, stopNames: string[], completed: string[] | undefined): number {
  for (let i = 0; i < stopNames.length; i++) {
    if (!isCompleted(completed, dayIndex, i)) return i
  }
  return -1
}

/** Wikipedia query for a stop's hero image — ALWAYS name + city. Pure. */
export function stopHeroQuery(stopName: string, destination: string): string {
  return stopLandmarkQuery(stopName, destination)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run src/trip/guide/guide-helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/guide/guide-helpers.ts app/src/trip/guide/guide-helpers.test.ts
git commit -m "feat(guide): current-stop + hero-query helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**End of Group 1 — push:** `git push origin voyager-redesign`. Run full verify: `cd app && npm test && npx tsc -b && npm run build`.

---

## Task Group 2 — Enrichment: add `notice`, city-grounded

### Task 6: Extend `StopDetailContent` + prompt + parser with `notice`

**Files:**
- Modify: `app/src/trip/enrich.ts`
- Modify: `app/src/trip/enrich.test.ts`
- Modify: `app/src/types.ts` (add `notice?: string` to `Stop`)

- [ ] **Step 1: Add failing tests** (append to `enrich.test.ts`)

```ts
import { buildEnrichPrompt, parseStopDetail } from './enrich'

it('prompt includes the destination/city for disambiguation', () => {
  const p = buildEnrichPrompt(
    { name: 'Old Courthouse', lat: 38.6, lng: -90.2 } as never,
    'stl',
    'St. Louis, Missouri, United States',
  )
  expect(p).toContain('St. Louis, Missouri, United States')
  expect(p).toContain('notice')
})

it('parses the new notice field', () => {
  const text = '{"history":"h","facts":["f"],"tips":"t","notice":"Look up at the dome."}'
  expect(parseStopDetail(text).notice).toBe('Look up at the dome.')
})

it('defaults notice to empty when absent', () => {
  expect(parseStopDetail('{"history":"h"}').notice).toBe('')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && npx vitest run src/trip/enrich.test.ts`
Expected: FAIL — `buildEnrichPrompt` has 2 args; `notice` missing.

- [ ] **Step 3: Implement** — update `enrich.ts`:
  1. `StopDetailContent` gains `notice: string`.
  2. `buildEnrichPrompt(stop, tripTitle, destination = '')` adds the destination to the context line and asks for `notice` ("what travelers often miss / what to look for right in front of you").
  3. `parseStopDetail` reads `notice` (default `''`); fallback object includes `notice: ''`.
  4. `generateStopDetail(stop, tripTitle, destination = '')` passes `destination` through.

```ts
export interface StopDetailContent {
  history: string
  facts: string[]
  tips: string
  notice: string
}

export function buildEnrichPrompt(stop: Stop, tripTitle: string, destination = ''): string {
  const placeRef = [stop.name, stop.address].filter(Boolean).join(', ') || stop.name
  const typeHint = stop.type ? ` (a ${stop.type})` : ''
  const cityHint = destination ? ` in ${destination}` : ''
  const tripHint = tripTitle ? ` It's a stop on a trip titled "${tripTitle}".` : ''
  const coordHint =
    stop.lat != null && stop.lng != null
      ? ` The exact location is GPS ${(+stop.lat).toFixed(5)}, ${(+stop.lng).toFixed(5)} — describe the specific place at these coordinates, not a similarly named place elsewhere.`
      : ''
  return `You are an expert, engaging tour guide. Write rich, accurate content for "${placeRef}"${typeHint}${cityHint}.${tripHint}${coordHint}

Cover: a short history (why it matters), a few interesting facts, one "notice" note (what travelers often miss or should look for right in front of them), and practical tips (what to do here).

CRITICAL: Respond with ONLY valid JSON starting with { and ending with }. No markdown, no code fences, no preamble.

{"history":"2-3 short plain-text paragraphs separated by \\n\\n.","facts":["fact with numbers/dates","little-known detail","person/event connection"],"notice":"1-2 sentences: what to look for / what travelers miss.","tips":"1-2 sentences: what to do here."}`
}
```
Update `parseStopDetail` to read/return `notice` (and the `fallback`/plain-text branch to include `notice: ''`). Update `generateStopDetail` signature to accept `destination` and pass it.
Add `notice?: string` to `Stop` in `types.ts` (right after `tips?`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && npx vitest run src/trip/enrich.test.ts && npx tsc -b`
Expected: PASS + clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/enrich.ts app/src/trip/enrich.test.ts app/src/types.ts
git commit -m "feat(enrich): add city-grounded notice field for Guide story

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 7: Thread `notice` + destination through `StopDetail`'s enrich call

**Files:**
- Modify: `app/src/trip/StopDetail.tsx` (the `generateStopDetail(...)` call ~line 132 and the `patchStop({...})`)

- [ ] **Step 1: Update the call** — pass `destinationOf(trip)` and persist `notice`:

```ts
import { destinationOf } from './landmark-context'
// ...
const result = await generateStopDetail(stop as Stop, trip.title, destinationOf(trip))
patchStop({ history: result.history, facts: result.facts, tips: result.tips, notice: result.notice })
```

- [ ] **Step 2: Verify build**

Run: `cd app && npx tsc -b && npm test`
Expected: clean + green (no behavioral test change; StopDetail still renders history/facts/tips).

- [ ] **Step 3: Commit**

```bash
git add app/src/trip/StopDetail.tsx
git commit -m "feat(enrich): persist notice + city context from StopDetail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**End of Group 2 — push.**

---

## Task Group 3 — Narration (voices, client, edge function)

### Task 8: `voices.ts` constant + label

**Files:**
- Create: `app/src/trip/guide/voices.ts`
- Test: `app/src/trip/guide/voices.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/src/trip/guide/voices.test.ts
import { describe, it, expect } from 'vitest'
import { NARRATION_VOICES, DEFAULT_VOICE_ID, voiceLabel, resolveVoiceId } from './voices'

describe('voices', () => {
  it('default is Jay Wayne and present in the list', () => {
    expect(DEFAULT_VOICE_ID).toBe('8Ln42OXYupYsag45MAUy')
    expect(NARRATION_VOICES.some(v => v.id === DEFAULT_VOICE_ID)).toBe(true)
  })
  it('labels as "Name - Accent, Gender"', () => {
    expect(voiceLabel(NARRATION_VOICES.find(v => v.name === 'Rowan')!)).toBe('Rowan - British, Male')
  })
  it('resolveVoiceId falls back to default for unknown/missing', () => {
    expect(resolveVoiceId('nope')).toBe(DEFAULT_VOICE_ID)
    expect(resolveVoiceId(undefined)).toBe(DEFAULT_VOICE_ID)
    expect(resolveVoiceId('pXgsayqpmuFfzTsJw2ni')).toBe('pXgsayqpmuFfzTsJw2ni')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/trip/guide/voices.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// app/src/trip/guide/voices.ts
export interface NarrationVoice { id: string; name: string; accent: string; gender: string }

export const NARRATION_VOICES: readonly NarrationVoice[] = [
  { id: 'pXgsayqpmuFfzTsJw2ni', name: 'Matthew',   accent: 'American', gender: 'Male' },
  { id: 'jg80CzGPSxCeNz7dJVDZ', name: 'Tom',       accent: 'Neutral',  gender: 'Male' },
  { id: 'xzZRXG86mSM3naOyL9fa', name: 'Rowan',     accent: 'British',  gender: 'Male' },
  { id: '8Ln42OXYupYsag45MAUy', name: 'Jay Wayne', accent: 'American', gender: 'Male' },
  { id: 'wScwPA1qCkWo5R2dmlS8', name: 'Charlotte', accent: 'English',  gender: 'Female' },
] as const

export const DEFAULT_VOICE_ID = '8Ln42OXYupYsag45MAUy' // Jay Wayne

export function voiceLabel(v: NarrationVoice): string {
  return `${v.name} - ${v.accent}, ${v.gender}`
}

/** A known voice id, or the default. */
export function resolveVoiceId(id: string | undefined): string {
  return NARRATION_VOICES.some(v => v.id === id) ? (id as string) : DEFAULT_VOICE_ID
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/guide/voices.ts app/src/trip/guide/voices.test.ts
git commit -m "feat(guide): narration voices constant + label

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 9: `narrate.ts` client — cache key + proxy URL + fallback decision

**Files:**
- Create: `app/src/trip/guide/narrate.ts`
- Test: `app/src/trip/guide/narrate.test.ts`

Build the **pure, testable** parts first (cache key, proxy URL, fallback predicate); the audio playback wrapper is thin glue around them.

- [ ] **Step 1: Write the failing test**

```ts
// app/src/trip/guide/narrate.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { narrationCacheKey, narrateProxyUrl, fetchNarrationUrl } from './narrate'

describe('narrationCacheKey', () => {
  it('is stable for same text+voice, differs by voice', () => {
    const a = narrationCacheKey('Hello world', 'v1')
    expect(a).toBe(narrationCacheKey('Hello world', 'v1'))
    expect(a).not.toBe(narrationCacheKey('Hello world', 'v2'))
  })
})

describe('narrateProxyUrl', () => {
  it('points at the narrate function', () => {
    expect(narrateProxyUrl('https://x.supabase.co/')).toBe('https://x.supabase.co/functions/v1/narrate')
  })
})

describe('fetchNarrationUrl', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns null on non-ok so caller falls back to Web Speech', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await fetchNarrationUrl('text', 'v1')).toBeNull()
  })
  it('returns an object URL on success', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:abc' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, blob: async () => new Blob() } as unknown as Response)
    expect(await fetchNarrationUrl('text', 'v1')).toBe('blob:abc')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement** (uses the same auth pattern as `ai.ts`)

```ts
// app/src/trip/guide/narrate.ts
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '../../lib/supabase'

/** Stable cache key for a (text, voice) pair — FNV-1a hex. Pure. */
export function narrationCacheKey(text: string, voiceId: string): string {
  let h = 0x811c9dc5
  const s = `${voiceId}::${text}`
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16)
}

export function narrateProxyUrl(base = SUPABASE_URL): string {
  return `${base.replace(/\/$/, '')}/functions/v1/narrate`
}

async function authToken(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) return data.session.access_token } catch { /* anon */ }
  return SUPABASE_ANON_KEY
}

/**
 * Fetch a playable audio object-URL for `text` in `voiceId` via the narrate
 * proxy (which serves from cache or synthesizes + caches). Returns null on any
 * failure so the caller falls back to Web Speech. Never throws.
 */
export async function fetchNarrationUrl(text: string, voiceId: string): Promise<string | null> {
  try {
    const res = await fetch(narrateProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await authToken()), apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ text, voiceId, key: narrationCacheKey(text, voiceId) }),
    })
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}

/** Web Speech fallback (free, on-device). Returns false if unsupported. */
export function speakFallback(text: string): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false
  const u = new SpeechSynthesisUtterance(text)
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
  return true
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/guide/narrate.ts app/src/trip/guide/narrate.test.ts
git commit -m "feat(guide): narration client (proxy + cache key + Web Speech fallback)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 10: `narrate` Supabase edge function (committed to repo)

**Files:**
- Create: `supabase/functions/narrate/index.ts`

This mirrors `ai-proxy` (per `SUPABASE_SETUP.md`): CORS, per-IP rate limit, server-side key, plus Storage-cached audio. Deployment is an operator step in Group 6.

- [ ] **Step 1: Write the function**

```ts
// supabase/functions/narrate/index.ts
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'narration'
const RATE_LIMIT_PER_HOUR = 120
const rate = new Map<string, { count: number; resetAt: number }>()
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function ok(ip: string) {
  const now = Date.now(); const e = rate.get(ip)
  if (!e || now > e.resetAt) { rate.set(ip, { count: 1, resetAt: now + 3600_000 }); return true }
  if (e.count >= RATE_LIMIT_PER_HOUR) return false
  e.count++; return true
}
async function storageGet(path: string): Promise<ArrayBuffer | null> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { headers: { Authorization: `Bearer ${SERVICE_KEY}` } })
  return r.ok ? await r.arrayBuffer() : null
}
async function storagePut(path: string, body: ArrayBuffer) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' },
    body,
  })
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })
  if (!ELEVENLABS_API_KEY) return new Response('Not configured', { status: 500, headers: CORS })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!ok(ip)) return new Response('Rate limit', { status: 429, headers: CORS })
  let body: { text?: string; voiceId?: string; key?: string }
  try { body = await req.json() } catch { return new Response('Bad JSON', { status: 400, headers: CORS }) }
  const text = (body.text ?? '').slice(0, 5000)
  const voiceId = body.voiceId ?? ''
  const key = body.key ?? ''
  if (!text || !voiceId || !key) return new Response('Missing params', { status: 400, headers: CORS })

  const path = `${voiceId}/${key}.mp3`
  const cached = await storageGet(path)
  if (cached) return new Response(cached, { headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'X-Cache': 'HIT' } })

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  })
  if (!r.ok) return new Response(`TTS failed (${r.status})`, { status: 502, headers: CORS })
  const audio = await r.arrayBuffer()
  await storagePut(path, audio) // fire-and-forget cache; errors ignored
  return new Response(audio, { headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'X-Cache': 'MISS' } })
})
```

- [ ] **Step 2: Verify it parses** (Deno not required locally — review for syntax; the app build does not include `supabase/`).

Run: `cd app && npx tsc -b`
Expected: clean (the `supabase/` folder is outside the app tsconfig).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/narrate/index.ts
git commit -m "feat(narrate): ElevenLabs TTS edge function with Storage cache

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**End of Group 3 — push.**

---

## Task Group 4 — Cross-device account settings + voice picker

### Task 11: `profiles.settings` migration SQL (committed)

**Files:**
- Create: `docs/supabase/2026-06-20-guide-migration.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Cross-device account settings (additive) + narration storage bucket.
alter table profiles add column if not exists settings jsonb not null default '{}'::jsonb;

-- A user reads/updates their own profile row.
drop policy if exists "profile self read" on profiles;
create policy "profile self read"   on profiles for select using (id = auth.uid());
drop policy if exists "profile self update" on profiles;
create policy "profile self update" on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Private bucket for cached narration audio (served via the narrate function only).
insert into storage.buckets (id, name, public) values ('narration','narration', false)
  on conflict (id) do nothing;
```

- [ ] **Step 2: Commit** (run is an operator step in Group 6)

```bash
git add docs/supabase/2026-06-20-guide-migration.sql
git commit -m "chore(db): profiles.settings + narration bucket migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 12: `useAccountSettings` — add `voiceId` + Supabase backing

**Files:**
- Modify: `app/src/data/useAccountSettings.ts`
- Modify: `app/src/data/useAccountSettings.test.ts`
- Modify: `app/src/types.ts` (`Profile.settings?: Record<string, unknown>`)

- [ ] **Step 1: Add failing tests** for the pure parts (`voiceId` survives parse/merge):

```ts
import { parseAccountSettings, mergeAccountSettings } from './useAccountSettings'

it('parses voiceId', () => {
  expect(parseAccountSettings('{"voiceId":"abc"}').voiceId).toBe('abc')
})
it('merge clears voiceId on empty', () => {
  expect(mergeAccountSettings({ voiceId: 'abc' }, { voiceId: '' }).voiceId).toBeUndefined()
})
```

- [ ] **Step 2: Run to verify it fails** — `voiceId` not in type.

- [ ] **Step 3: Implement**
  1. `AccountSettings` interface gains `voiceId?: string`; `parseAccountSettings` reads it (`typeof rec.voiceId === 'string'`).
  2. Add a Supabase read/write layer: on mount (with a `userId`), read `profiles.settings` and seed state (falling back to the localStorage cache for offline/optimistic); on `setSettings`, write through to both localStorage (cache) and `supabase.from('profiles').update({ settings }).eq('id', userId)`. Keep the pure parse/merge/serialize functions unchanged in contract.

```ts
export interface AccountSettings {
  aiModel?: string
  aiKey?: string
  units?: Units
  voiceId?: string
}
// in parseAccountSettings, after units:
if (typeof rec.voiceId === 'string' && rec.voiceId) out.voiceId = rec.voiceId
```
For the hook, add an effect that, when `userId` is set, fetches `select settings from profiles where id = userId`, and if present overlays it on the localStorage seed; and make `setSettings` also persist to Supabase (best-effort, errors ignored — localStorage remains the offline cache). Add `Profile.settings?: Record<string, unknown>` to `types.ts`.

- [ ] **Step 4: Run to verify it passes** — `cd app && npm test && npx tsc -b` → green.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/useAccountSettings.ts app/src/data/useAccountSettings.test.ts app/src/types.ts
git commit -m "feat(settings): cross-device account settings via profiles.settings + voiceId

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 13: Voice picker in `AccountSettings`

**Files:**
- Modify: `app/src/components/AccountSettings.tsx`

- [ ] **Step 1: Implement** a "Narration voice" section: a labelled list/segmented control of `NARRATION_VOICES` rendered as `voiceLabel(v)` ("Rowan - British, Male"), the current value from `settings.voiceId ?? DEFAULT_VOICE_ID`, writing via `setSettings({ voiceId })`. Add a small **▶ preview** button per row that plays a one-line sample via `fetchNarrationUrl(sample, v.id)` (fallback `speakFallback`). Anti-slop: lucide `Play`, token classes, ≥44px rows, `aria-pressed`/labels, light+dark.

- [ ] **Step 2: Verify** — `cd app && npx tsc -b && npm run build` → clean. Manually confirm the section renders in the AccountMenu.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/AccountSettings.tsx
git commit -m "feat(settings): narration voice picker with preview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**End of Group 4 — push.**

---

## Task Group 5 — Guide components (to the reference)

> Build these to `docs/design/Guide - Premium Modern.html` using the **21st.dev Magic MCP** (`mcp__magic__21st_magic_component_builder`) for the presentational scaffolds, then refine to Voyager tokens with **ui-ux-pro-max**. Port the keyframes `vyPulse`/`vySonar`/`vyEq`/`vySeg` into `index.css` (gated by `prefers-reduced-motion`). All components are **presentational** (props in, callbacks out) so logic stays in the helpers/orchestrator and stays testable.

### Task 14: Keyframes + tokens

**Files:** Modify `app/src/index.css`.

- [ ] **Step 1:** Add the four keyframes from the reference (`@keyframes vyPulse|vySonar|vyEq|vySeg`) under a `@media (prefers-reduced-motion: no-preference)` guard. Commit.

```bash
git add app/src/index.css && git commit -m "feat(guide): arrival/listen/progress keyframes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 15: `StoryTabs` + `ListenButton`

**Files:** Create `app/src/trip/guide/StoryTabs.tsx`, `app/src/trip/guide/ListenButton.tsx`.

- [ ] **Step 1:** `StoryTabs` props: `{ story: string; notice: string; experience: string; active: 'story'|'notice'|'experience'; onChange }`. Renders the three mono tabs (claret underline on active) + the active body via `formatInline` (from `richtext.ts`). `ListenButton` props: `{ text: string; voiceId: string }` — manages play/pause via `fetchNarrationUrl`→`<audio>` (fallback `speakFallback`), drives the `vyEq` bars, shows `0:52`-style duration when known. **Never auto-plays.**
- [ ] **Step 2:** Verify `npx tsc -b && npm run build`. Commit.

### Task 16: `GuideProgress` + `UpcomingRow` + `CurrentStopCard`

**Files:** Create the three components.

- [ ] **Step 1:** `GuideProgress` props `{ stopNumber, stopCount, dayLabel, completedCount, completedNames }` → `STOP n OF m`, segmented bar (current segment `vySeg`), "n complete · names". `UpcomingRow` props `{ index, name, meta }`. `CurrentStopCard` props `{ stop, heroUrl, distanceM, etaMin, headingLabel, story, notice, experience, voiceId, onDirections, onComplete }` → image-forward card with the live claret chip (`vyPulse` dot), Fraunces place name, subtitle, `ListenButton`, `StoryTabs`, **Directions** (claret) + ✓ complete. No map.
- [ ] **Step 2:** Verify build. Commit per component or as one "current-stop card" commit.

### Task 17: `ArrivingBanner` + `ArrivalView`

**Files:** Create both.

- [ ] **Step 1:** `ArrivingBanner` props `{ name; onOpen; onDismiss }` — non-blocking slide-in "You're arriving at {name} · View Guide →"; the **auto-open timer lives in the orchestrator** (Task 18), not here. `ArrivalView` props `{ stop, heroUrl, story, notice, experience, voiceId, onComplete }` — full-bleed hero photo, `vySonar` ✓ "YOU'VE ARRIVED", Fraunces name + mono telemetry, content sheet (ListenButton, StoryTabs, body), "Mark complete & continue →" + advancing toast. **No map, no auto-play.**
- [ ] **Step 2:** Verify build. Commit.

### Task 18: `Guide.tsx` orchestrator (replaces the teaser)

**Files:** Modify `app/src/trip/Guide.tsx`.

- [ ] **Step 1:** Replace the teaser. Use `useOutletContext<PlannerOutletContext>()` for `{ trip, canEdit, save, activeDay }`. Compute the active day (today-in-range else `activeDay`), `currentStopIndex(...)`, hero via `coverPhoto(stop) ?? useLandmarkImage(stopHeroQuery(name, destinationOf(trip)))`, live `distanceM`/`etaMin` (`walk.ts`) + `compassLabel(bearing(pos, stop))` from `useGeolocation(true)`. Geofence with `isArrived(...)` (tracking per-stop `wasArrived`): on first arrival → show `ArrivingBanner`, start a ~5s timer to switch to `ArrivalView` (cleared if the user taps/dismisses). **Complete** → `save({ data: { ...data, completed: toggleCompleted(data.completed, dayIndex, stopIndex) } })` then advance. Trigger `generateStopDetail(stop, trip.title, destinationOf(trip))` on demand for the focused stop if `!stop.history` (skeleton while loading), persisting via `save`. Render all states from Group 5; honor `prefers-reduced-motion`.
- [ ] **Step 2:** Verify `cd app && npm test && npx tsc -b && npm run build`. Manually click through traveling → (simulated) arrival → complete.
- [ ] **Step 3:** Commit.

```bash
git add app/src/trip/Guide.tsx app/src/trip/guide/*.tsx app/src/index.css
git commit -m "feat(guide): live companion — checklist, current-stop card, soft arrival

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**End of Group 5 — push.** Run the holistic visual pass against `docs/design/Guide - Premium Modern.html`.

---

## Task Group 6 — Backend, deploy, docs

### Task 19: Operator backend setup (manual, documented)

**Not code — record completion in the commit message / handoff.** Steps for the owner:
1. Supabase SQL editor → run `docs/supabase/2026-06-20-guide-migration.sql`.
2. Edge Functions → secret `ELEVENLABS_API_KEY` (ElevenLabs key, **Text-to-Speech scope only**).
3. Deploy the function: `supabase functions deploy narrate` (or paste `supabase/functions/narrate/index.ts` in the dashboard).
4. Confirm the `narration` Storage bucket exists (created by the migration).

- [ ] **Step 1:** Owner completes 1–4. Smoke-test: open Guide, tap **Listen** → audio plays (first play MISS, replay HIT). Change voice in settings → preview plays.

### Task 20: Build, deploy, handoff

**Files:** Modify `handoff.md`.

- [ ] **Step 1:** `cd app && npm test && npx tsc -b && npm run build` (all green).
- [ ] **Step 2:** Deploy web: `cd app && npm run build && npx wrangler deploy` (from repo root). Smoke-test `/`, `/trips`, `/trip/<id>/guide` return 200.
- [ ] **Step 3:** Update `handoff.md`: move "Phase 3 — the real Guide" to shipped; note the ElevenLabs operator steps + that ambient discovery stays deferred.
- [ ] **Step 4:** Commit + push + tag.

```bash
git add handoff.md
git commit -m "docs(handoff): Guide Phase 3 shipped

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git tag phase-3-guide && git push origin voyager-redesign --tags
```

---

## Self-review notes (addressed)

- **Spec coverage:** checklist/current-stop/arrival/story/Listen/Directions/progress → Tasks 14–18; geolocation/heading/geofence → Tasks 1–3, 18; `notice` + city grounding → Tasks 6–7; narration (proxy+cache+voices+fallback) → Tasks 8–10; cross-device voice settings → Tasks 11–13; soft-arrival + no-auto-play + no-map + ambient-out → enforced in Tasks 17–18 and the component contracts; operator/deploy → Tasks 19–20.
- **Type consistency:** `StopDetailContent` gains `notice` (Task 6) and is consumed in Tasks 7/18; `directionsUrl`/`isArrived`/`bearing`/`compassLabel`/`fetchNarrationUrl`/`resolveVoiceId` names are used verbatim downstream.
- **No embedded map** anywhere; **narration never auto-plays** (stated in Tasks 15/17/18); **soft-arrival timer** lives in the orchestrator (Task 18), not the banner.
