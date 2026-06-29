# Stop chips (hours · price · good-for) + day-utilization caption — Design

> **Status:** approved 2026-06-29. Branch `tier3-chips-caption` (worktree off `main`).
> A slimmed subset of Tier 3 (`docs/superpowers/plans/2026-06-22-voyager-plan-parity-tier-3-content-and-days.md`). This spec is the source of truth for *this* slice.

## Goal

Two independent, additive improvements to the Plan surface:

1. **Stop chips** — show **opening hours** + **price** (from the **Google Places API**, authoritative) and a **good-for** tag (from AI) as compact chips on `StopDetail`, appended to the existing kind/reservation chip row.
2. **Day-utilization caption** — a tiny one-line caption on each Plan day header ("6 stops · ~8h planned") with a subtle overload cue when a day is over-packed.

## Non-goals (explicitly out of scope)

- **Per-stop hourly weather** — cut (screen clutter; per-day weather already exists).
- **The facts/`notice` parity rework, maxTokens/grounding changes** — owned by the concurrent `enrichment-cache` thread; untouched here.
- **Day add/remove/reorder editing** — already shipped (`day-mutations.ts`).
- **Folding hours/price into the `enrich-place` cache** — that is the `placeid-backfill` thread's territory. This slice is deliberately **standalone** (Option 2): its own small Places call, keyed off `stop.placeId` when present, Text-Search fallback by name. When the backfill lands and populates `placeId`s, this feature benefits automatically. Some duplication of the Places call is accepted as the cost of independence.

## Decisions (locked with the owner)

- Hours + price come from **Google Places**, not AI (an LLM can't be trusted on current opening hours — violates the project's "never fabricate" rule). `goodFor` stays **AI** (subjective; no API has it).
- Chips sit on the **same row** as the kind/reservation chips; they **wrap on mobile** when they don't fit (the row is already `flex flex-wrap` — free).
- The caption uses a **subtle overload cue**: neutral muted text normally; amber tint + small `TriangleAlert` icon when a day exceeds the overload threshold.
- Everything is **additive JSONB**, **immutable saves**, read-only display (no edit-gate needed for chips/caption). Dormant by default: nothing changes until `GOOGLE_PLACES_API_KEY` is set (same key/posture as the existing `place-photo` function).

## Architecture

### A. `place-details` edge function (new) — `supabase/functions/place-details/index.ts`

Mirrors `place-photo` exactly in posture: server-side key, CORS, per-IP rate limit, and **graceful `null` when `GOOGLE_PLACES_API_KEY` is unset** (returns `200 { hours: null, price: null }`, never 500s). Reuses the **same** `GOOGLE_PLACES_API_KEY` secret.

Request `POST { query?: string, placeId?: string }`:
- If `placeId` is present → call **Place Details** `GET /v1/places/{placeId}` with field mask `id,displayName,regularOpeningHours,priceLevel`.
- Else if `query` is present → **Text Search** `POST /v1/places:searchText` with field mask `places.id,places.displayName,places.regularOpeningHours,places.priceLevel`, take the top result.

Response `200 { placeId: string|null, displayName: string|null, hours: string[]|null, price: string|null }` (`price` is Google's raw enum string):
- `hours` = Google `regularOpeningHours.weekdayDescriptions` (7 strings like `"Monday: 9:30 AM – 11:45 PM"`), passed through raw. `null` when Google has none.
- `price` = Google `priceLevel` enum string passed through **raw** (e.g. `"PRICE_LEVEL_MODERATE"`, or `null`). The mapping to the canonical symbol happens **client-side** in a pure, unit-tested `mapGooglePrice()` (the edge function stays dumb; the map is vitest-testable): `PRICE_LEVEL_FREE→undefined` (omit), `INEXPENSIVE→'$'`, `MODERATE→'$$'`, `EXPENSIVE→'$$$'`, `VERY_EXPENSIVE→'$$$$'`. Most landmarks have no price → absent.

### B. Client invoker — `app/src/trip/placeDetails.ts` (new)

Mirrors `guide/placePhoto.ts`: a thin `fetchPlaceDetails({ query?, placeId? })` that invokes the function via the Supabase client and returns `{ placeId, hours, price } | null`, never throwing. Slug constant `PLACE_DETAILS_FN_SLUG = 'place-details'` (with the same deploy-slug caveat noted in `place-photo`).

### C. Data model — additive `Stop` fields (`app/src/types.ts`)

```ts
export type PriceLevel = '$' | '$$' | '$$$' | '$$$$'
// inside interface Stop (all additive, optional):
hours?: string[]        // Google regularOpeningHours.weekdayDescriptions (7 strings)
price?: PriceLevel      // mapped from Google priceLevel
goodFor?: string        // AI-derived audience/occasion tag
// (placeId / placeName / placeTypes already exist on main)
```

### D. Fetch + persist flow (`StopDetail.tsx` "Generate details")

On generate, run **in parallel**:
- existing `generateStopDetail(stop, …)` (Wikipedia + AI → history/facts/tips/**goodFor**), and
- `fetchPlaceDetails({ placeId: stop.placeId, query: <name + destination> })` → hours/price.

Merge and persist once via the lifted immutable `save({ data })`: write `history/facts/tips/goodFor` from AI and `hours/price` (+ `placeId` if newly resolved) from Places onto the stop. Places failure or dormant key → hours/price simply absent; AI content still saves. **Generate is the only Places call site** — hours/price are cached as stop data, so there is no repeated cost.

### E. `goodFor` from AI (`app/src/trip/enrich.ts`)

Additive only: add optional `goodFor` to `StopDetailContent`; `parseStopDetail` emits it (trimmed string or omitted); the prompt gains one line — *"goodFor": a short audience/occasion tag (e.g. "Architecture lovers", "Romantic dinner") — only if it's genuinely characteristic, else omit.* No other prompt/token/grounding changes (avoids colliding with the `enrichment-cache` thread).

### F. Hours display helper — `app/src/trip/stop-hours.ts` (new, pure, tested)

`stopHoursLabel(hours: string[] | undefined, date?: string): string`
- empty/undefined → `''` (chip hidden).
- All 7 weekday lines share the same time range → `"Daily 9:30 AM–11:45 PM"`.
- Varies + a `date` is given → that weekday's line, compacted → `"Fri 9:30 AM–11:45 PM"`.
- Varies + no date (undated trip) → `''` (hide the chip rather than show a misleading single value; the data is still stored).
- Compaction: strip the leading `"Weekday: "`, normalize the en-dash/`–`, collapse whitespace.

### G. Chips render (`StopDetail.tsx`)

Append to the existing kind/reservation chip row (`StopDetail.tsx:210`), read-only, lucide + token classes, matching the existing `.chip` style (`rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-semibold text-muted`):
- `hours` → `Clock` icon + `stopHoursLabel(stop.hours, dayDate(trip, day))`, only when the label is non-empty.
- `price` → mono `$$` (no icon), `aria-label="Price level $$"`.
- `goodFor` → `Heart` icon + text.
Add `Clock`/`Heart` re-exports to `trip/icons.tsx` if missing.

### H. Day-utilization caption — `app/src/trip/day-utilization.ts` (new, pure, tested) + `Itinerary.tsx`

```ts
export const OVERLOAD_MINUTES = 11 * 60
export interface DayUtilization { stops: number; minutes: number; hours: number; overloaded: boolean }
export function dayUtilization(stops: readonly Stop[]): DayUtilization
```
Minutes per stop = `normalizeDuration(stop.duration) ?? defaultDurationMinutes(stop)` — **reusing `trip/duration.ts`** (single source of truth; duration is in minutes). `hours = Math.round(minutes/60)`. `overloaded = minutes > OVERLOAD_MINUTES`.

Render one caption line under the day title in `Itinerary.tsx` (near line 210/222): `"{stops} stops · ~{hours}h planned"`, `text-muted text-[12.5px]`; when `overloaded`, switch to amber token color + a 12px `TriangleAlert` with `aria-label="This day looks full"`. No layout shift, `prefers-reduced-motion` safe. No persisted data.

## Testing

Pure-unit (vitest):
- `normalizePrice` / the server map — canonical pass-through, Google enum mapping, free→null, unmappable→null. *(server map is also unit-tested via a copied pure helper if practical, else covered by the client.)*
- `stopHoursLabel` — uniform→"Daily", varies+date→weekday line, varies+no-date→'', empty→'', compaction.
- `dayUtilization` — explicit-duration sum, per-kind default fallback, overload threshold, empty day.
- `parseStopDetail` — emits `goodFor` when present, omits when absent (existing suite extended).

Render check: `StopDetail` shows hours/price/goodFor chips when the stop has those fields; caption renders + flips to overloaded styling past the threshold.

Build: `npm test` green · `npx tsc -b` clean · `npm run build` succeeds.

## Rollout

- Feature is **dormant** until `GOOGLE_PLACES_API_KEY` is set (reuses the existing secret; same as `place-photo`). Until then hours/price are simply absent and the app behaves as today.
- Deploy the `place-details` function under the slug `place-details`; verify the client slug matches (same caveat as `place-photo`).
- The caption ships and works immediately — it needs no key and no Places.

## Conventions honored

Additive JSONB + back-compat reads · immutable lifted `save` · read-only display (no edit-gate) · lucide icons only · CSS-var tokens (light+dark) · a11y labels on price/alert chips · `prefers-reduced-motion` · commit-per-task with the `Co-Authored-By: Claude Opus 4.8 (1M context)` trailer.
