# Voyager — Guide (Phase 3): "Premium Modern" living companion

> **Status:** Ready to implement · **Date:** 2026-06-20 · **Branch:** `voyager-redesign`
> Replaces the aspirational **Guide teaser** (`trip/Guide.tsx`) with the real Phase-3 experience. Visual fidelity reference: `docs/design/Guide - Premium Modern.html` (the user's approved mockup — image-forward, claret-led, with the exact keyframes `vyPulse` / `vySonar` / `vyEq` / `vySeg`).

## North star

> ### Guide exists to tell travelers *why a place matters*, not *how to get there*.
>
> **Guide is aware of your journey, but not responsible for your navigation.** Voyager owns the *experience* (Context · Sequence · Discovery · Completion). Navigation is delegated to the user's maps app. *"It feels like a Trip listing that woke up and started narrating."*
>
> That one sentence at the top is the north star — when any future feature is proposed, ask whether it serves *why a place matters*. If it's about *how to get there*, it belongs in the maps app, not in Guide.

Core flow: **Open Guide → current stop → Directions (hand off to Maps) → walk → Voyager detects arrival → story surfaces → Mark complete → advance to next.**

## Principles (locked)

- The **stop** stays the atomic object; Guide is a new **lens** over the same `data` — it reads stops and writes only **completion** (`data.completed`). It never reorders/adds/edits the itinerary.
- **One data model, many lenses** — content (photo, enrichment) is cached on the stop; Guide reads it.
- **Extend, don't fork** — reuse `walk.ts`, `landmark*`, `enrich.ts`, `photo.ts`, `useAccountSettings`, the `ai-proxy` pattern, and the Plan/Guide/Trip shell.
- Anti-slop: lucide icons, token theming (claret-led, gold a single accent), a11y, `prefers-reduced-motion`, no layout shift.

## MVP scope

**In:** living **Today checklist** (done/current/upcoming); **image-forward current-stop card** (hero photo + live claret chip + place name + subtitle + Listen + Story/Notice/Experience tabs + Directions + complete); **geolocation** while Guide is open → live distance/ETA + heading to the active stop; **geofence arrival** → auto-surface the **arrival** state (full-bleed photo, sonar ✓, story-first, "Mark complete & continue" + advancing toast); **ElevenLabs narration** ("Listen") with selectable cross-device voice + Web-Speech fallback; motion per the reference.

**Out (deferred, do not build):** turn-by-turn / routed polylines / rerouting (delegated forever); **ambient "you're passing X" discovery** (Phase 3/4 — separate POI + content pipeline); background location tracking.

## Information architecture

- Guide renders inside the existing **`PlannerLayout`** outlet (the Plan/Guide/Trip tab bar + trip header already exist; Guide builds the *content*, not the shell).
- **Which day Guide shows:** during the trip's dates → **today's** day; before the trip → the **selected day** from Plan (the lifted `activeDay` in `PlannerLayout`); after the trip → the **last-viewed** day. Predictable, no extra picker (a small day chip can switch it).
- **Current stop** = the first **non-completed** stop in the active day. Completed stops recede; upcoming stay quiet. Tapping any stop can make it the focused stop (read-only browse), but "current" defaults to first-incomplete.

## States (design every one)

1. **Traveling — active stop** (primary). Progress header (`STOP n OF m`, `DAY k`, segmented bar with current segment pulsing, "n complete · names"); image-forward current-stop card; quiet next-stop row.
2. **Arriving — soft banner** (on geofence, BEFORE the full arrival state). A small, non-blocking banner slides in: **"You're arriving at Rijksmuseum · View Guide →"**. It does **not** hijack the screen — the user may be crossing a street, taking a photo, or texting. Tapping it opens the Arrival state immediately; otherwise it **auto-opens after a few seconds** (~5s). Dismissible.
3. **Arrival** (after the soft banner). Full-bleed hero photo, `YOU'VE ARRIVED` + sonar ✓, place name + mono telemetry, content sheet (Listen row, tabs, story), "Mark complete & continue →" + advancing toast. **Narration does NOT auto-play — the user taps ▶ Listen.**
4. **Geolocation denied / unavailable.** Guide still works: distance/heading/auto-arrival disabled; the live chip becomes a static walk estimate from the previous stop (`walk.ts`); arrival is a **manual** "I'm here" / Mark complete. A subtle one-time "Enable location for live distance & auto-arrival" prompt.
5. **Stop has no coordinates.** Distance/heading/Directions degrade gracefully (Directions falls back to a name query; no geofence).
6. **Not-yet-enriched stop.** Trigger `generateStopDetail` on demand; show a tasteful skeleton for the tabs (mirrors StopDetail today).
7. **No hero photo.** Striped-gradient placeholder (as in the reference), with a "Add a photo" affordance (reuses `photo.ts`).
8. **Empty day / all complete.** Editorial empty + a "day complete" celebration (restrained), with a nudge to the next day.

## Components (`app/src/trip/guide/`)

- `Guide.tsx` — orchestrator: resolves active day + current stop, wires geolocation, switches Traveling ↔ Arrival.
- `GuideProgress.tsx` — `STOP n OF m` + segmented progress bar + "n complete" line.
- `CurrentStopCard.tsx` — the image-forward hero card (photo, live chip, name, subtitle, Listen, tabs, Directions, complete).
- `ArrivalView.tsx` — full-bleed arrival state + toast.
- `StoryTabs.tsx` — Story / Notice / Experience segmented tabs + body (uses `richtext.ts` `formatInline`).
- `ListenButton.tsx` — narration control + equalizer bars (drives `narrate.ts`).
- `UpcomingRow.tsx` — quiet next-stop row.
- Helpers: `geo.ts` (geolocation hook + `bearing()`/compass label), `arrival.ts` (pure geofence predicate), `maps.ts` (pure deep-link builders + device default), `narrate.ts` (TTS client: ElevenLabs proxy + Web-Speech fallback + audio cache).
- Reuse: `walk.ts` (distance/ETA), `landmark.ts`/`landmark-context.ts` (hero photo query), `photo.ts` (`coverPhoto`), `enrich.ts` (content), `TripMapView` (only if a mini-map is wanted in a future pass — the reference is image-forward, so **no map in MVP Guide**), `useAccountSettings` (voice pref).

## Data & types (all additive)

- **Stop enrichment** — extend `StopDetailContent` + `enrich.ts`: add **`notice: string`** ("what travelers miss / what to look for"); keep `history` (→ **Story**) and `tips` (→ **Experience**, re-prompted as "what to do here"). `facts[]` stays (feeds the subtitle detail / optional gold accent). Stored on the stop as today (`stop.history` / `stop.notice` / `stop.tips`). Prompt gains the **destination/city** for disambiguation (parallel to the photo).
- **`config`** — unchanged (uses `config.destination` from the prior spec).
- **`profiles.settings jsonb default '{}'`** (NEW column, additive) — holds cross-device account settings `{ voiceId, theme, units, … }`. `useAccountSettings` reads/writes this (localStorage kept as offline cache + optimistic), so the **narration voice and prefs follow the user across devices**. RLS: user selects/updates **their own** row (`id = auth.uid()`).

## Content sourcing

- **Hero photo** — `coverPhoto(stop)` = `photos[0] ?? image`; if absent, on-demand `fetchLandmarkImage(stopLandmarkQuery(stop.name, destinationOf(trip)))` → **always name + city** (e.g. `"Old Courthouse, St. Louis, Missouri, United States"`); else striped placeholder.
- **Story / Notice / Experience** — AI enrichment via the server-side `ai-proxy` (Claude), cached per stop. Generated on add/open (existing flow); Guide triggers on demand if missing.

## Geolocation, distance, arrival

- `geo.ts`: `navigator.geolocation.watchPosition` **only while Guide is mounted/visible** (cleanup on unmount; respects permission state; never background). Exposes `{ pos, status: 'prompt'|'granted'|'denied'|'unsupported', error }`.
- **Distance/ETA** to the active stop via `walk.ts` (`haversineKm` / `walkMinutes`). **Heading** via a new pure `bearing(from,to)` + 8-point compass label ("NE"); arrow oriented to bearing (north-up; device-compass is a future nicety).
- **Arrival (soft, never aggressive)** — pure `isArrived(pos, stopCoords, radiusM)` (default ~40 m, with hysteresis to avoid flapping). On first arrival for the current stop → show the **soft banner** ("You're arriving at … · View Guide →"), which the user can tap to open now, ignore, or dismiss; if untouched it **auto-opens the Arrival state after ~5s**. **Narration never auto-plays** — the Arrival state shows ▶ Listen and waits for a tap. Manual "I'm here" available when geolocation is off.

## Navigation hand-off — "Directions" opens the device's default maps app (`maps.ts`, pure + tested)

> **LOCKED PRODUCT DECISION (not a temporary limitation):** Guide intentionally contains **no embedded navigation map**. Navigation is delegated to the user's preferred maps application. Do not add a route map, routing, or rerouting — that path ends in accidentally rebuilding Google Maps. The strongest Voyager experience is the elegant chain: **Guide → Open in Maps → Walk → Arrive → Story → Complete → Next.** A map preview is *not* a small addition; it is the first step down the wrong road.

**There is no embedded map in Guide.** The single **Directions** action opens the **device's default maps app** in one tap (no provider menu), via the right URL per platform (no key, no SDK):
- **iOS** → Apple Maps: `https://maps.apple.com/?daddr=<lat>,<lng>&dirflg=w` (or `&q=<name>`).
- **Android** → `geo:<lat>,<lng>?q=<lat>,<lng>(<name>)` so the OS opens whatever maps app is set as default.
- **Desktop / other** → Google Maps web: `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=walking`.
- Coordinate-less stops fall back to a `?q=<name>, <destination>` query. `maps.ts` picks the URL from a small platform check (pure + unit-tested).

## Narration (ElevenLabs, cached, fallback)

- **`narrate` Supabase edge function** (mirrors `ai-proxy`): holds **`ELEVENLABS_API_KEY`** (the only manual secret), receives `{ text, voiceId }`, calls ElevenLabs TTS, returns `audio/mpeg`. CORS + per-IP rate limiting.
- **Cache** generated clips in **Supabase Storage**, keyed by `hash(text + voiceId + modelVersion)` — synthesized **once per story+voice, ever** (the key cost lever). The function uses the auto-injected `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for Storage.
- **Voice selection** — curated client constant `NARRATION_VOICES: { id, name, accent, gender }[]` + `DEFAULT_VOICE_ID`. Selected in **`AccountSettings`** (opened from the Dashboard `AccountMenu`) with a **▶ preview**; stored in `profiles.settings.voiceId` (cross-device). Voice IDs are **not** secrets. Owner-supplied set:
  ```ts
  export const NARRATION_VOICES = [
    { id: 'pXgsayqpmuFfzTsJw2ni', name: 'Matthew',   accent: 'American', gender: 'Male' },
    { id: 'jg80CzGPSxCeNz7dJVDZ', name: 'Tom',       accent: 'Neutral',  gender: 'Male' },
    { id: 'xzZRXG86mSM3naOyL9fa', name: 'Rowan',     accent: 'British',  gender: 'Male' },
    { id: '8Ln42OXYupYsag45MAUy', name: 'Jay Wayne', accent: 'American', gender: 'Male' }, // DEFAULT
    { id: 'wScwPA1qCkWo5R2dmlS8', name: 'Charlotte', accent: 'English',  gender: 'Female' }, // accent: confirm
  ] as const
  export const DEFAULT_VOICE_ID = '8Ln42OXYupYsag45MAUy' // Jay Wayne
  ```
  **Selector display format:** `${name} - ${accent}, ${gender}` → e.g. "Rowan - British, Male" / "Jay Wayne - American, Male". The voice picker (and the whole Guide) follows the owner's `docs/design/Guide - Premium Modern.html` styling.
- **Always user-initiated** — narration **never auto-plays**, anywhere in Guide (traveling or arrival). Premium products respect attention; nothing starts talking unexpectedly. The user taps **▶ Listen**.
- **Fallback** — if the function/key/quota is unavailable, `narrate.ts` falls back to the free on-device **Web Speech** (`speechSynthesis`). Listen always works.
- `narrate.ts` exposes play/pause/stop + "playing" state to drive the equalizer-bar animation. Reads the **active tab's** text.

## Motion / micro-interactions (premium comes from here)

Port the reference keyframes (gated behind `prefers-reduced-motion`): `vyPulse` (live dot), `vySonar` (arrival ring), `vyEq` (equalizer while narrating), `vySeg` (current progress segment). Plus: card **reveal** / story **unfurl** beneath the image, photo **bloom** to full-bleed on arrival, the **advancing toast** slide-in on complete, and a smooth complete→advance transition. Durations 250–600ms, transform/opacity only.

## Backend / operator setup

1. **Migration (additive):** `alter table profiles add column if not exists settings jsonb not null default '{}';` + an RLS policy allowing a user to `update`/`select` their own profile (`id = auth.uid()`). (Narrow + safe — unrelated to the broader trips-RLS task.)
2. **Storage bucket** for narration cache (e.g. `narration`, private; served via signed URLs or proxied).
3. **Secret:** add `ELEVENLABS_API_KEY` (ElevenLabs key scoped to **Text-to-Speech only**).
4. **Deploy** the `narrate` edge function.
   (Wikipedia + Photon + Apple/Google/Waze links remain free/no-key.)

## Testing

Pure + unit-tested: `bearing()` + compass label, `isArrived()` (radius + hysteresis), `maps.ts` deep-link builders + device default, `narrate.ts` cache-key + fallback selection, the `notice` enrichment parse, voice-pref read/write. Component tests for state switching (traveling↔arrival), denied-geolocation degradation, and not-enriched skeleton. Keep the suite green; `npm test && npx tsc -b && npm run build`.

## Build method

Subagent-driven (opus) per task → spec + code-quality review → commit per task → push to `voyager-redesign`. Components built with the **21st.dev Magic MCP** + **ui-ux-pro-max**, using `docs/design/Guide - Premium Modern.html` as the fidelity reference. Verify each task. Update `handoff.md` when shipped; deploy to Cloudflare + ship the edge function.

## Out of scope / phasing

- **Ambient "passing by" discovery** ("You're passing the Old Cathedral…") — **not under consideration until Guide adoption validates the core arrival → story workflow.** It sounds magical but introduces content-moderation surface, battery drain, location noise, and random interruptions — and the arrival flow is *already* the differentiator. Revisit only with adoption data, never speculatively.
- **Never (locked):** an embedded map, turn-by-turn / routed polylines, voice navigation, or rerouting — navigation is delegated to the user's maps app by design (see the LOCKED note above).
- **Deferred (not now):** device-compass heading; offline tiles.
- Broader **trips-RLS hardening** remains its own tracked task (see memory `voyager-rls-ownership-gap`).
