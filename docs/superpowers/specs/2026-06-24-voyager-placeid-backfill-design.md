# PlaceId Backfill for Legacy Stops — Design Spec

> Status: approved (brainstorm) · 2026-06-24 · branch `placeid-backfill` (off `enrichment-cache`)
> Depends on: the place-description cache (`enrichment-cache` / PR #2) — the
> `Stop.placeId/placeName/placeTypes` fields, the shared library, and the
> founder-only Regenerate are all keyed on `placeId`.
> Revised per review (scored confidence, frozen candidates, match metadata,
> metrics, permanent review history) — 2026-06-24.

## Context & goal

The shared place-description cache (and the founder Regenerate, and any future
cross-trip reuse) is keyed on a Google **`placeId`**. Stops added via autocomplete
have one; everything else — stops added **by name**, **AI-suggested** stops, and
all stops added **before** autocomplete shipped — do **not**. Those stops can't
join the shared library and have no Regenerate control.

We want a **founder-triggered, re-runnable admin batch** that gives existing
placeId-less stops a Google identity — auto-tagging the **high-confidence**
matches (via a tunable scoring model) and routing the rest to a small founder
**review queue** with frozen candidates. Once a stop is tagged, the description
side is automatic (it joins the shared cache, which generates one canonical
new-prompt entry **per place**, lazily on view — settled in the cache spec; **not**
built here).

## Core decisions (settled in brainstorm + review)

- **Eager, founder-triggered, chunked, idempotent** admin batch (not lazy-on-view).
- **Resolve** via Google **Text Search** (`places:searchText`, reusing
  `GOOGLE_PLACES_API_KEY` — the same call `place-photo` already uses): query =
  stop `name` biased by its `coords`; **no coords → `name` + the trip's
  city/destination**.
- **Scored confidence (tunable), not hard-coded booleans.** A single
  `scoreMatch` helper produces a numeric score; `score >= AUTO_ATTACH_THRESHOLD`
  **and not ambiguous** → auto-attach; everything else → founder review. **Favor
  false negatives over false positives.**
- **Never overwrite `stop.name`.** The user's name stays; Google's canonical name
  is stored separately as `placeName`.
- **Freeze review candidates** at scan time (top 3) — the founder reviews exactly
  what the scan saw; no fresh Google lookup during attach.
- **"Not a place"** stops are marked `placeSource:'none'` and skipped forever.
- **Backfill attaches identity only** — it never generates a description; the
  cache's existing per-place dedup handles generation/reuse (one generation per
  unique place, ever).
- **Review history is permanent** (rows are never deleted) — an audit trail.

## Architecture & data flow

```
FOUNDER admin screen  →  place-id-admin edge function (service role; verifies role='founder')
  action 'metrics' → { total_untagged, pending_review, marked_none, already_tagged }  (shown before a run)
  action 'scan' {cursor?}:
     read ONE PAGE of trips (keyset by id)
     for each trip, for each stop where  !placeId && placeSource !== 'none'
         and not already a pending review row:
       candidates = Text Search (name + coords bias; no coords → name + city)  [top 3 kept]
       { score, confident, distanceM } = scoreMatch(stop, candidates)
         confident → patch the stop {placeId, placeName, placeTypes, placeSource:'google',
                       placeMatchedAt, placeMatchMethod:'auto', placeMatchDistanceM}
                     (write the trip back, immutably)
         else      → insert a placeid_review row {trip, day/stop index, name, coords, candidates[≤3], score}
       transient Google error → leave the stop untouched (retried next run)
     → { processed, tagged, queued, remaining, cursor }
  action 'list'   → pending placeid_review rows (for the screen)
  action 'attach' {reviewId, placeId} → MUST be one of the row's frozen candidates;
                     tag the stop (re-locate, optimistic write) {placeId, placeName, placeTypes,
                     placeSource:'google', placeMatchedAt, placeMatchMethod:'founder'};
                     row → {status:'resolved', resolved_place_id, resolved_at}
  action 'skip'   {reviewId} → mark the stop placeSource:'none' (re-locate, optimistic write);
                     row → status:'skipped'
   [all trip writes are conditional on trips.updated_at — see Optimistic concurrency]

[after a stop is tagged] → on next view, useStopDescription → enrich-place:get
   → first tagged stop of a place generates once; all others reuse (cache hit)
```

### The admin edge function: `supabase/functions/place-id-admin`

One Deno function, **founder-gated** (reads the caller's JWT → `profiles.role`,
must be `'founder'`; 403 otherwise), using the **service role** for `trips` +
`placeid_review`, and `GOOGLE_PLACES_API_KEY` for Text Search. Graceful: any error
returns benign JSON, never a 5xx. Mirrors existing edge-function patterns (CORS,
key handling, founder check as in `enrich-place:regenerate`).

**`metrics`** — returns `total_untagged` (`!placeId && placeSource!=='none'`),
`marked_none` (`placeSource==='none'`), `already_tagged` (`placeId` set), and
`pending_review` (`status='pending'`), shown on the screen **before** a run so
scope + likely Google cost are visible. **No Google calls.** These counts are
**informational only and do not require transactional accuracy** — the
implementation may use an exact scan, **cached counts, precomputed aggregates, or
batched counting** as needed for scale; an approximate `total_untagged` is fine.

**`scan` — chunked, idempotent.** Paginates **by trip** via keyset on the stable
`id` PK (the `cursor` is the last `id` seen; `?id=gt.<cursor>&order=id&limit=25`).
For each trip it iterates `data.days[].stops[]` and, for every stop still needing
processing (`!placeId && placeSource !== 'none'` and not already a `pending` review
row), resolves the **top 3** candidates + scores them. Confident matches are
collected and the trip is written back **once** (one immutable `data` update per
trip). Non-confident stops become `placeid_review` rows with the frozen candidates.
Returns progress + the next `cursor`. Page size (trips per call, e.g. **25**) keeps
each invocation within the function time budget — **no long-running/background
job**; the screen drives pagination. The scan **may batch and/or throttle** its
outbound Google Text Search calls to stay within API quotas + the edge-function
execution limit; throttling **must not** change correctness or idempotency
(unprocessed stops simply remain for the next page/run).

**`list`** returns pending review rows. **`attach`/`skip`** apply one founder
decision; `attach`'s `placeId` **must be one of the row's stored candidates** (no
fresh Google lookup) — the founder picks exactly what the scan saw.

### Optimistic concurrency — never clobber a user's concurrent edits

Every operation that writes a trip (`scan`, `attach`, `skip`) is **conditional on
the trip not having changed since it was read**. The token is `trips.updated_at`:

```
read trip (incl. updated_at)  →  prepare the immutable data patch  →
UPDATE … SET data=…, updated_at=now()  WHERE id=<id> AND updated_at=<readValue>
   (Prefer: return=representation)
→ 0 rows affected  ⇒  the trip changed under us  ⇒  do NOT write; return a benign
   status; the stop is picked up naturally on a future scan / review action.
```

The project has no existing optimistic-concurrency pattern (today's trip writes
are last-write-wins), so this is introduced here. For the token to reflect *any*
writer — including the app's own autosave — the `trips` table must **bump
`updated_at` on every update** (a `moddatetime`-style trigger). The plan verifies
this and adds the trigger if absent; without it the guard is a no-op. The backfill
**never** force-overwrites a trip.

### Resolver + scoring (pure, unit-tested, tunable)

- `parseTextSearch(googleJson)` → `Candidate[]` `{ placeId, name, address, lat,
  lng, types }` from a `places:searchText` response. Pure.
- **Candidate ordering is Google's** — candidates are kept in the order Google
  returns them and are **never reordered** (not by distance, similarity, or any
  custom ranking). `candidates[0]` is the **primary** candidate `scoreMatch`
  evaluates; the rest inform the ambiguity penalty. A per-candidate `distanceM` is
  annotated for display/debug but does **not** change order. (Deterministic +
  debuggable.)
- `scoreMatch(stop, candidates)` → `{ score: number; confident: boolean;
  distanceM?: number }` — scores the **top** candidate against the stop, with the
  **candidate set passed in** so a competing runner-up can be penalised. All
  confidence logic lives here (the scan never hard-codes thresholds), so it's
  tunable later without touching the flow. Scoring inputs (illustrative weights,
  pinned in the plan):
  - **distance ≤ 100 m** → strong positive; **≤ 250 m** → positive; farther →
    negative/none.
  - **exact normalized name match** → strong positive; **close normalized name
    similarity** → positive.
  - **competing nearby candidate** (a runner-up that is also close / similarly
    named) → **penalty** (ambiguity).
  - **missing stop coords** → penalty.
  - `confident = score >= AUTO_ATTACH_THRESHOLD`. Both constants
    (`AUTO_ATTACH_THRESHOLD`, the weights) are named, tunable values.
- **Ambiguity rule (favor false negatives):** even an otherwise-high candidate is
  **not** auto-attached when the candidate set is ambiguous (multiple plausibly-
  valid nearby/similarly-named places — e.g. several Starbucks, multiple museum
  entrances). The competing-candidate penalty drives this; such sets fall below
  the threshold → review.

### Stop re-location (guards reorders between scan and review)

`scan` records `(trip_id, day_index, stop_index, stop_name)`. `attach`/`skip`
re-read the trip and find the stop at `(day_index, stop_index)` **only if its
`name` still equals `stop_name`**; otherwise they search that day (then the trip)
for a placeId-less stop with that exact name. If none is found
(deleted/relocated), the review row is set `stale` and skipped — never the wrong
stop.

## Data model

### `Stop` — additive fields

- `placeSource?: 'google' | 'none'` — `'none'` = confirmed not a Google place →
  permanently skipped. (Already `'google'` for tagged stops.)
- `placeName?` — Google's **canonical** name; **`stop.name` is never overwritten**
  (it stays the user-entered value). E.g. `stop.name = "The Arch"`,
  `placeName = "Gateway Arch National Park"`. The distinction is kept visible for
  debugging/review tooling.
- **Match metadata (informational only — no runtime effect):**
  `placeMatchedAt?: string` (ISO), `placeMatchMethod?: 'auto' | 'founder'`,
  `placeMatchDistanceM?: number`. For auditability + future tuning.

### New table `placeid_review` (service-role only; operator SQL)

| column | type | notes |
|---|---|---|
| `id` | `bigint` identity | PK |
| `trip_id` | `text` | the trip |
| `owner_id` | `text` | trip owner (display) |
| `day_index` / `stop_index` | `int` | stop location |
| `stop_name` | `text` | re-location key + display |
| `stop_lat` / `stop_lng` | `double precision` | nullable (may be coordless) |
| `score` | `double precision` | the top candidate's score (debug/tuning) |
| `candidates` | `jsonb` | **frozen top ≤3** `{placeId,name,address,lat,lng,distanceM}` |
| `status` | `text` | `pending` \| `resolved` \| `skipped` \| `stale` |
| `resolved_place_id` | `text` | nullable — the candidate placeId the founder attached (audit / override analysis) |
| `created_at` | `timestamptz` | default now() |
| `resolved_at` | `timestamptz` | nullable |

- Index `(status, created_at)`. **RLS: deny all to client roles** (service-role
  only); the screen reaches it solely through `place-id-admin`.
- Partial unique index `(trip_id, day_index, stop_index) WHERE status = 'pending'`.
  **It prevents duplicate *pending* review rows only** — historical rows with
  status `resolved` / `skipped` / `stale` are intentionally preserved and are
  **not** treated as duplicates (a stop could legitimately be re-reviewed after a
  prior skip). The permanent audit trail is unaffected.
- **`attach` records the resolution:** `resolved_place_id = <chosen candidate>`,
  `status = 'resolved'`, `resolved_at = now()` — informational (audit, future
  scoring analysis, measuring founder overrides), no runtime effect.
- **Rows are never deleted** — `resolved`/`skipped`/`stale` are kept as a
  permanent audit trail; re-scan dedup keys off the **stop's** `placeId`/
  `placeSource` (+ the pending guard), not on deleting history.

## Founder review screen

A **founder-only** route (e.g. `/admin/place-ids`, gated via `isFounder(profile)`;
non-founders redirected). Two parts:
- **Metrics + Run** — calls `metrics` and shows `total_untagged · pending_review ·
  marked_none · already_tagged` (scope + likely Google cost) **before** the run;
  a **Run backfill** button then calls `scan` page-by-page (showing
  `tagged / queued / remaining`) until `remaining = 0`.
- **Review list** — `list` results; each row shows the stop (name · trip · city)
  and its **frozen** candidate place(s) (name · address · distance) with **"This
  one"** (`attach`), **"Not a place"** (`skip`), **"Skip for now"** (leave
  pending). Resolves from the stored candidates — no live search. Minimal (no map
  in v1; address + distance disambiguate).

## Security & privacy

- `place-id-admin` is **founder-only** (server-verified) and the **only** path
  that reads/writes other users' `trips` or the `placeid_review` table; both are
  **service-role-only** under RLS.
- Reviewing surfaces other users' **stop names + trip cities** to the founder —
  acceptable as the app owner/admin, noted explicitly.
- `GOOGLE_PLACES_API_KEY` stays server-side. The batch costs **one Text Search per
  untagged stop**; `metrics` shows the count first; pages are bounded. (`metrics`
  itself makes **no** Google calls.)

## Failure & degradation

| Condition | Behaviour |
|---|---|
| Transient Google error on a stop | leave it untouched; retried on the next `scan` |
| No / weak Google results | not confident → review row (founder decides "Not a place") — never auto-skipped |
| Ambiguous candidate set | below threshold → review (favor false negatives) |
| Trip edited between scan + review | re-locate by `name`; if gone → row `stale`, skipped |
| `attach` placeId not in the frozen candidates | rejected (review uses only what the scan saw) |
| Trip changed since read (`updated_at` mismatch) | conditional write affects 0 rows → **benign skip**, no write; retried on a future scan/review — never clobbers the user's edit |
| Re-run | idempotent — skips tagged, `'none'`, and already-pending stops |

## Testing

Pure logic unit-tested in vitest (I/O mocked), TDD:
- `parseTextSearch` (Google `places:searchText` → candidates), incl. empty.
- `scoreMatch` — the **scored** model: strong/positive at ≤100/≤250 m, exact vs
  close name, the **competing-candidate penalty** (ambiguity → below threshold),
  the **missing-coords** penalty, and the `AUTO_ATTACH_THRESHOLD` boundary; plus
  the distance + name-similarity helpers.
- `locateStop(trip, dayIndex, stopIndex, stopName)` — found at index, found-by-
  name after a shift, gone → null.
- Founder screen: a light render/action test (mock the admin client), incl.
  metrics display + attach-restricted-to-frozen-candidates.
The Deno `place-id-admin` function is verified by **live probes** (Deno not local),
copying the tested pure helpers verbatim.

## Operator steps

1. **SQL** — create `placeid_review` (+ indexes, RLS deny-all) in the Supabase
   editor (ref `wnpanbjzmcsvhfyjdczv`); and **ensure `trips.updated_at` auto-bumps
   on every update** (add a `moddatetime`-style `BEFORE UPDATE` trigger if one
   isn't already present) so the optimistic-concurrency token is reliable.
2. **Deploy** `supabase functions deploy place-id-admin` (reuses
   `GOOGLE_PLACES_API_KEY` + service role).
3. As founder, open the admin screen → review the **metrics** → **Run backfill**
   → clear the review queue.

## Acceptance criteria

- A founder can run a **re-runnable, idempotent** backfill that tags placeId-less
  stops across **all** users' trips in **bounded pages** (no background job).
- Matching uses a **tunable `scoreMatch(stop, candidates) → {score, confident,
  distanceM?}`**; auto-attach iff `score >= AUTO_ATTACH_THRESHOLD` and not
  ambiguous. All confidence logic lives in the helper (no hard-coded thresholds in
  the scan).
- **Ambiguous** candidate sets (multiple plausible nearby/similar places) **never**
  auto-attach — they go to review (false negatives preferred).
- **`stop.name` is never overwritten**; Google's canonical name is stored as
  `placeName`. Attached stops also record `placeMatchedAt`, `placeMatchMethod`
  (`auto`/`founder`), and (when known) `placeMatchDistanceM` — informational only.
- Review rows **freeze the top ≤3 candidates** (`placeId,name,address,lat,lng,
  distanceM`); `attach` accepts **only** a stored candidate — no fresh lookup at
  review time.
- The screen shows **`total_untagged / pending_review / marked_none /
  already_tagged`** (via a Google-free `metrics` pass) before a run.
- Review rows are **never deleted**; statuses `pending/resolved/skipped/stale`
  form a permanent audit trail; the pending-only partial unique index does not
  treat historical rows as duplicates.
- **All trip writes (`scan`/`attach`/`skip`) are optimistically guarded on
  `trips.updated_at`** — if the trip changed since it was read, the write is a
  0-row no-op (benign skip) and is retried later; the backfill **never** clobbers
  a user's concurrent edit.
- `attach` persists **`resolved_place_id` + `resolved_at`** (audit/override
  analysis); candidates are stored and scored in **Google's returned order**
  (`candidates[0]` primary), never reordered.
- `metrics` makes **no Google calls** and may be **exact or approximate/cached**
  (informational only); the scan **may throttle** Google calls without affecting
  correctness or idempotency.
- Confident → auto-attach (`placeSource:'google'`); "Not a place" → `'none'`
  (skipped forever); re-run skips tagged / `'none'` / pending; re-location by name
  prevents mis-tagging; a vanished stop → `stale`.
- The batch **only attaches identity** — never generates a description
  (generation/reuse is the cache's per-place dedup).
- `placeid_review` + all cross-user trip writes are **service-role only**, behind
  the **founder-gated** `place-id-admin` function.
- `place-id-admin`, `scoreMatch`, `parseTextSearch`, `locateStop` are covered
  (pure logic in vitest; function by probe).

## Out of scope / future

- The description **generation/regeneration** itself (owned by the cache).
- **Lazy on-view** resolution for ongoing new stops (the re-runnable batch covers
  the backlog).
- A **map preview** in the review screen; bulk "not a place"; auto-skip of obvious
  no-results (kept manual in v1 for safety).
- Auto-tuning the scoring weights/threshold from the match-metadata + review
  outcomes (the metadata is captured to enable this later).
