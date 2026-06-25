# PlaceId Backfill for Legacy Stops — Design Spec

> Status: approved (brainstorm) · 2026-06-24 · branch `placeid-backfill` (off `enrichment-cache`)
> Depends on: the place-description cache (`enrichment-cache` / PR #2) — the
> `Stop.placeId/placeName/placeTypes` fields, the shared library, and the
> founder-only Regenerate are all keyed on `placeId`.

## Context & goal

The shared place-description cache (and the founder Regenerate, and any future
cross-trip reuse) is keyed on a Google **`placeId`**. Stops added via autocomplete
have one; everything else — stops added **by name**, **AI-suggested** stops, and
all stops added **before** autocomplete shipped — do **not**. Those stops can't
join the shared library and have no Regenerate control.

We want a **founder-triggered, re-runnable admin batch** that gives existing
placeId-less stops a Google identity (`placeId`/`placeName`/`placeTypes`) — auto-
tagging the confident matches and routing the uncertain ones to a small founder
**review queue**. Once a stop is tagged, the description side is automatic (it
joins the shared cache, which generates one canonical new-prompt entry **per
place**, lazily on view — settled in the cache spec; **not** built here).

## Core decisions (settled in brainstorm)

- **Eager, founder-triggered, chunked, idempotent** admin batch (not lazy-on-view).
- **Resolve** via Google **Text Search** (`places:searchText`, reusing
  `GOOGLE_PLACES_API_KEY` — the same call `place-photo` already uses): query =
  stop `name` biased by its `coords`; **no coords → `name` + the trip's
  city/destination**.
- **Confident → auto-attach; non-confident → founder review.** Confident matches
  are tagged without review.
- **"Not a place"** stops (a friend's house, an Airbnb) are marked and **skipped
  forever**.
- **Backfill attaches `placeId` only.** It never generates a description; the
  cache's existing per-place dedup handles generation/reuse (one generation per
  unique place, ever).
- **Generating fresh** (not seeding old descriptions) — already settled.

## Architecture & data flow

```
FOUNDER admin screen  →  place-id-admin edge function (service role; verifies role='founder')
  action 'scan' {cursor?}:
     read ONE PAGE of trips (paginated)
     for each trip, for each stop where  !placeId && placeSource !== 'none'
         and not already a pending review row:
       Text Search (name + coords bias; no coords → name + city)
       scoreMatch(stop, topCandidate):
         confident → patch the stop {placeId, placeName, placeTypes, placeSource:'google'}
                     (write the trip back, immutably)
         else      → insert a placeid_review row {trip, day/stop index, name, coords, candidates[]}
       transient Google error → leave the stop untouched (retried next run)
     → { processed, tagged, queued, remaining, cursor }
  action 'list'   → pending placeid_review rows (for the screen)
  action 'attach' {reviewId, placeId, placeName, placeTypes} → tag the stop (re-locate), resolve the row
  action 'skip'   {reviewId} → mark the stop placeSource:'none' (re-locate), skip the row

[after a stop is tagged] → on next view, useStopDescription → enrich-place:get
   → first tagged stop of a place generates once; all others reuse (cache hit)
```

### The admin edge function: `supabase/functions/place-id-admin`

One Deno function, **founder-gated** (reads the caller's JWT → `profiles.role`,
must be `'founder'`; 403 otherwise), using the **service role** for `trips` +
`placeid_review` and `GOOGLE_PLACES_API_KEY` for Text Search. Graceful: any error
returns a benign JSON status, never a 5xx. Mirrors the existing edge-function
patterns (CORS, key handling, founder check as in `enrich-place:regenerate`).

**`scan` — chunked, idempotent.** Paginates **by trip** via keyset on the stable
`id` PK (the `cursor` is the last `id` seen; `?id=gt.<cursor>&order=id&limit=25`). For each trip it iterates `data.days[].stops[]`
and, for every stop that still needs processing (`!placeId && placeSource !==
'none'` and not already a `pending` review row for that stop), resolves + scores.
Confident matches are collected and the trip is written back **once** (one
immutable `data` update per trip). Uncertain stops become `placeid_review` rows.
Returns progress + the next `cursor`. The page size (trips per call, e.g. **25**)
keeps each invocation within the function time budget — **no long-running or
background job**; the screen drives pagination.

**`list`** returns the pending review rows. **`attach`/`skip`** apply one founder
decision: re-locate the stop in its (possibly-edited) trip and patch it.

### Resolver + scoring (pure, unit-tested)

- `parseTextSearch(googleJson)` → `Candidate[]` `{ placeId, name, address,
  lat, lng, types }` from a `places:searchText` response. Pure.
- `scoreMatch(stop, candidate)` → `{ confident: boolean; distanceM?: number }`:
  - **Confident** when the stop **has coords**, the top candidate is **within
    ~250 m** of them, **and** the names reasonably match (normalized
    similarity). (~250 m absorbs geocode imprecision; tunable.)
  - Otherwise **not confident** (no coords, weak/ambiguous, multiple close
    candidates, or no results) → review. Pure + fully unit-tested.

### Stop re-location (guards reorders between scan and review)

`scan` records `(trip_id, day_index, stop_index, stop_name)`. `attach`/`skip`
re-read the trip and find the stop at `(day_index, stop_index)` **only if its
`name` still equals `stop_name`**; otherwise they search that day (then the trip)
for a placeId-less stop with that exact name. If none is found (deleted/relocated),
the review row is marked `stale` and skipped — never tag the wrong stop.

## Data model

### `Stop.placeSource` — extend (additive)

`placeSource?: 'google' | 'none'`. `'none'` = confirmed not a Google place →
permanently skipped by the batch. (Already `'google'` for tagged stops.)

### New table `placeid_review` (service-role only; operator SQL)

| column | type | notes |
|---|---|---|
| `id` | `bigint` identity | PK |
| `trip_id` | `text` | the trip |
| `owner_id` | `text` | trip owner (for display) |
| `day_index` | `int` | stop location |
| `stop_index` | `int` | stop location |
| `stop_name` | `text` | re-location key + display |
| `stop_lat` / `stop_lng` | `double precision` | nullable (may be coordless) |
| `candidates` | `jsonb` | top few `{placeId,name,address,lat,lng,distanceM}` |
| `status` | `text` | `pending` \| `resolved` \| `skipped` \| `stale` |
| `created_at` | `timestamptz` | default now() |
| `resolved_at` | `timestamptz` | nullable |

- Index `(status, created_at)`. **RLS: deny all to client roles** (service-role
  only); the founder screen reads/writes it solely through `place-id-admin`.
- A partial unique index on `(trip_id, day_index, stop_index) WHERE status =
  'pending'` prevents duplicate pending rows for the same stop across re-runs.

## Founder review screen

A **founder-only** route (e.g. `/admin/place-ids`, gated like other founder-only
UI via `isFounder(profile)`; non-founders are redirected). Two parts:
- **Run backfill** — a button that calls `scan` page-by-page (showing
  `tagged / queued / remaining` progress) until `remaining = 0`. Shows the
  untagged-stop count first so the founder sees the scope/cost.
- **Review list** — `list` results; each row shows the stop (name · trip · city)
  and its candidate place(s) (name · address · distance) with **"This one"**
  (`attach`), **"Not a place"** (`skip` → `placeSource:'none'`), **"Skip for
  now"** (leave pending). Best-effort; this surface is intentionally minimal (no
  map in v1 — address + distance are enough to disambiguate).

## Security & privacy

- `place-id-admin` is **founder-only** (server-verified) and the **only** path
  that reads/writes other users' `trips` or the `placeid_review` table; both are
  **service-role-only** under RLS.
- Reviewing surfaces other users' **stop names + trip cities** to the founder —
  acceptable as the app owner/admin, and noted here explicitly.
- `GOOGLE_PLACES_API_KEY` stays server-side. The batch costs **one Text Search
  per untagged stop**; the founder sees the count before running, and pages are
  bounded.

## Failure & degradation

| Condition | Behaviour |
|---|---|
| Transient Google error on a stop | leave it untouched; retried on the next `scan` run |
| No Google results for a stop | not confident → review row (founder decides "Not a place") — never auto-skipped |
| Trip edited between scan + review | re-locate by `name`; if gone → row `stale`, skipped (never mis-tags) |
| Function time pressure | bounded page size; founder re-invokes for the next page |
| Re-run | idempotent — skips tagged, `'none'`, and already-pending stops |

## Testing

Pure logic unit-tested in vitest (I/O mocked), TDD:
- `parseTextSearch` (Google `places:searchText` → candidates) — incl. empty.
- `scoreMatch` — confident (coords + ≤250 m + name match), and each not-confident
  branch (no coords, far, weak name, no candidate); the distance + name-similarity
  helpers.
- The stop **re-location** helper (`locateStop(trip, dayIndex, stopIndex,
  stopName)`) — found at index, found-by-name after a shift, and gone → null.
- Founder screen: a light render/action test (mock the admin client).
The Deno `place-id-admin` function is verified by **live probes** (Deno not local),
copying the tested pure helpers verbatim.

## Operator steps

1. **SQL** — create `placeid_review` (+ indexes, RLS deny-all) in the Supabase
   editor (ref `wnpanbjzmcsvhfyjdczv`).
2. **Deploy** `supabase functions deploy place-id-admin` (reuses
   `GOOGLE_PLACES_API_KEY` + service role).
3. As founder, open the admin screen → **Run backfill** → clear the review queue.

## Acceptance criteria

- A founder can run a **re-runnable, idempotent** backfill that tags placeId-less
  stops across **all** users' trips, processed in **bounded pages** (no
  background job).
- **Confident** matches (coords + ≤~250 m candidate + name match) are
  **auto-attached** (`placeId`/`placeName`/`placeTypes`, `placeSource:'google'`);
  **non-confident** ones go to the **review queue** — never guessed.
- The founder review screen lets you **attach a candidate**, mark **"not a place"**
  (`placeSource:'none'`, skipped forever), or skip-for-now.
- A re-run **skips** already-tagged, `'none'`-marked, and already-pending stops.
- Stops are **re-located by name** so an edit between scan and review never
  mis-tags; a vanished stop → `stale`.
- The batch **only attaches `placeId`** — it never generates a description;
  generation/reuse is the cache's existing per-place dedup (one generation per
  unique place).
- `placeid_review` + all cross-user trip writes are **service-role only**, behind
  the **founder-gated** `place-id-admin` function.
- `place-id-admin`, `scoreMatch`, `parseTextSearch`, and `locateStop` are covered
  (pure logic in vitest; function by probe).

## Out of scope / future

- The description **generation/regeneration** itself (owned by the cache).
- **Lazy on-view** resolution for ongoing new stops (the re-runnable batch covers
  the backlog; lazy is a possible future add).
- A **map preview** in the review screen; bulk "not a place"; auto-skip of
  obvious no-results (kept manual in v1 for safety).
- Confidence threshold tuning beyond the ~250 m / name-match default.
