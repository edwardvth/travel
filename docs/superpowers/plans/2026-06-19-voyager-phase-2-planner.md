# Voyager Phase 2 — Planner Implementation Plan

> **For agentic workers:** executed via superpowers:subagent-driven-development (opus). Each task: implementer → review → commit. Steps use `- [ ]`.

**Goal:** Rebuild the trip **Planner** (currently legacy `Trip.html`) in the new React app + design system, reusing the existing Supabase backend unchanged. Deliver a navigable, data-connected planner: itinerary (day rail + stops), stop detail with AI-generated history/facts/tips, add/search stops, maps, and settings — with autosave + realtime sync.

**Architecture:** New routes under `/trip/:id` in the existing `app/` SPA. Data via `@supabase/supabase-js` + TanStack Query (load + realtime + autosave upsert). Components themed with Voyager tokens. Legacy `Trip.html` stays reachable until cutover; at the end the Dashboard "open trip" switches to `/trip/:id`.

**Tech additions:** `leaflet` (maps, wrapped in React), `@dnd-kit/core` + `@dnd-kit/sortable` (stop reorder).

**Faithfulness rule:** the legacy `C:\Users\edwar\travel\Trip.html` is the behavioral source of truth. Implementers should open it and mirror the exact data shapes, AI prompts, and flows for their surface. **No backend/schema changes.**

---

## Data contract (verified from Trip.html)

- **Load:** `supabase.from('trips').select('*').eq('id', tripId).maybeSingle()` → `{ id, owner_id, title, subtitle, config, data, updated_at }`.
- **Save (edit-gated):** `supabase.from('trips').upsert({ id, title, subtitle, config, data }, { onConflict: 'id' })`. Only when the user `canEdit` (owner OR member OR founder). Debounced autosave on change; `data.savedAt = new Date().toISOString()` stamped on save.
- **Realtime:** subscribe to a channel on the `trips` row (`postgres_changes`, filter `id=eq.<tripId>`); on a remote change with a newer `updated_at`/savedAt than ours, refetch and merge (last-write-wins, mirroring legacy).
- **AI (ai-proxy):** `POST <SUPABASE_URL>/functions/v1/ai-proxy` with headers `{ 'Content-Type':'application/json', Authorization:'Bearer <session access_token>', apikey:<SUPABASE_ANON_KEY> }` and body `{ messages, model: 'claude-sonnet-4-6', max_tokens }`. Response: `{ content: [{ text }] }` → use `content[0].text`. Used to generate a stop's history/facts/tips and to suggest places.
- **Permissions:** founder (profile.role==='founder') OR trip owner (owner_id===user.id) OR member (in `trip_members`) → `canEdit = true`; otherwise view-only.

### Types (extend `app/src/types.ts` if needed — already has Trip/Stop/Day/TripConfig/TripData)
`Stop { name, type?, time?, duration?, lat?, lng?, address?, facts?: string[], history?, tips?, image?, icon?, coords?, wikiTitle?, note? }`
`Day { title, note?, stops: Stop[] }`
`TripData { days: Day[], completed: string[], hotel: unknown|null, savedAt?: string }`
`TripConfig { title?, subtitle?, numDays?, dayLabels?: string[], dayTitles?: string[], startDate? }`
(`completed` entries are `"<dayIndex>-<stopIndex>"` strings, per legacy.)

---

## File structure (new)
```
app/src/trip/
  useTrip.ts           load + realtime + canEdit
  useSaveTrip.ts       debounced autosave (upsert) + sync state
  ai.ts                callAI(messages, opts) -> text   (ai-proxy)
  enrich.ts            generateStopDetail(stop, tripTitle) -> { history, facts[], tips }
  suggest.ts           suggestPlaces(query, tripTitle) -> Stop[]   (ai-proxy; + optional OSM)
  PlannerLayout.tsx    shell: TripHeader + in-trip nav + <Outlet/>
  TripHeader.tsx
  Itinerary.tsx        day rail + stop list (route index)
  DayRail.tsx
  StopList.tsx  StopRow.tsx  (dnd-kit sortable)
  AddStop.tsx          search/suggest/add sheet
  StopDetail.tsx       route /trip/:id/stop/:day/:n
  TripMap.tsx          Leaflet wrapper (route + all)
  Settings.tsx         tabs: Trip / Data / AI / Units (+ members via ShareSheet)
  SyncIndicator.tsx
  helpers.ts           completedKey(d,n), dayHasStops, formatTime, etc.
```
`App.tsx` adds the `/trip/:id/*` nested routes. `Dashboard.tsx` `openTrip` switches to `/trip/:id` (last task).

---

## Tasks

### Task P1 — Trip data layer (load + realtime + canEdit + autosave) + AI client
**Files:** `app/src/trip/useTrip.ts`, `useSaveTrip.ts`, `ai.ts`, `helpers.ts` (+ tests for helpers & ai message-builder).
- `useTrip(tripId)`: TanStack Query loads the trip row; subscribes to realtime `postgres_changes` on `trips` filtered to this id; exposes `{ trip, isLoading, error, canEdit }`. `canEdit` from profile/owner/member (reuse `useProfile`, `useAuth`; query `trip_members` for membership). Clean up the channel on unmount.
- `useSaveTrip(tripId)`: returns `{ save(partial), saving, lastSavedAt }`. `save` merges into the cached trip, debounces (~800ms), stamps `data.savedAt`, and `upsert`s `{ id, title, subtitle, config, data }`. Guards on `canEdit`. Optimistic update of the query cache; reconcile on realtime.
- `ai.ts`: `callAI(messages, { model?, maxTokens? }): Promise<string>` — posts to `ai-proxy` with the verified headers/body, returns `content[0].text` (throws on error). Pure message-builder helpers unit-tested.
- `helpers.ts`: `completedKey(day, stop)`, `isCompleted`, `formatStopTime`, `dayLabel`, etc. Unit-test the pure ones.
- **Acceptance:** loads a real trip; canEdit correct for owner/founder/viewer; save upserts (verify shape) and is debounced + edit-gated; realtime channel subscribes/cleans up; callAI builds the correct request. Tests pass; tsc + build clean.

### Task P2 — Planner shell, routing, header, in-trip nav
**Files:** `PlannerLayout.tsx`, `TripHeader.tsx`; modify `App.tsx`.
- Nested routes: `/trip/:id` → `PlannerLayout` with `<Outlet/>`; index → `Itinerary`; `stop/:day/:n` → `StopDetail`; `map` → `TripMap`; `settings` → `Settings`.
- `PlannerLayout`: loads `useTrip`; shows skeleton while loading; `TripHeader` (back to /trips, trip title in Fraunces, date range, SyncIndicator, share/settings). In-trip nav: **mobile** bottom tab bar (Itinerary · Map · Settings); **desktop** left rail or top segmented. View-only banner when `!canEdit`.
- **Acceptance:** navigating `/trip/<realid>` renders the shell with the trip's title/dates; tabs switch sub-views; back returns to dashboard; loading skeleton; tokens light+dark; a11y (labels, focus). tsc+build clean.

### Task P3 — Itinerary (day rail + stop list + reorder + empty state)
**Files:** `Itinerary.tsx`, `DayRail.tsx`, `StopList.tsx`, `StopRow.tsx`, `AddStop.tsx` (shell only here; search in P5).
- `DayRail`: horizontal chips (mobile) / vertical (desktop) for each day (`config.dayLabels`/`dayTitles`); active day state; shows per-day stop count.
- `StopList`: dense, scannable rows for the active day's stops — thumbnail (stop.image), name, type, time, done-state; tap row → `/trip/:id/stop/:day/:n` (shared-element if practical). **Drag-reorder** via `@dnd-kit/sortable` (edit-only); on reorder, update `data.days[day].stops` order and `save()`.
- Mark-done toggle writes to `data.completed` (`"<day>-<n>"`). Delete stop (edit-only) with confirm.
- Beautiful **empty day** state with an "Add a stop" CTA (and a placeholder "Suggest a day" button — wired in P5).
- **Acceptance:** shows real days/stops; switch days; reorder persists via save; done/delete persist; empty state; view-only hides edit affordances; planning-density (dense rows, not big cards). Tests for the reorder/completed helpers. tsc+build clean.

### Task P4 — Stop detail (display + AI generate + actions)
**Files:** `StopDetail.tsx`, `enrich.ts`.
- Big image (stop.image or a tasteful placeholder), Fraunces title, type/time/address; **history / facts[] / tips** sections. If a stop has none, show a **Generate** button → `generateStopDetail` (ai.ts) → fills history/facts/tips → `save()`. Show graceful **skeletons** while generating; never blank.
- `enrich.ts`: `generateStopDetail(stop, tripTitle)` — mirror the legacy enrich prompt (open Trip.html: find the stop history/facts/tips generation prompt) → returns `{ history, facts: string[], tips }`. Coerce `facts` to an array (legacy guards against string).
- Actions (edit-only): edit time, edit type, mark done, delete; map peek (static map link or mini Leaflet); "navigate" (opens maps URL). Prev/next stop nav.
- **Acceptance:** renders a stop; Generate produces and persists history/facts/tips via ai-proxy; skeletons; actions persist; view-only read-only. tsc+build clean.

### Task P5 — Add / search / suggest stops
**Files:** `AddStop.tsx`, `suggest.ts`.
- Add-stop sheet: a search field → `suggestPlaces(query, tripTitle)` (ai.ts; mirror legacy suggest — it uses ai-proxy and may enrich with coords/OSM). Render results as selectable cards; selecting adds a `Stop` to the active day's `data.days[day].stops` and `save()`.
- "Suggest a day for me" (empty-day CTA): generate a small set of stops for the day.
- **Acceptance:** searching returns suggestions; adding inserts a real stop that persists and appears in the list; reasonable error/empty states in Voyager voice. tsc+build clean.

### Task P6 — Maps (Leaflet route + all)
**Files:** `TripMap.tsx`; add `leaflet` dep + its CSS.
- React wrapper around Leaflet (no react-leaflet needed, but allowed). Route map for the **active day** (markers for stops with lat/lng, polyline in order, fit bounds); an **all-days** toggle (all stops, color per day). Tasteful dark/light tiles. Clicking a marker → stop detail. Handle stops without coords gracefully.
- **Acceptance:** map renders the day's stops with a route line; all-days view; markers clickable; no SSR/teardown leaks (proper map.remove() on unmount); responsive. tsc+build clean.

### Task P7 — Settings (trip basics / hotel / data / AI / units) + members
**Files:** `Settings.tsx`; reuse `ShareSheet`.
- Tabs (mirror legacy 3-tab + units): **Trip** (edit days count + dayLabels/dayTitles, start date, hotel name/details), **Data** (export JSON, import JSON, reset), **AI** (model select default `claude-sonnet-4-6`, optional personal key field stored in config), **Units** (metric/imperial in config). Members box → open `ShareSheet`. All writes via `save()` (edit-gated).
- **Acceptance:** editing days/hotel/start date persists to config/data; export downloads the trip JSON; AI model persists; members/share works; view-only disables edits. tsc+build clean.

### Task P8 — Sync indicator, autosave polish, cutover, QA gate
**Files:** `SyncIndicator.tsx`; modify `Dashboard.tsx` (`openTrip` → `/trip/:id`); worker.js note.
- `SyncIndicator`: shows saving/saved/offline-retry state from `useSaveTrip` (mirror legacy backoff UX, simplified). 
- Switch Dashboard `openTrip(id)` from `location.assign('/Trip.html?trip=...')` to `navigate('/trip/' + id)`. Keep the legacy `/<slug>` Worker redirect (shared links) — but the SPA `/trip/:id` is now the primary. (Leave the legacy Trip.html asset in place as fallback.)
- Full **build/test gate** + Definition-of-Done (docs/IMPLEMENTATION.md): tokens light+dark, a11y, no-regression to dashboard/auth/homepage, reduced-motion, responsive. Run the whole suite + tsc + build.
- **Acceptance:** from the dashboard, opening a trip lands in the NEW planner; create→plan a day→open a stop→generate detail works end-to-end on real data; autosave + sync indicator; everything green.

---

## Deferred to Phase 3 (note, don't build now)
Live walking tour, GPS, camera Identify, photo galleries/upload, weather strip, prebook, travel-time estimates, the story/recap generator. These are Phase 3 per the vision spec.

## Notes for the executor
- Mirror Trip.html for exact AI prompts and data nuances (open it per task).
- Never block on the backend; degrade gracefully (AI errors → friendly message; missing coords → no marker).
- Keep the existing homepage/dashboard/auth untouched except the P8 openTrip switch.
- Commit each task; push to origin at the end (and after P4 as a mid-point checkpoint).
