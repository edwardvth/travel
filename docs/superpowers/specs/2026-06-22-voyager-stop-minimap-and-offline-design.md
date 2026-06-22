# Voyager — Stop Minimap Experience + Offline Trips (design)

> **Status:** Design for review — **two initiatives**, one near-term (Minimap) + one roadmap (Offline). · **Date:** 2026-06-22 · **Branch:** `main`
> Read `CLAUDE.md` (principles, stack, conventions), `handoff.md` (current state), and `docs/superpowers/specs/2026-06-20-voyager-guide-premium-modern.md` (the Guide this builds on) first.
> This is a **planning document**. No implementation until the design — and specifically the locked-decision revision below — is approved. After approval, Phase 1 gets its own step-by-step implementation plan via the writing-plans flow.

---

## North star (for this initiative)

> ### The minimap exists to help a traveler **orient** ("where am I, which way is it?"), never to **navigate**.
> Photography stays the primary visual. The map is a **glance**, secondary and user-controlled — a calm orientation cue, not a maps app. The instant a traveler wants real navigation, they tap **Directions** and hand off to their device's maps app, exactly as today.

When any sub-feature is proposed, ask: *does it help a traveler feel oriented at a glance?* If it's about turn-by-turn, routing, rerouting, or live tracking, it belongs in the maps app — not here.

---

## ⚠️ Relationship to the locked "no embedded map in Guide" decision (read first)

The Guide premium spec (`2026-06-20-voyager-guide-premium-modern.md`, lines 77 & 128) contains an emphatic locked decision:

> **LOCKED PRODUCT DECISION (not a temporary limitation):** Guide intentionally contains **no embedded navigation map**… A map preview is *not* a small addition; it is the first step down the wrong road. **Never (locked):** an embedded map, turn-by-turn / routed polylines, voice navigation, or rerouting.

**This initiative consciously revises that decision** — and must not be read as quietly overriding it. Why the revision is consistent with the *intent* of the lock:

1. **The lock targeted navigation, not orientation.** Every "never" it lists is a *navigation* capability (turn-by-turn, routed polylines, rerouting, voice nav). Its fear was "accidentally rebuilding Google Maps." An **orientation glance** — *am I near it, which direction* — is a different job, and one the lock's own author anticipated: line 56 reads *"`TripMapView` (only if a mini-map is wanted in a future pass)."*
2. **The elegant chain is preserved.** "Guide → Open in Maps → walk → arrive → story → complete → next" stays intact. **Directions remains the only navigation path.** The minimap adds zero routing.
3. **Guardrails are re-drawn, not removed** (below). The minimap is bounded so it *cannot* slide into a maps clone.

**Revised guardrail (supersedes the old line for Guide — pending the user's explicit sign-off, since they authored the lock):**

> Guide contains **no *navigation* map** — no turn-by-turn, no routed/road-snapped polylines, no rerouting, no live turn guidance, no permanent split-screen map. It **may** contain an **orientation minimap**: a user-toggled, single-stop, glanceable view showing *you*, the *destination*, and a *stylized direct path* between them, that always defers real navigation to the device maps app.

### What the minimap IS / IS NOT

| IS | IS NOT |
|---|---|
| A user-toggled glance over the hero | A permanent split-screen image+map |
| One stop at a time (you + the destination) | A multi-stop route/overview map |
| A **stylized direct path** (orientation) | A **routed** walking path / turn-by-turn |
| Premium, photography-still-primary | A raw embedded Google/Leaflet-default look |
| Hand-off to Maps for real navigation | A navigation surface of its own |
| Reduced-motion & a11y respecting | Battery-draining live tracking |

If a future change pulls toward the right column, it's out of scope by definition.

---

# Initiative 1 — Stop Minimap Experience (near-term)

## Where it lives (scope)

**Guide only, Phase 1.** The minimap is the *walking-companion* feature, so it belongs on the Guide current-stop card (`trip/guide/CurrentStopCard.tsx`) — the surface a traveler looks at *while moving*. The **Plan** tab already has the full split-view `TripMapView`; **StopDetail** is a planning/reading surface. Adding the minimap there is explicitly **out of scope** (revisit only if validated in Guide).

## Current problem

The Guide hero is pure destination imagery + guide content (by design — it's beautiful and photography-first). But a walking traveler often needs three fast answers — *Where am I? Where is it? Am I heading the right way?* — and today the only answer is **Directions → switch to Maps**. Many travelers will bounce between Voyager and Apple/Google Maps, breaking the experience. A glanceable orientation minimap keeps them in Voyager for the *awareness* need, while Maps still owns *navigation*.

## UX

### Default state (unchanged hero + one new affordance)

The current-stop card looks exactly as today (hero photo, live claret chip, name/subtitle, Listen, tabs, Directions + ✓), **plus** a small floating **minimap toggle** in the **lower-right of the hero** (mirroring the existing stop-number badge at the top-left). lucide `Map` (or `MapPin`) icon, ≥44px touch target, `aria-pressed`, `aria-label="Show minimap"` / `"Show photo"`, glassy claret/`bg-black/45 backdrop-blur` treatment to match the existing chip/badge.

```
┌─────────────────────────────┐
│ ③                           │   ← stop-number badge (existing, top-left)
│        [ hero photo ]        │
│                             ◉ │  ← minimap toggle (NEW, bottom-right)
│  NOW · 480 m · 6 MIN  ◦      │   ← live claret chip (existing, bottom-left)
└─────────────────────────────┘
   Gateway Arch   …name/tabs/Directions/✓ unchanged…
```

### Minimap mode (toggle)

Tapping the toggle **morphs the hero area** (same rounded 160 px frame) from photo → minimap. The minimap shows:
- **User location** — a pulsing dot (reuse the `vyPulse` keyframe used by the live chip), only when geolocation is granted.
- **Destination** — a claret `MapPin` marker at the stop's coords.
- **A stylized direct path** between them when both are known (see *Route display*).
- **Orientation** — the basemap is north-up; the live chip's heading text (`compassLabel`) already tells the user which way. (No compass rotation in Phase 1 — north-up is calmer and avoids device-orientation permissions.)

The **Directions** action stays exactly where it is and still hands off to the device maps app (`maps.ts` → `directionsUrl`). The minimap never tries to route. Tapping the toggle again returns to the photo.

### Degraded states (reuse Guide's existing graceful-degradation ethos)

| Condition | Minimap behaviour |
|---|---|
| Location denied / unsupported (`GeoState.status`) | Show destination pin + basemap centered on it; a small "Enable location to see where you are" hint; no user dot, no path. |
| Stop has no coordinates (`stopCoords` → null) | Hide the toggle entirely (nothing to orient to) — consistent with how the chip/Directions already degrade for coordinate-less stops. |
| Offline (future) | Cached tiles if the trip is downloaded; otherwise a calm "Map unavailable offline" placeholder. The toggle still works for the cached case. |

## Auto-discovery teaching sequence

Most travelers won't find the toggle. So on the **first advance to a new stop in a trip**, Guide plays a one-time **teaching morph**, then hands control to the user forever after.

**Decision — frequency (recommended):** play the **full sequence once per trip** (the first completion→advance), tracked in `profiles.settings` (cross-device) with a local fallback. Rationale: the 4-stage choreography is ~9 s; running it on *every* advance becomes tedious fast and fights the snappy swipe-deck we just built. A one-time teach delivers the "oh, there's a map" learning without nagging. (Alternatives considered: every advance — too heavy; first-N advances — middle ground; a setting toggle — overkill for v1. Open for the user to override.)

The sequence, only in the `traveling` phase (never during `arriving`/`arrived` — see *Integration*), and only if `prefers-reduced-motion` is *not* set:

| Stage | ~Duration | What | Purpose |
|---|---|---|---|
| 1 — Hero | ~3 s | The new stop's hero photo (the deck advance already landed it) | Destination + excitement |
| 2 — Morph | ~3 s | Hero **crossfades + subtly scales** into the minimap (no hard swap) | "A minimap exists" |
| 3 — Route draw | ~3 s | The stylized path **draws itself**, the destination pin drops, the user dot appears | Communicate orientation value |
| 4 — Return | ~1 s | Minimap morphs back to the hero photo | Hand control to the user |

**Interruption (mandatory):** *any* user input during the sequence — tapping the toggle, swiping the deck, tapping Directions/Listen/a tab, or completing — **immediately cancels** it (clear timers) and yields control. The sequence is a gentle teach, never a modal.

**Reduced motion:** skip Stages 2–4 entirely (no morph, no draw). Optionally show a one-time *static* hint (a brief tooltip near the toggle) so the feature is still discoverable without motion.

## Architecture

### Map provider — phased (decision)

| Option | Now? | Pros | Cons |
|---|---|---|---|
| **A. Leaflet + CARTO raster** (current stack) | **Phase 1 ✅** | Already in repo (`TripMapView`), **no new dep, no API key**, light/dark CARTO themes already used, proven | Raster tiles; offline caching = many PNGs (heavy + licensing limits); styling bounded to CARTO themes |
| B. MapLibre GL + vector (PMTiles / Protomaps / OpenFreeMap) | **Phase 3** (with offline) | Crisp vector, full premium styling control, **efficient offline (one PMTiles file per trip)**, offline-friendly licensing | New ~200 KB+ dependency, a vector-tile source decision, more work |
| C. Static/Directions image API (Mapbox/Google) | ✗ | Trivial | **Paid key** — violates the "no new paid deps/keys" constraint; not interactive |

**Recommendation:** **A now, B when offline lands.** Reuse the existing, key-free Leaflet + CARTO stack for Phase 1 (ships fast, consistent with Plan, zero new deps). Achieve "premium" through *composition*, not a new provider (see *Visual design*). Migrate to vector only when the offline workstream needs efficient, license-clean offline tiles — and only behind the abstraction below, so the UI doesn't change.

### Provider abstraction (the "don't paint ourselves into a corner" seam)

Introduce a thin interface so the renderer is swappable and offline-ready:

```ts
// trip/guide/minimap/types.ts  (illustrative)
interface MinimapView {
  user: LatLng | null         // from useGeolocation
  destination: LatLng         // from stopCoords(stop)
  path: LatLng[] | null       // stylized direct path (Phase 1) — never a routed line
  theme: 'light' | 'dark'
}
interface TileSource {                 // the offline seam
  urlTemplate: string                  // Phase 1: live CARTO; later: cache-first
  attribution?: string
  // Phase 3: getTile(z,x,y) that resolves from a per-trip cache when offline
}
```

`StopMinimap` consumes a `MinimapView` + a `TileSource`. Phase 1 provides a live CARTO `TileSource`; Phase 3 swaps in a cache-backed one (raster cache or a PMTiles/vector source) **without touching the component's props or the Guide UI**.

### New component — `trip/guide/StopMinimap.tsx`

A **trimmed, single-stop** map (not the full `TripMapView`):
- Reuses the proven `await import('leaflet')` dynamic load (keeps Leaflet lazy — it's already its own chunk) and CARTO light/dark tiles selected by theme.
- Renders: a destination `MapPin` marker, a user-location pulsing dot, the stylized path polyline. **No zoom/attribution controls, no scroll-wheel zoom**, minimal/no pan (a glance, not an interactive map). Fit-bounds to comfortably include user + destination.
- Lives inside the hero frame (`absolute inset-0`, rounded to match), beneath the existing chip/badge which stay on top.
- Reuses helpers verbatim: `useGeolocation` (geo.ts), `stopCoords`/`haversineKm`/`walkMinutes` (walk.ts), `bearing`/`compassLabel` (geo.ts). No new geo logic.

This is deliberately separate from `TripMapView` (the Plan split-view map with dnd selection, multi-day scope, popups) — different job, different interaction model. Shared low-level concerns (leaflet load, CARTO tile URLs) can be factored into a tiny shared helper if duplication becomes real; don't over-abstract preemptively.

### Route display (decision)

**Recommendation: a stylized *direct* path, not a routed one.** Draw a polyline from the user to the destination — a straight or gently-curved great-circle line — as an **orientation cue**. Reasons: (1) a real walking route needs a routing service (OSRM self-host / Mapbox / Google — paid or ops burden, and the demo OSRM is not production-licensed); (2) a routed line *is* navigation, which is exactly what the lock protects against. The direct path answers "it's that way, ~6 min" — which is all orientation needs; **Directions** owns the real route. If a routed line is ever wanted, it's a separate, explicitly-scoped decision with a chosen free/licensed source — not assumed here.

### Rendering & mobile performance

- **Mount only when needed:** the Leaflet map mounts only in *map mode* and only for the **focused** stop (never behind every hero, never for the deck-peek neighbours). On toggle-back, keep it warm briefly (a few seconds) then tear down to free memory; re-mount on next toggle.
- **Pre-warm for the morph:** for the auto-sequence crossfade, mount the map *under* the photo (opacity 0) and wait for `ready` before crossfading, so the reveal is smooth (no grey-tile flash). Reuse `TripMapView`'s existing `ready` pattern.
- **Tiles:** CARTO tiles are CDN-cached; the bounded single-stop view loads ~a dozen tiles. Acceptable on mobile data; the offline phase removes even that.
- **One map instance at a time** in Guide (the focused stop). The swipe deck must tear down the previous stop's map on advance.

### Location permission handling

Reuse `useGeolocation(enabled)` — already running while Guide is open. The minimap reads `GeoState`: `granted` → show user dot + path; `denied`/`unsupported` → destination-only + enable hint; `prompt`/`idle` → destination-only until resolved. **No new permission prompts beyond Guide's existing one.** GPS itself works offline (no network needed); only tiles/reverse-geocoding need connectivity.

## State management

A small state machine, owned by the Guide orchestrator (it already owns focus, the swipe deck, and the `phase` machine), ideally extracted to a hook `useStopMinimap(stopKey, phase, reduced)`:

```
mode: 'photo' | 'map'                      // user-controlled toggle, resets to 'photo' on stopKey change
intro: 'idle' | 'photo' | 'map' | 'route'  // the one-time teaching sequence
```

- **Reset on `stopKey` change** (the deck advance) — every new stop starts in `photo`.
- **Toggle** flips `mode` and cancels any running `intro`.
- **Intro trigger:** on the first advance per trip *and* `phase === 'traveling'` *and* not reduced-motion *and* not yet taught → run the staged timers; persist "taught" to `profiles.settings.minimapTaught` (via `useAccountSettings`, cross-device) with a localStorage fallback.
- **Teardown:** clear all intro timers on unmount, stop change, phase change, or any user input.

### Integration with Guide's existing timed flows (critical)

Guide already runs two timed/stateful systems the minimap must coexist with — get the precedence right or they'll fight:

1. **Soft-arrival** (`phase: traveling → arriving → arrived`, geofence + ~5 s auto-open). **Arrival wins.** The minimap intro runs *only* in `traveling`; if a geofence/arrival fires mid-intro, cancel the intro immediately and let arrival take the screen. Don't start an intro when `phase !== 'traveling'`.
2. **The swipe deck** (complete → throw → next hero rises + deck peeks). The intro starts *after* the advance animation settles on the new hero (Stage 1), and **any swipe cancels it** (the deck is the primary interaction; the minimap must never block it).

The minimap toggle/morph also must **not** interfere with the deck peeks (the next/prev cards behind the hero) — the minimap is a layer *within* the focused card's hero, above the photo and below the chip/badge; the peek cards are separate sibling layers and are unaffected.

## Animation system

- **photo ↔ map morph:** framer-motion crossfade + subtle scale (e.g. photo `scale 1→1.04` fading out, map `scale 1.04→1` fading in) over ~0.4 s, `prefers-reduced-motion` → instant swap. Both layers stacked in the hero frame; map pre-mounted + `ready` before the crossfade begins.
- **Route draw:** the stylized path is an **SVG overlay** on the map (Leaflet's polylines can't natively animate "drawing"); animate `stroke-dashoffset` from full→0 (the classic line-draw). Pin **drops** in (`y` + opacity), user dot **fades** in with the `vyPulse` pulse. ~0.8–1.2 s, eased.
- **Interruption:** the state machine cancels all of the above on any user input; animations resolve to their committed end-state instantly (no half-states left on screen).
- **Accessibility:** `prefers-reduced-motion` → no morph, no draw (instant states). `aria-live="polite"` announces "Minimap shown" / "Photo shown". The minimap container has `role="img"`/`aria-label` describing it ("Minimap: your location relative to {stop name}"). The toggle is a labelled, `aria-pressed` button. The auto-intro is non-blocking and fully cancellable, so it never traps a screen-reader/keyboard user.

## Offline compatibility (designed-for, not built yet)

The minimap is built so the offline phase slots in without UI changes:
- **Tiles** flow through the `TileSource` seam. Phase 3 supplies a cache-first source: when a trip is downloaded, snapshot the **bounded tile set** for each stop's orientation view (a small bbox around user-ish + destination at the 2–3 zoom levels used) into the **Cache API**, *or* — preferred — migrate to **vector PMTiles** (one small file per trip) which is dramatically lighter and license-clean for offline. This decision is deferred to Initiative 2 but the seam is here now.
- **Coordinates & the stylized path** are pure math on data already in the trip JSON → they work offline with zero extra caching.
- **Licensing flag:** CARTO/OSM raster tiles have usage policies that *bulk pre-caching for offline can violate*. This is a concrete reason the **offline** phase should favour vector/PMTiles with an offline-permissive license — captured in Initiative 2's risks.

## Visual design requirements

"Premium" comes from **composition over the minimal CARTO basemap**, not a new provider:
- CARTO `light_all` / `dark_all` (already used) — clean, low-clutter, theme-matched.
- **Hide** all default chrome: no attribution watermark (as `TripMapView` already does), no zoom buttons, no scroll-wheel zoom.
- **Claret signature:** the path polyline and the destination `MapPin` use `--sig`/`--sig-btn`; the user dot is a white/claret pulsing dot (reuse `vyPulse`).
- **Frame:** rounded to the hero's radius, the existing top gradient + the chip/badge preserved on top, so photography's visual language carries into map mode.
- Result should read like **Airbnb/Apple trip aesthetics**, not logistics/delivery software. Photography remains dominant — the map is a *mode*, not a permanent fixture.

---

# Initiative 2 — Offline Trip Downloads (roadmap, not for implementation now)

## Vision

A traveler can **download an entire trip** — like Spotify/Google-Maps-offline-areas — and keep using Voyager with **no connectivity**: land abroad, lose service, open the app, keep following the trip.

## What a downloaded trip contains

| Content | Source today | Offline approach |
|---|---|---|
| Itinerary / stops / structure / metadata | Supabase `trips` JSONB | Snapshot the trip row into **IndexedDB** (persisted query cache or an explicit download) |
| Guide content (story/facts/tips) | inline in `data` (enrichment already persisted) | Already in the trip JSON → offline for free once the row is cached |
| User photos | inline data URLs in `data` | Already offline (no external fetch) |
| Hero / cover imagery | external URLs (Wikipedia/Commons/Google Places) | Fetch + store in **Cache API** at download time |
| **Minimap tiles** | live CARTO (Phase 1) | Per-trip bounded raster cache, *or* **vector PMTiles** bundle (preferred — lighter, license-clean) |
| Narration audio (optional) | ElevenLabs via `narrate` edge fn (already Storage-cached) | Optionally pre-fetch + cache per stop |

## Offline goals

A traveler should be able to: land in another country → lose service → open Voyager → **continue following their trip** (itinerary, stops, guide content, imagery, orientation minimap) without connectivity.

## Online-only (document as out-of-offline-scope)

AI chat, live recommendations, real-time/enrichment-on-demand, sync operations, live weather, and any new content generation remain **online-only**. (Live GPS works offline; only tiles and any network lookups don't.) The offline experience is **read/follow**, not author/generate.

## Architecture considerations

- **Hard dependency: a Service Worker (workstream #2).** There is currently **no SW registered in the React app** (verified). Offline needs the SW for app-shell/code-chunk caching. The **code-splitting we just shipped helps** — the SW can precache the small entry + lazily cache route chunks. Offline trips should be **sequenced after the SW/PWA workstream**.
- **App shell:** SW precache entry + critical chunks; cache route chunks on first visit (works with the `ChunkErrorBoundary` already in place for stale-chunk recovery).
- **Trip data:** an explicit **"Download for offline"** action snapshots the trip (config + data) into IndexedDB; the app reads cache-first when offline. Reconcile on reconnect (the realtime/`mergeRealtimeTrip` last-write-wins logic already models this).
- **Imagery & tiles:** Cache API for hero URLs; PMTiles/vector for minimap tiles (see licensing). Respect `navigator.storage.estimate()`; show size before download; allow delete.
- **Download UX:** a "Download for offline" affordance on **Trip** (and/or Dashboard trip card), a progress indicator, a stored-size readout, and a **manage/delete** surface. Clear offline indicator when running cached.

## Risks (offline)

- **Storage quotas & eviction** (browsers evict caches under pressure) → request persistent storage, show sizes, let users manage.
- **Tile licensing** for bulk offline caching (CARTO/OSM) → favour vector/PMTiles with an offline-permissive license.
- **Staleness/sync** → last-write-wins on reconnect (already designed); show "last updated offline".
- **Scope creep** → keep offline strictly **read/follow**; generation stays online.

---

# Risks & tradeoffs (consolidated)

| Risk | Mitigation |
|---|---|
| **Reversing the locked "no map" decision slides Guide toward a maps clone** | Re-drawn guardrails + the IS/IS-NOT table; orientation-only; Directions remains the sole navigation path; routing explicitly out. |
| Auto-discovery choreography becomes tedious | Teach **once per trip**, then user-driven; fully cancellable; reduced-motion skips it. |
| Real routing dependency (paid/ops) | **Stylized direct path** only — no routing service. |
| Premium feel hard on raster tiles | Composition (claret path/pin, hidden chrome, rounded frame) over the clean CARTO basemap; vector later. |
| Map perf/battery on mobile | Mount only in map-mode for the focused stop; tear down after; one instance; GPS already running. |
| Painting ourselves out of offline | `TileSource` seam now; vector/PMTiles migration deferred but unblocked. |
| Offline blocked on missing SW | Sequence offline **after** the PWA/SW workstream (#2); code-splitting already eases SW precaching. |
| Tile licensing for offline bulk caching | Vector/PMTiles with offline-permissive license in the offline phase. |

---

# Phased rollout

**Phase 1 — Minimap toggle (near-term, this initiative's MVP)**
Hero gets a minimap **toggle**; map mode shows user + destination + **stylized path**, premium-styled, Directions still hands off. Online CARTO via the `TileSource`/`MinimapView` seam. Per-stop mode state; graceful degradation. **No auto-discovery yet.** Acceptance: toggle works, degrades cleanly (denied location / no coords), photography stays primary, a11y + reduced-motion, no perf regression, tests green, deploy + smoke.

**Phase 2 — Auto-discovery teaching sequence**
The 4-stage morph + route-draw on the first advance per trip; reduced-motion + interruption handling; integrates with the arrival/swipe precedence; "taught" persisted in `profiles.settings`. Acceptance: plays once, never fights arrival/swipe, fully cancellable, reduced-motion path.

**Phase 3 — Offline-ready minimap (with the offline/SW workstream)**
Migrate the `TileSource` to vector/PMTiles (or a bounded raster cache); minimap tiles become part of trip download. Gated on Initiative 2 + workstream #2 (SW/PWA).

**Initiative 2 — Offline Trip Downloads** is its own future spec, sequenced after the SW/PWA workstream; this document captures its vision + architecture so Phase 1 doesn't preclude it.

---

# Open decisions — need sign-off before implementation

1. **Revise the locked "no embedded map in Guide" decision** to the re-drawn *orientation-minimap* guardrail above. *(Recommended: yes — it preserves the lock's intent.)*
2. **Map provider:** Leaflet + CARTO now, vector/PMTiles at the offline phase. *(Recommended.)*
3. **Route display:** stylized direct path, no routing. *(Recommended.)*
4. **Auto-discovery frequency:** teach once per trip. *(Recommended; alternatives noted.)*
5. **Scope:** minimap in **Guide only** for Phase 1 (not Plan/StopDetail). *(Recommended.)*

# Out of scope (this initiative)

Turn-by-turn / routed polylines / rerouting / voice navigation (delegated forever to the maps app); permanent split-screen map; compass/device-orientation rotation (Phase 1 is north-up); ambient "you're passing X" discovery (still deferred per the Guide spec); minimap on Plan/StopDetail; offline *implementation* (roadmap only here).
