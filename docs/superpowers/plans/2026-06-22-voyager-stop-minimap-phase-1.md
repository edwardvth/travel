# Stop Minimap — Phase 1 (toggle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-toggled **orientation minimap** to the Guide current-stop card — a glance showing *you*, the *destination*, and a *stylized direct path* — with photography staying primary and Directions remaining the only navigation action.

**Architecture:** A pure geometry helper (`minimap-geom.ts`) generates the stylized curved path; a self-contained Leaflet component (`StopMinimap.tsx`) renders the single-stop map reusing the proven `await import('leaflet')` + CARTO stack; `CurrentStopCard` gains a lower-right toggle that crossfades the hero photo ↔ minimap (mounted only in map mode); `Guide` passes the live user position to the focused card only (never the deck peeks/ghost).

**Tech Stack:** React 18 + TypeScript, Leaflet + CARTO tiles (already in repo, lazy), framer-motion, Tailwind CSS-var tokens, lucide-react, vitest.

**Scope:** Phase 1 = the **toggle** only. The auto-discovery teaching morph is **Phase 2** (separate plan); offline is **Phase 3**. Do not build them here.

**Spec:** `docs/superpowers/specs/2026-06-22-voyager-stop-minimap-and-offline-design.md`

**All commands run from `app/`.** Commit trailer on every commit:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `app/src/trip/guide/minimap-geom.ts` | Pure: `stylizedPath(user, dest)` → gentle curved polyline (orientation cue, not routing) | **create** |
| `app/src/trip/guide/minimap-geom.test.ts` | Unit tests for `stylizedPath` | **create** |
| `app/src/trip/guide/StopMinimap.tsx` | Single-stop Leaflet minimap (dest pin, user dot, path, pinch-zoom, skeleton, degraded states) | **create** |
| `app/src/trip/guide/StopMinimap.test.tsx` | jsdom render test (degraded UI; leaflet init is skipped in jsdom) | **create** |
| `app/src/trip/guide/CurrentStopCard.tsx` | Toggle button + photo↔map crossfade; new `enableMinimap`/`userPos` props | **modify** |
| `app/src/trip/Guide.tsx` | Pass `enableMinimap`+`userPos={geo.pos}` to the focused card only | **modify** |

---

### Task 1: Stylized-path geometry helper (TDD)

**Files:**
- Create: `app/src/trip/guide/minimap-geom.ts`
- Test: `app/src/trip/guide/minimap-geom.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { stylizedPath } from './minimap-geom'

const A = { lat: 38.6247, lng: -90.1848 } // user
const B = { lat: 38.6270, lng: -90.1994 } // destination

describe('stylizedPath', () => {
  it('starts at the user and ends at the destination', () => {
    const p = stylizedPath(A, B)
    expect(p[0].lat).toBeCloseTo(A.lat, 9)
    expect(p[0].lng).toBeCloseTo(A.lng, 9)
    expect(p[p.length - 1].lat).toBeCloseTo(B.lat, 9)
    expect(p[p.length - 1].lng).toBeCloseTo(B.lng, 9)
  })

  it('returns segments+1 points (default 25)', () => {
    expect(stylizedPath(A, B)).toHaveLength(25)
    expect(stylizedPath(A, B, 0.12, 10)).toHaveLength(11)
  })

  it('bows off the straight line (the midpoint is offset, not collinear)', () => {
    const p = stylizedPath(A, B)
    const mid = p[Math.floor(p.length / 2)]
    const straightLat = (A.lat + B.lat) / 2
    const straightLng = (A.lng + B.lng) / 2
    // The curved midpoint is measurably off the straight midpoint.
    const off = Math.hypot(mid.lat - straightLat, mid.lng - straightLng)
    expect(off).toBeGreaterThan(1e-4)
  })

  it('collapses to the point when user and destination coincide', () => {
    const p = stylizedPath(A, A)
    expect(p[0].lat).toBeCloseTo(A.lat, 9)
    expect(p[12].lat).toBeCloseTo(A.lat, 9)
    expect(p[p.length - 1].lng).toBeCloseTo(A.lng, 9)
  })

  it('does not mutate its inputs', () => {
    const a = { ...A }, b = { ...B }
    stylizedPath(a, b)
    expect(a).toEqual(A)
    expect(b).toEqual(B)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npx vitest run src/trip/guide/minimap-geom.test.ts`
Expected: FAIL — `Failed to resolve import "./minimap-geom"`.

- [ ] **Step 3: Implement the helper**

```ts
import type { LatLng } from '../walk'

/**
 * Points along a gentle quadratic curve from `user` to `dest` — a stylized
 * **orientation** cue, never a routed path. The control point sits at the
 * midpoint pushed perpendicular to the straight user→dest vector by `curve` ×
 * the segment length, so the line bows slightly (more elegant than a straight
 * segment, still obviously "it's that way"). Returns `segments + 1` points.
 * Pure — does not mutate inputs. (Lat/lng treated as planar; fine at city scale.)
 */
export function stylizedPath(
  user: LatLng,
  dest: LatLng,
  curve = 0.12,
  segments = 24,
): LatLng[] {
  const mLat = (user.lat + dest.lat) / 2
  const mLng = (user.lng + dest.lng) / 2
  const dLat = dest.lat - user.lat
  const dLng = dest.lng - user.lng
  // Control point: midpoint offset along the perpendicular (-dLng, dLat) × curve.
  const cLat = mLat - dLng * curve
  const cLng = mLng + dLat * curve
  const out: LatLng[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const u = 1 - t
    out.push({
      lat: u * u * user.lat + 2 * u * t * cLat + t * t * dest.lat,
      lng: u * u * user.lng + 2 * u * t * cLng + t * t * dest.lng,
    })
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npx vitest run src/trip/guide/minimap-geom.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `cd app && npx tsc -b` → clean.
```bash
git add app/src/trip/guide/minimap-geom.ts app/src/trip/guide/minimap-geom.test.ts
git commit -m "feat(minimap): stylized-path geometry helper (orientation curve)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: StopMinimap component (Leaflet)

**Files:**
- Create: `app/src/trip/guide/StopMinimap.tsx`

Mirrors the proven `TripMapView` Leaflet lifecycle (dynamic `import('leaflet')`, jsdom-safe guard, CARTO light/dark tiles, divIcon pins, `fitBounds`, StrictMode-safe teardown). Single stop: a claret destination pin, a pulsing user dot, the stylized path. Interaction per the spec: **pinch-zoom + double-tap yes, one-finger pan no** (`dragging:false`), so the deck's swipe-to-advance is preserved.

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin } from 'lucide-react'
import { Skeleton } from '../../components/ui/Skeleton'
import { stylizedPath } from './minimap-geom'
import type { LatLng } from '../walk'

/** Claret destination pin (lucide map-pin glyph) as a Leaflet divIcon. */
function destIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: '',
    html:
      '<div style="color:var(--sig-btn);filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))">' +
      '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" stroke="#fff" stroke-width="1.2">' +
      '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#fff" stroke="none"/></svg></div>',
    iconSize: [30, 30],
    iconAnchor: [15, 28],
  })
}

/** Pulsing user-location dot (reuses the global `vyPulse` keyframe, which stills
 *  under prefers-reduced-motion). */
function userIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: '',
    html:
      '<div style="position:relative;width:18px;height:18px">' +
      '<span style="position:absolute;inset:0;border-radius:9999px;background:var(--sig-btn);opacity:.35;animation:vyPulse 1.6s ease-in-out infinite"></span>' +
      '<span style="position:absolute;inset:5px;border-radius:9999px;background:#fff;border:2px solid var(--sig-btn)"></span></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

/**
 * A single-stop **orientation** minimap for the Guide hero. Shows the
 * destination, the user (when located), and a stylized direct path — never a
 * routed/navigation line. Pinch-zoom + double-tap only (no pan), so the swipe
 * deck keeps its one-finger horizontal gesture. Leaflet is dynamically imported
 * (its own chunk) and skipped under jsdom.
 */
export function StopMinimap({
  destination,
  user,
  stopName,
  className,
}: {
  destination: LatLng
  user: LatLng | null
  stopName: string
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Leaflet.Map | null>(null)
  const leafletRef = useRef<typeof Leaflet | null>(null)
  const layerRef = useRef<Leaflet.LayerGroup | null>(null)
  const [ready, setReady] = useState(0)

  // Create the map once (jsdom-safe, StrictMode-safe), like TripMapView.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (typeof window === 'undefined' || typeof el.getBoundingClientRect !== 'function') return
    let cancelled = false
    import('leaflet')
      .then((mod) => {
        if (cancelled || !containerRef.current) return
        const L = (mod as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet)
        leafletRef.current = L
        if (mapRef.current) return
        const map = L.map(containerRef.current, {
          dragging: false, // no pan — preserves the deck's swipe-to-advance
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: false,
          zoomControl: false,
          attributionControl: false,
          keyboard: false,
        }).setView([destination.lat, destination.lng], 15)
        const isLight = document.documentElement.classList.contains('light')
        const tileUrl = isLight
          ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map)
        layerRef.current = L.layerGroup().addTo(map)
        mapRef.current = map
        setReady((n) => n + 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        layerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Draw / redraw the pins + path when the map is ready or the points change.
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    const layer = layerRef.current
    if (!L || !map || !layer) return
    layer.clearLayers()
    // Leaflet writes the polyline color to an SVG `stroke` *attribute*, where a
    // CSS var won't resolve — read the concrete claret value instead. (The
    // divIcons above use var() in a `style` attribute, where it does resolve.)
    const claret =
      getComputedStyle(document.documentElement).getPropertyValue('--sig-btn').trim() || '#B0473F'
    L.marker([destination.lat, destination.lng], { icon: destIcon(L) }).addTo(layer)
    if (user) {
      L.marker([user.lat, user.lng], { icon: userIcon(L) }).addTo(layer)
      L.polyline(stylizedPath(user, destination).map((p) => [p.lat, p.lng] as [number, number]), {
        color: claret,
        weight: 3,
        opacity: 0.9,
        dashArray: '1 7',
        lineCap: 'round',
      }).addTo(layer)
      try {
        const b = L.latLngBounds([
          [user.lat, user.lng],
          [destination.lat, destination.lng],
        ])
        if (b.isValid()) map.fitBounds(b, { padding: [38, 38], maxZoom: 16 })
      } catch {
        /* degenerate bounds — ignore */
      }
    } else {
      map.setView([destination.lat, destination.lng], 15)
    }
  }, [ready, destination.lat, destination.lng, user?.lat, user?.lng])

  const recenter = () => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return
    if (user) {
      const b = L.latLngBounds([
        [user.lat, user.lng],
        [destination.lat, destination.lng],
      ])
      if (b.isValid()) map.fitBounds(b, { padding: [38, 38], maxZoom: 16 })
    } else {
      map.setView([destination.lat, destination.lng], 15)
    }
  }

  return (
    <div className={'relative ' + (className ?? '')}>
      <div
        ref={containerRef}
        className="absolute inset-0 bg-fill"
        role="img"
        aria-label={`Minimap: your location relative to ${stopName}`}
      />
      {ready === 0 && (
        <div className="absolute inset-0" role="status" aria-label="Loading minimap">
          <Skeleton className="absolute inset-0 rounded-none" />
        </div>
      )}
      {ready > 0 && !user && (
        <div className="absolute inset-x-0 bottom-0 px-3 py-2 text-center text-[11px] text-white bg-black/45 backdrop-blur-[3px]">
          Enable location to see where you are
        </div>
      )}
      {ready > 0 && (
        <button
          type="button"
          onClick={recenter}
          aria-label="Recenter minimap"
          className="absolute right-[10px] top-[10px] grid place-items-center w-8 h-8 rounded-full bg-black/45 backdrop-blur-[4px] border border-white/25 text-white cursor-pointer hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <MapPin size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export default StopMinimap
```

- [ ] **Step 2: Typecheck + build (confirm Leaflet stays a separate chunk)**

Run: `cd app && npx tsc -b && npm run build`
Expected: clean tsc; build succeeds; `dist/assets/` still has a `leaflet-src-*.js` chunk (Leaflet stays lazy — `StopMinimap` is imported statically by Guide later but only does `import('leaflet')` at runtime).

- [ ] **Step 3: Commit**

```bash
git add app/src/trip/guide/StopMinimap.tsx
git commit -m "feat(minimap): StopMinimap Leaflet component (pin, user dot, path, pinch-zoom)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: StopMinimap degraded-UI test

**Files:**
- Create: `app/src/trip/guide/StopMinimap.test.tsx`

In jsdom the Leaflet init is skipped (the `getBoundingClientRect` guard), so `ready` stays `0` and the component renders its loading + labelled states — which we can assert without Leaflet.

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StopMinimap } from './StopMinimap'

const DEST = { lat: 38.627, lng: -90.1994 }

describe('StopMinimap (jsdom — leaflet init skipped)', () => {
  it('renders a labelled map region and the loading skeleton', () => {
    render(<StopMinimap destination={DEST} user={null} stopName="Gateway Arch" className="absolute inset-0" />)
    expect(screen.getByRole('img', { name: /your location relative to Gateway Arch/i })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: /loading minimap/i })).toBeInTheDocument()
  })

  it('does not crash when a user position is provided', () => {
    render(<StopMinimap destination={DEST} user={{ lat: 38.6247, lng: -90.1848 }} stopName="Gateway Arch" />)
    expect(screen.getByRole('img', { name: /Gateway Arch/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd app && npx vitest run src/trip/guide/StopMinimap.test.tsx`
Expected: PASS (2 tests). (`ready` is `0` in jsdom, so the skeleton + region render; the "enable location" hint and recenter button are gated behind `ready > 0` and won't appear here — that's expected.)

- [ ] **Step 3: Commit**

```bash
git add app/src/trip/guide/StopMinimap.test.tsx
git commit -m "test(minimap): StopMinimap degraded-UI render test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: CurrentStopCard — toggle + photo↔map crossfade

**Files:**
- Modify: `app/src/trip/guide/CurrentStopCard.tsx`

- [ ] **Step 1: Add imports**

At the top of `CurrentStopCard.tsx`, the current first import is `import type { Stop } from '../../types'` and icons come from `import { Check } from 'lucide-react'`. Add:
```tsx
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Map as MapIcon, Image as ImageIcon } from 'lucide-react'
import { StopMinimap } from './StopMinimap'
import { stopCoords, type LatLng } from '../walk'
```
(Replace the existing `import { Check } from 'lucide-react'` line with the combined lucide import above.)

- [ ] **Step 2: Add the two new props**

In the destructured parameter list add `enableMinimap = false,` and `userPos = null,`; in the props type add:
```tsx
  /** Phase-1 minimap: when true (the focused live card only), show the
   *  orientation-minimap toggle in the hero. Off for deck peeks / the throw ghost. */
  enableMinimap?: boolean
  /** Live user position (from Guide's geolocation) for the minimap; null if unknown. */
  userPos?: LatLng | null
```

- [ ] **Step 3: Add the mode state + derived coords (inside the component body, near the top, after the existing `const dist = …` lines)**

```tsx
  const reduce = useReducedMotion() ?? false
  const [mode, setMode] = useState<'photo' | 'map'>('photo')
  const dest = stopCoords(stop)
  const hasMinimap = enableMinimap && dest != null
  const showingMap = hasMinimap && mode === 'map'
```

- [ ] **Step 4: Replace the hero block**

Replace the existing hero `<div className="relative h-[160px] overflow-hidden bg-raised"> … </div>` (the photo `<img>`/`HeroPlaceholder`, the gradient, the stop-number badge, and the claret chip) with this version, which adds a crossfading map layer + the toggle + an aria-live announcer and keeps the badge/chip/gradient exactly as they were:

```tsx
      {/* Hero */}
      <div className="relative h-[160px] overflow-hidden bg-raised">
        {/* Photo layer (always mounted; fades under the map) */}
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: showingMap ? 0 : 1 }}
          transition={{ duration: reduce ? 0 : 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          {heroUrl ? (
            <img src={heroUrl} alt={stop.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <HeroPlaceholder />
          )}
        </motion.div>

        {/* Map layer — mounted only in map mode (Leaflet only lives while shown) */}
        {showingMap && dest && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: reduce ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <StopMinimap destination={dest} user={userPos ?? null} stopName={stop.name} className="absolute inset-0" />
          </motion.div>
        )}

        {/* Gradient + badge + chip (unchanged, above both layers) */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{ background: 'linear-gradient(180deg,rgba(0,0,0,.28) 0%,transparent 30%,transparent 40%,rgba(0,0,0,.55))' }}
        />
        {stopNumber != null && (
          <span
            className="absolute left-[13px] top-[11px] grid place-items-center min-w-[26px] h-[26px] px-1.5 rounded-full bg-black/45 backdrop-blur-[4px] border border-white/25 font-mono text-[12px] font-semibold text-white"
            aria-label={`Stop ${stopNumber}`}
          >
            {stopNumber}
          </span>
        )}
        <div className="absolute left-[13px] bottom-[11px] inline-flex items-center gap-[7px] font-mono text-[10px] tracking-[0.07em] text-white bg-sig-btn/85 px-2.5 py-[5px] rounded-full backdrop-blur-[4px]">
          <span
            className="w-[6px] h-[6px] rounded-full bg-white"
            style={completed ? undefined : { animation: 'vyPulse 1.4s ease-in-out infinite' }}
            aria-hidden="true"
          />
          {chipParts.join(' · ')}
        </div>

        {/* Minimap toggle (Phase 1) — bottom-right, opposite the chip */}
        {hasMinimap && (
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'photo' ? 'map' : 'photo'))}
            aria-pressed={mode === 'map'}
            aria-label={mode === 'map' ? 'Show photo' : 'Show minimap'}
            className="absolute right-[11px] bottom-[11px] grid place-items-center w-11 h-11 rounded-full bg-black/45 backdrop-blur-[4px] border border-white/25 text-white cursor-pointer transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {mode === 'map' ? <ImageIcon size={17} aria-hidden="true" /> : <MapIcon size={17} aria-hidden="true" />}
          </button>
        )}
        {hasMinimap && (
          <span className="sr-only" aria-live="polite">
            {showingMap ? 'Minimap shown' : 'Photo shown'}
          </span>
        )}
      </div>
```

(Note: the gradient gained `pointer-events-none` so it never blocks the toggle.)

- [ ] **Step 5: Typecheck + run the existing CurrentStopCard test + full suite**

Run: `cd app && npx tsc -b && npm test`
Expected: tsc clean; **all tests pass**. The existing `CurrentStopCard.test.tsx` does not pass `enableMinimap`, so `hasMinimap` is `false` → no toggle, no map → its assertions are unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/src/trip/guide/CurrentStopCard.tsx
git commit -m "feat(minimap): hero photo<->minimap toggle + crossfade in CurrentStopCard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Guide — feed the focused card (only) live position

**Files:**
- Modify: `app/src/trip/Guide.tsx`

Guide renders `CurrentStopCard` in **three** places: the focused `focusedCard`, the two deck peeks (`peekStop` / `prevStop`), and the throw ghost (`SwipeGhost`). Only the **focused** card gets the minimap; peeks/ghost must not mount a map.

- [ ] **Step 1: Enable the minimap on the focused card**

In `Guide.tsx`, find the focused `<CurrentStopCard … />` (the one rendered inside the draggable `focusedCard`, with `onComplete={onComplete}` and `canComplete={canEdit}`). Add two props to it:
```tsx
              enableMinimap
              userPos={geo.pos}
```
(`geo` is the existing `const geo = useGeolocation(true)`; `geo.pos` is the live `LatLng | null`.)

- [ ] **Step 2: Confirm the peeks + ghost do NOT enable it**

The two peek `<CurrentStopCard … />` (rendered with `canComplete={false}` inside the `peekStop` / `prevStop` blocks) and the `SwipeGhost`'s `<CurrentStopCard … />` must **not** receive `enableMinimap`. They already don't — leave them as-is (the prop defaults to `false`, so they render no toggle and mount no Leaflet). Do not add `enableMinimap`/`userPos` to them.

- [ ] **Step 3: Typecheck + full suite + build**

Run: `cd app && npx tsc -b && npm test && npm run build`
Expected: tsc clean; all tests pass (Guide's test trips use coordinate-less stops, so `stopCoords` is null → `hasMinimap` false → no new elements in tests); build succeeds; `leaflet-src-*` chunk still present (lazy).

- [ ] **Step 4: Commit**

```bash
git add app/src/trip/Guide.tsx
git commit -m "feat(minimap): show the orientation minimap on Guide's focused stop only

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Verify, deploy, smoke

**Files:** none.

- [ ] **Step 1: Final green gate**

Run: `cd app && npm test && npx tsc -b && npm run build`
Expected: full suite green (519 baseline + the new minimap-geom (5) + StopMinimap (2) tests = **526**); tsc clean; build succeeds.

- [ ] **Step 2: Deploy**

Run (from repo root): `npx wrangler deploy`
Expected: uploads assets; prints the live URL + version id.

- [ ] **Step 3: Smoke**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}  /trip/stl/guide\n" "https://voyager.edwardvth.workers.dev/trip/stl/guide"
```
Expected: `200`. Then open the live Guide on a phone (or desktop with location): a stop **with coordinates** shows the bottom-right toggle; tapping it crossfades the hero into the minimap (user dot + claret destination pin + stylized path), pinch-zoom works, one-finger horizontal still swipes the deck, Directions still hands off, and a coordinate-less stop shows **no** toggle. Verify light + dark and reduced-motion (instant swap).

- [ ] **Step 4: (No commit)** — deploy is not a code change.

---

## Self-review notes (author)

- **Spec coverage (Phase 1 only):** toggle in the hero (Task 4) · single-stop map with user + destination + stylized path (Tasks 1–2) · Leaflet + CARTO, no new deps, lazy (Task 2) · pinch-zoom yes / pan no (Task 2 Leaflet opts) · graceful degradation: no location → dest-only + hint, no coords → no toggle (Tasks 2 + 4) · premium composition: claret pin/path, hidden chrome, rounded frame, photography primary (Task 2 + the hero crossfade) · a11y: labelled toggle/region/recenter, aria-live, reduced-motion instant swap (Tasks 2 + 4) · focused-card-only, no maps on peeks/ghost (Task 5). **Auto-discovery (Phase 2) and offline (Phase 3) are intentionally excluded.**
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `LatLng` (from `walk.ts`) used throughout; `StopMinimap` props (`destination`/`user`/`stopName`/`className`) match its call site in `CurrentStopCard`; new `CurrentStopCard` props (`enableMinimap`/`userPos`) match the Guide call site; `stylizedPath` signature matches its use in `StopMinimap`.
- **Test impact:** existing `CurrentStopCard.test.tsx` + `Guide.test.tsx` stay green because `enableMinimap` defaults false and the test stops have no coordinates; the only new tests are `minimap-geom` (5) + `StopMinimap` (2).
- **CSS-var color in Leaflet (resolved in the plan):** the polyline reads the concrete `--sig-btn` value via `getComputedStyle` (Leaflet writes it to an SVG `stroke` attribute, where `var()` is unreliable); the divIcons keep `var()` in their `style` attribute (which resolves). Implementer should still eyeball the claret path on both themes during Task 6.
