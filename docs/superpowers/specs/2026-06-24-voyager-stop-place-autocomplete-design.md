# Stop Place Autocomplete — Design Spec

> Status: approved (with review revisions) · 2026-06-24 · branch `guide-facts-experience`
> Provider decision: **Google Places API (New)** (confirmed live — see Prerequisites).
> Revised per review rounds 1–3 (immediate creation, dedup, eager region,
> proximity bias, cross-border note) — 2026-06-24.

## Context & goal

Today, adding a stop is an **AI-vibe search**: you type a description ("a classic
museum"), press Search, and `suggest.ts` (→ `ai-proxy`) returns ~3 invented-then-
grounded spots, after which coords + photos backfill asynchronously.

We want a **true as-you-type place autocomplete** — like typing into Google Maps —
that surfaces **real, named places** while the user types, **scoped to the trip's
country** and **biased toward where the user is currently planning**. Selecting a
result yields a stop with a canonical Google identity (`placeId`, `placeName`)
created **immediately**, its coordinates resolved in the background.

This also delivers the **"normalized place"** the user asked for: each result
carries a stable Google `placeId`. In v1 that powers **in-trip duplicate
prevention** (no two stops for the same normalized place); later it keys the
shared enrichment cache (story/facts/experience).

## Non-goals

- Not replacing the AI "ideas" flow — it stays as a secondary mode and is designed
  to fold into the same search surface later (see **Future UX**).
- Not building the cross-trip **shared enrichment cache** here. v1 uses `placeId`
  for an informational in-trip duplicate **note** (duplicates are allowed — see
  Duplicate handling); the broader cache is a separate effort that consumes the
  same `placeId`/`placeName`.
- **No** separate canonical-address field, address validation, or duplicate-review
  dialog (see Duplicate handling). No client-side Google key, ever. No map UI
  changes. No new auth.

## User experience

- AddStop's text field becomes a **typeahead**. At ≥3 chars (debounced ~300 ms) a
  dropdown shows real places: **primary text** (name) + **secondary text**
  (address/locality) + a type icon.
- Results are limited to the trip's country and biased toward the area the user is
  actively planning (see Bias center).
- Picking a result **creates the stop immediately** (see Selection flow), pin
  filling in a moment later.
- Keyboard + a11y parity with the existing `DestinationInput` (↑/↓/Enter/Esc,
  `role=combobox/listbox/option`, ≥44 px rows, focus rings, loading state).
- Degrades gracefully: if the service returns nothing (or the key/quota is off),
  the UI falls back to "add by name" + the AI ideas mode — never an error wall.

## Selection flow — immediate creation, background details

Coordinates are **not** required at creation time, so we do not block on the
details request:

```txt
Autocomplete (predictions: placeId, primaryText, secondaryText, types)
  → user selects a prediction
  → DUPLICATE NOTE by placeId (informational only — duplicates are allowed)
       └─ if a match exists, show "{name} is already in your trip" (still create)
  → CREATE STOP IMMEDIATELY from the prediction:
       { name: primaryText, placeName: primaryText,
         placeId, placeSource:'google', placeTypes: types, kind }
  → BACKGROUND: fetch details(placeId, sessionToken)
       → patch the stop { lat, lng, address, placeName, placeTypes }
         via the explicit canApplyPlaceDetails guard (below)
       → on details miss: fall back to the existing geocode backfill (by name)
```

Rationale: this mirrors Voyager's existing create-then-backfill pattern
(`useGeocodeBackfill` + `canApplyGeocode`). The details call shares the
autocomplete **session token**, so billing stays one session per add even though
it now runs after creation.

**The patch guard — `canApplyPlaceDetails` (explicit requirement):**

```ts
// Apply an in-flight details response ONLY when it still belongs to this stop.
if (stopExists && stop.placeId === details.placeId) {
  applyPatch() // see allowed fields below
}
```

- **Never** patch a stop that has been deleted (it's gone → skip).
- **Never** patch a stop whose `placeId` no longer matches the response
  (relocated / replaced → stale → discard).
- **Never** overwrite the editable `Stop.name`.
- **Only** these derived Google-backed fields may be written:
  `lat`, `lng`, `address`, `placeName`, `placeTypes`.
  (`address` is the existing display field, seeded once from Google's formatted
  address; it is not separately preserved.)

This kills the stale-response-mutates-the-wrong-stop race.

## Duplicate handling (v1 — informational, NOT a block)

Adding the **same place more than once is allowed** — a real itinerary often
revisits a place (Cascade on Monday *and* Tuesday; Hraparak by day *and* for the
night fountains). So duplicates are never prevented; we only surface a heads-up.

- On selecting a prediction, scan the **whole trip's** stops (all days) for an
  existing stop whose `placeId` equals the selection's. Comparison is **`placeId`
  only** — never name matching.
- **Always create** the stop. If a match exists, additionally show a lightweight,
  non-blocking note: **"{name} is already in your trip."** (informational only).
- A stop added "by name" (no `placeId`) never triggers the note.

`findStopByPlaceId` returns the **most recently added** match (scans from the end),
so the background details patch targets the stop just appended, not an earlier
visit. (Duplicates share a `placeId` → identical Google details, so even a
mis-targeted patch between two instances is data-identical.)

**No confirmation flow.** We do **not** add "Did you mean this existing stop?"
prompts, address-style validation, or duplicate-review dialogs. Google autocomplete
is already the disambiguation mechanism (it shows name + locality/address + type),
so stop creation stays fast and frictionless.

## Architecture

```
StopSearchInput (typeahead UI, fork of DestinationInput)
  → useStopSearch  (TanStack Query; debounce; one session token per typing session)
      → POST /functions/v1/place-search        [NEW edge fn — Google key server-side]
           action:"autocomplete" → Places API (New)  POST places:autocomplete
           action:"details"      → Places API (New)  GET  places/{placeId}
```

### New edge function: `supabase/functions/place-search`

Sibling of `place-photo`: **same `GOOGLE_PLACES_API_KEY` secret**, same CORS,
same graceful-when-unset contract (never 500s the app), same anon-auth +
per-IP rate limit. Two actions on one POST endpoint:

**`autocomplete`** → `POST https://places.googleapis.com/v1/places:autocomplete`
- Headers: `Content-Type: application/json`, `X-Goog-Api-Key: <key>`
- Body:
  ```json
  {
    "input": "<query>",
    "sessionToken": "<client uuid>",
    "languageCode": "en",
    "includedRegionCodes": ["us"],
    "locationBias": { "circle": {
      "center": { "latitude": 38.62, "longitude": -90.19 },
      "radius": 50000
    }}
  }
  ```
  `includedRegionCodes` = the trip's country; the circle center = the **bias
  center** (below). The server builds the bias from whichever center the client
  supplies; if none is available it omits `locationBias` entirely.
- Returns to client: `{ predictions: [{ placeId, primaryText, secondaryText, types }] }`

**`details`** → `GET https://places.googleapis.com/v1/places/{placeId}?sessionToken=<uuid>`
- Headers: `X-Goog-Api-Key: <key>`,
  `X-Goog-FieldMask: location,formattedAddress,displayName,types`
- Returns to client: `{ place: { name, lat, lng, address, types } | null }`
  (`name` = Google `displayName.text` → `placeName`; `address` = Google
  `formattedAddress`, seeds the editable `address`.)

The client never sees the Google key. **As-built note (testability deviation —
see the plan):** because Deno isn't available for server-side tests in this
environment, the `place-search` function is a *thin proxy* that forwards Google's
**raw JSON verbatim** (and `{predictions:[]}` / `{place:null}` on any error), and
the request-body building + response parsing live client-side in
`app/src/lib/placeSearch.ts` (`buildAutocompleteBody` / `parsePredictions` /
`parseDetails`, all unit-tested). So the client *does* parse raw Google shapes —
the simplified `Prediction`/`ResolvedPlace` types below describe the client-side
parsed result, not the wire format. Do **not** "restore" server-side simplification
without moving the parsers too, or the client parsers will break. Payloads aren't
sensitive — only the key is — so the security goal is preserved either way.

### Client ↔ edge-function contract

`POST /functions/v1/place-search` (Authorization: Bearer <anon/user jwt>, `apikey: anon`):

| Request | Response |
|---|---|
| `{ action:"autocomplete", input, sessionToken, region:{ countryCode, lat?, lng? } }` | `{ predictions: Prediction[] }` |
| `{ action:"details", placeId, sessionToken }` | `{ place: ResolvedPlace \| null }` |

`region.countryCode` is the trip's country (hard restriction). `region.lat/lng` is
the **bias center** (optional — omitted if no source is available).
`Prediction = { placeId, primaryText, secondaryText, types: string[] }`
`ResolvedPlace = { name, lat, lng, address?, types: string[] }`

Any error / missing key / bad input → `{ predictions: [] }` or `{ place: null }`,
HTTP 200. (Mirrors `place-photo`'s null-photo discipline.)

## Bias center — follow the user's planning, not just the destination

Autocomplete should bias toward **where the user is currently planning**, which is
usually *not* the original trip destination once the itinerary expands (a road trip
moves on; a multi-city trip jumps around). The client resolves the bias center
from this priority chain and passes the first available as `region.lat/lng`:

```txt
1. Most recently added stop that has coordinates  (the active anchor)
2. Centroid of the current day's coord-bearing stops
3. Trip destinationGeo center
   (none available → omit locationBias; country restriction still applies)
```

A small `biasCenter(trip, dayIndex)` helper walks the chain. Rationale: users add
stops near the area they're working in, so biasing to the latest anchor naturally
supports city itineraries, road trips, regional travel, and multi-day planning,
and avoids over-biasing back to the start after the trip has moved elsewhere.

**Country code is always taken from `destinationGeo`** (the trip's country is
stable even as the planning focus roams), so `destinationGeo` is still resolved and
stored — it just no longer serves as the *primary* bias center, only the tier-3
fallback.

### Region resolution — eager, canonical metadata

`destinationGeo` is **canonical derived trip metadata**, resolved and saved up
front (not lazily):

```
TripConfig.destinationGeo = { lat, lng, countryCode, state? }
```

- **On trip creation** (NewTripSheet, once a destination is picked) → resolve + save.
- **On destination change** (ChangeLocation) → immediately re-resolve + save.
- Derived by geocoding `config.destination` via Photon (`lib/geocode.ts` family),
  whose GeoJSON `properties` include `countrycode`, `state`, and a center; a small
  `resolveRegion(destination)` helper extracts these.
- A lazy resolve-on-first-use remains only as a **backfill** for legacy trips.

## Scoping: country (hard) + proximity bias (soft) — with the radius constraint

- **Country — hard.** `includedRegionCodes: [countryCode]` natively restricts
  Google to that country. The primary guard against "whole world" results.
- **Proximity — soft.** `locationBias.circle` centered on the **bias center** above
  ranks the active planning area first. **Bias only influences ranking, never
  restricts.**
- **Radius — capped at 50 km by Google.** The Places API (New) `locationBias`
  circle radius maximum is **50 000 m**. Decision: keep the 50 km circle (it is the
  max); country restriction is the real boundary and bias is only a ranking nudge.
  Escape hatch if testing shows results feel too localized: switch to a
  `locationBias` **rectangle** (no 50 km cap) — a server-only change, contract
  unchanged.

## Cross-border travel — known limitation (design note)

Strict country restriction is imperfect for trips that hug a national border yet
stay geographically close, e.g.:

- Armenia ↔ Georgia
- US ↔ Canada
- France ↔ Switzerland
- Austria ↔ Germany

A stop just across the border won't appear when results are restricted to the
trip's `destinationGeo.countryCode`.

> Country restriction prioritizes relevance and prevents global result pollution
> for the overwhelming majority of trips. Cross-border regional travel is a known
> limitation of the v1 approach and may require a different scoping strategy
> (e.g. multi-country `includedRegionCodes`, or radius-based restriction) in a
> future design.

The v1 implementation **remains country-restricted.** A by-name add still works for
the occasional cross-border stop, and the geocode backfill resolves its pin.

## Cost controls (it's a paid SKU)

- **Session tokens.** One `sessionToken` (UUID) per typing session, sent on every
  autocomplete keystroke **and** the (background) details call → Google bills the
  whole session as a single Autocomplete session. Token resets after a `details`
  resolve and on clear.
- **Debounce ~300 ms + min 3 chars** before any request.
- **TanStack cache** per `(input, sessionToken)`.
- **Per-IP rate limit** in the edge function (reuse `place-photo`'s limiter).
- **Graceful-when-unset:** key/quota off → zero predictions, UI falls back.

## Data model (additive JSONB — no migration)

```ts
Stop.placeId?: string          // canonical Google place id — authoritative normalized-place key
Stop.placeSource?: 'google'    // provenance (future-proofs a second provider)
Stop.placeName?: string        // canonical Google display name (provider-supplied)
Stop.placeTypes?: string[]     // Google place types (icons / filtering / categorization / enrichment)

TripConfig.destinationGeo?: { lat: number; lng: number; countryCode: string; state?: string }
```

Canonical identity (retained even though stop titles are not user-editable today):
`placeId` is the authoritative normalized-place identifier; `placeName` is the
canonical provider-supplied name. Both underpin duplicate prevention, enrichment,
caching, analytics, and provider abstraction, and key dedup/enrichment **regardless
of `Stop.name`**. No separate canonical-address field is stored — Voyager has no
user-edited address today, so it adds complexity without a concrete use case. All
fields optional and read-compatible with existing trips.

## Security

- Google key stays in the `place-search` function only (Supabase secret), never
  shipped to the client — identical to `place-photo`.
- Function requires Supabase anon/user auth (gateway JWT) + per-IP rate limit.
- The probe (2026-06-24) confirmed the key works from the edge-function server IP,
  so no HTTP-referrer restriction blocks server-side use.

## Failure & degradation

| Condition | Behaviour |
|---|---|
| Key unset / API disabled / quota 0 | function returns `{predictions:[]}` → no dropdown; AI ideas + "add by name" remain |
| Network / Google 4xx-5xx | same null-safe empty result, HTTP 200 |
| `details` miss after creation | stop already exists (name + placeId); existing geocode backfill resolves coords by name |
| No bias source yet (first stop) | omit `locationBias`; country restriction still applies |
| Region unresolved (legacy trip) | lazy-backfill `destinationGeo`; if still none, omit `region` country → country-less autocomplete (wider but functional), logged once |
| Cross-border stop | not surfaced under country restriction; add by name (geocode backfill resolves the pin) |

## Future UX (non-blocking design note)

Keep the architecture compatible with a future **unified search surface** where
autocomplete and AI discovery share one dropdown:

```txt
Gateway…

  Gateway Arch
  Gateway National Park
  Gateway Museum
  ──────────────────────
  ✨ Generate ideas for "gateway"
```

Autocomplete stays the primary path; the AI ideas flow becomes an appended item.
The `StopSearchInput` result model + AddStop result handler stay provider-agnostic
(a list of "addable candidates"), so this needs no architectural change later.

## Testing

Pure functions are unit-tested (vitest / Deno test), I/O is mocked:
- Autocomplete request-body builder (region codes, 50 km circle bias, session
  token; omits `locationBias` when no center).
- Prediction parser (Google `suggestions[].placePrediction` → `Prediction`, incl. `types`).
- Details parser (`location`/`formattedAddress`/`displayName`/`types` → `ResolvedPlace`).
- `resolveRegion` (Photon props → `{lat,lng,countryCode,state}`), incl. non-US + miss → null.
- `biasCenter(trip, dayIndex)` priority chain (recent coord stop → day centroid →
  destinationGeo → none).
- **Duplicate detection:** selecting a `placeId` already in the trip yields no new
  stop + the message; a different `placeId` adds normally; by-name stops never block.
- **Immediate creation + background patch:** a selection creates the stop before
  details resolve; `canApplyPlaceDetails` patches only `lat/lng/address/placeName/
  placeTypes` when `stop.placeId === details.placeId`, never touches `name`, and
  no-ops if the stop was removed or its `placeId` changed.
- `useStopSearch` debounce + session-token lifecycle (timers mocked).
- Eager `destinationGeo` write on create + on destination change.

## Acceptance criteria

- Adding a place already in the trip (same `placeId`) **still creates** the stop
  (duplicates allowed for revisits) and shows an informational "{name} is already
  in your trip" note. No block, no confirmation dialog.
- `placeId` is the authoritative normalized-place identifier; `placeName` is the
  canonical provider name — both retained and independent of `Stop.name`.
- `placeTypes` are persisted when Google returns them.
- Creating a trip and changing a destination **immediately refresh** `destinationGeo`.
- Selecting a prediction **creates the stop without waiting** on details; coords
  fill in shortly after.
- Autocomplete bias center follows the priority chain (recent stop → day centroid →
  destinationGeo); country restriction is applied to every request.
- Background details responses only patch a stop whose **current** `placeId` matches
  the response; deleted or replaced stops are never mutated by a stale response.

## Prerequisites (operator)

1. **Verified live (2026-06-24):** `place-photo` returned a real Google JPEG →
   key set, Places API (New) enabled, billing on, server-side calls unblocked.
   Autocomplete is a method of the same API, so it is enabled too. (Optional 100 %
   check: deploy a one-call autocomplete probe after `supabase login`.)
2. **Deploy** the new function (manual — no CI/auth in this environment):
   `supabase functions deploy place-search` against ref `wnpanbjzmcsvhfyjdczv`.
   The secret is already shared; no new secret needed.
3. **Set a billing budget + quota cap** on the Places SKUs (autocomplete is the
   priciest; session tokens mitigate, a cap protects).
