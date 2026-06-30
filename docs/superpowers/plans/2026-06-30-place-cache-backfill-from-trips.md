# Place-Cache Backfill From Trips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author one reviewed SQL file that seeds `place_cache` from existing in-depth stop descriptions in `trips.data` with zero AI/Google calls.

**Architecture:** A single self-contained `.sql` file with four independently-runnable blocks — PREVIEW (read-only counts + samples), INSERT (the migration), VERIFY (post-checks), ROLLBACK (one-statement undo). The PREVIEW and INSERT blocks share an identical CTE chain (`all_stops → candidates → scored → qualifying → ranked`); the chain is repeated verbatim in each block because the Supabase SQL editor runs each statement independently and CTEs do not persist across statements.

**Tech Stack:** PostgreSQL (Supabase SQL editor, project `wnpanbjzmcsvhfyjdczv`). No app code, no edge functions, no TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-30-place-cache-backfill-from-trips-design.md`

**Deliverable file:** `docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql`

---

## File Structure

- **Create:** `docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql` — the only artifact. Four clearly-commented sections in run order: PREVIEW → INSERT → VERIFY → ROLLBACK.

There are no other files. No app code changes (the cache read path already shipped).

## The shared CTE chain (reference — used verbatim in Tasks 2 and 3)

This chain is the heart of the migration. It appears identically in the PREVIEW
block (ending in a summary SELECT) and the INSERT block (ending in `INSERT … SELECT`).

```sql
with all_stops as (
  -- Flatten every stop across every trip, with HARD array guards so a single
  -- malformed legacy trip (non-array days/stops) degrades to empty, never errors.
  select ss.stop_obj as stop
  from public.trips t
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(t.data->'days') = 'array' then t.data->'days' else '[]'::jsonb end
  ) as dd(day_obj)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(dd.day_obj->'stops') = 'array' then dd.day_obj->'stops' else '[]'::jsonb end
  ) as ss(stop_obj)
),
candidates as (
  select
    a.stop->>'placeId'                                          as place_id,
    a.stop->>'history'                                          as history,
    nullif(a.stop->>'tips','')                                  as tips,
    nullif(a.stop->>'notice','')                                as notice,
    nullif(a.stop->>'goodFor','')                               as good_for,
    nullif(a.stop->>'name','')                                  as place_name,
    nullif(a.stop->>'address','')                               as address,
    case when (a.stop->>'lat') ~ '^-?\d+(\.\d+)?$' then (a.stop->>'lat')::double precision end as lat,
    case when (a.stop->>'lng') ~ '^-?\d+(\.\d+)?$' then (a.stop->>'lng')::double precision end as lng,
    case when jsonb_typeof(a.stop->'placeTypes') = 'array' then a.stop->'placeTypes' end as place_types,
    -- string-only, non-empty facts (objects/numbers dropped); '[]' when none
    coalesce((
      select jsonb_agg(f.elem)
      from jsonb_array_elements(
        case when jsonb_typeof(a.stop->'facts') = 'array' then a.stop->'facts' else '[]'::jsonb end
      ) as f(elem)
      where jsonb_typeof(f.elem) = 'string' and length(trim(f.elem #>> '{}')) > 0
    ), '[]'::jsonb)                                             as facts_clean
  from all_stops a
  -- placeId must match the app's own validation shape, else the row would be
  -- dead (the edge function rejects other shapes before reading the cache).
  where a.stop->>'placeId' ~ '^[A-Za-z0-9_-]{16,}$'
),
scored as (
  select
    c.*,
    jsonb_array_length(c.facts_clean) as facts_count,
    length(coalesce(c.history,'')) as hist_len,
    length(coalesce(c.tips,'')) as tips_len
  from candidates c
),
qualifying as (
  -- Story-led quality bar: deep Story AND (>=2 string facts OR a real Experience).
  select s.*, (s.hist_len + s.tips_len + 50 * s.facts_count) as richness
  from scored s
  where s.hist_len >= 300
    and (s.facts_count >= 2 or s.tips_len >= 40)
),
ranked as (
  -- One row per place: keep the richest qualifying copy across all trips.
  select distinct on (q.place_id) q.*
  from qualifying q
  order by q.place_id, q.richness desc
)
```

---

### Task 1: Create the file with header + PREVIEW block (read-only)

**Files:**
- Create: `docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql`

- [ ] **Step 1: Write the file header + PREVIEW block**

Create `docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql` with this content:

```sql
-- docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql
--
-- ONE-TIME, FREE backfill of the shared place-description cache from existing
-- in-depth stop descriptions already stored in trips.data (JSONB). NO AI calls,
-- NO Google Place Details calls. Read-only on `trips`, insert-only on
-- `place_cache`. Run in the Supabase SQL editor (project wnpanbjzmcsvhfyjdczv).
--
-- Spec: docs/superpowers/specs/2026-06-30-place-cache-backfill-from-trips-design.md
--
-- RUN ORDER:  (1) PREVIEW  →  (2) INSERT  →  (3) VERIFY.   (4) ROLLBACK if needed.
-- The CTE chain in PREVIEW and INSERT is identical; it is repeated because the
-- SQL editor runs each statement independently (CTEs do not persist).
--
-- Quality bar (Story-led): history >= 300 chars AND (>= 2 string facts OR tips >= 40).
-- Dedupe: one row per placeId, richest qualifying copy. Never overwrites an
-- existing row (ON CONFLICT DO NOTHING). Reversible via model='migrated-from-trips'.

------------------------------------------------------------------------------
-- (1) PREVIEW — read-only. Run this FIRST. Writes nothing.
--     Returns one summary row: how many places qualify, how many are excluded
--     as too thin, how many already have a v3 cache row, and the net to insert.
------------------------------------------------------------------------------
with all_stops as (
  select ss.stop_obj as stop
  from public.trips t
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(t.data->'days') = 'array' then t.data->'days' else '[]'::jsonb end
  ) as dd(day_obj)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(dd.day_obj->'stops') = 'array' then dd.day_obj->'stops' else '[]'::jsonb end
  ) as ss(stop_obj)
),
candidates as (
  select
    a.stop->>'placeId'           as place_id,
    a.stop->>'history'           as history,
    nullif(a.stop->>'tips','')   as tips,
    coalesce((
      select jsonb_agg(f.elem)
      from jsonb_array_elements(
        case when jsonb_typeof(a.stop->'facts') = 'array' then a.stop->'facts' else '[]'::jsonb end
      ) as f(elem)
      where jsonb_typeof(f.elem) = 'string' and length(trim(f.elem #>> '{}')) > 0
    ), '[]'::jsonb)              as facts_clean
  from all_stops a
  where a.stop->>'placeId' ~ '^[A-Za-z0-9_-]{16,}$'
),
scored as (
  select c.*, jsonb_array_length(c.facts_clean) as facts_count,
         length(coalesce(c.history,'')) as hist_len,
         length(coalesce(c.tips,'')) as tips_len
  from candidates c
),
qualifying as (
  select s.*, (s.hist_len + s.tips_len + 50 * s.facts_count) as richness
  from scored s
  where s.hist_len >= 300 and (s.facts_count >= 2 or s.tips_len >= 40)
),
ranked as (
  select distinct on (q.place_id) q.*
  from qualifying q
  order by q.place_id, q.richness desc
)
select
  (select count(*) from ranked) as qualifying_places,
  (select count(distinct c.place_id) from candidates c
     where not exists (select 1 from qualifying q where q.place_id = c.place_id)
  ) as excluded_too_thin_places,
  (select count(*) from ranked r
     where exists (select 1 from public.place_cache pc
                    where pc.place_id = r.place_id and pc.prompt_version = 3)
  ) as already_cached_v3,
  (select count(*) from ranked r
     where not exists (select 1 from public.place_cache pc
                        where pc.place_id = r.place_id and pc.prompt_version = 3)
  ) as net_will_insert;
```

- [ ] **Step 2: Sanity-check the PREVIEW SQL mentally against the schema**

Confirm against `supabase/sql/place_cache.sql`: PK is `(place_id, prompt_version)`;
`facts` is `jsonb`; `history`/`tips`/`good_for` are `text`. Confirm `trips.data`
is the JSONB column holding `{ days: [ { stops: [ … ] } ] }` (see CLAUDE.md "Data
shapes"). No write occurs in this block.

- [ ] **Step 3: Commit**

```bash
git add docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql
git commit -m "feat(sql): place_cache backfill — PREVIEW block (read-only)"
```

---

### Task 2: Append the INSERT block

**Files:**
- Modify: `docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql` (append)

- [ ] **Step 1: Append the INSERT block**

Append to the file:

```sql

------------------------------------------------------------------------------
-- (2) INSERT — the migration. Run AFTER reviewing the PREVIEW numbers.
--     Inserts one ready row per qualifying place; ON CONFLICT DO NOTHING means
--     existing/manual rows are never touched.
------------------------------------------------------------------------------
with all_stops as (
  select ss.stop_obj as stop
  from public.trips t
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(t.data->'days') = 'array' then t.data->'days' else '[]'::jsonb end
  ) as dd(day_obj)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(dd.day_obj->'stops') = 'array' then dd.day_obj->'stops' else '[]'::jsonb end
  ) as ss(stop_obj)
),
candidates as (
  select
    a.stop->>'placeId'                                          as place_id,
    a.stop->>'history'                                          as history,
    nullif(a.stop->>'tips','')                                  as tips,
    nullif(a.stop->>'notice','')                                as notice,
    nullif(a.stop->>'goodFor','')                               as good_for,
    nullif(a.stop->>'name','')                                  as place_name,
    nullif(a.stop->>'address','')                               as address,
    case when (a.stop->>'lat') ~ '^-?\d+(\.\d+)?$' then (a.stop->>'lat')::double precision end as lat,
    case when (a.stop->>'lng') ~ '^-?\d+(\.\d+)?$' then (a.stop->>'lng')::double precision end as lng,
    case when jsonb_typeof(a.stop->'placeTypes') = 'array' then a.stop->'placeTypes' end as place_types,
    coalesce((
      select jsonb_agg(f.elem)
      from jsonb_array_elements(
        case when jsonb_typeof(a.stop->'facts') = 'array' then a.stop->'facts' else '[]'::jsonb end
      ) as f(elem)
      where jsonb_typeof(f.elem) = 'string' and length(trim(f.elem #>> '{}')) > 0
    ), '[]'::jsonb)                                             as facts_clean
  from all_stops a
  where a.stop->>'placeId' ~ '^[A-Za-z0-9_-]{16,}$'
),
scored as (
  select c.*, jsonb_array_length(c.facts_clean) as facts_count,
         length(coalesce(c.history,'')) as hist_len,
         length(coalesce(c.tips,'')) as tips_len
  from candidates c
),
qualifying as (
  select s.*, (s.hist_len + s.tips_len + 50 * s.facts_count) as richness
  from scored s
  where s.hist_len >= 300 and (s.facts_count >= 2 or s.tips_len >= 40)
),
ranked as (
  select distinct on (q.place_id) q.*
  from qualifying q
  order by q.place_id, q.richness desc
)
insert into public.place_cache (
  place_id, prompt_version, generation_status, generation_started_at,
  history, facts, tips, notice, good_for,
  place_name, address, lat, lng, place_types,
  content_source, prompt_id, model,
  generated_at, updated_at, last_verified_at
)
select
  r.place_id, 3, 'ready', now(),
  r.history, r.facts_clean, r.tips, r.notice, r.good_for,
  r.place_name, r.address, r.lat, r.lng, r.place_types,
  'generated', 'migrated-from-trips-v3', 'migrated-from-trips',
  now(), now(), null
from ranked r
on conflict (place_id, prompt_version) do nothing;
```

- [ ] **Step 2: Verify the column/value lists line up (20 = 20)**

Count the INSERT column list (20) and the SELECT value list (20); confirm order
matches the field-mapping table in the spec. Confirm `last_verified_at` is `null`,
`content_source='generated'`, `prompt_id='migrated-from-trips-v3'`,
`model='migrated-from-trips'`, `prompt_version=3`, `generation_status='ready'`.

- [ ] **Step 3: Commit**

```bash
git add docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql
git commit -m "feat(sql): place_cache backfill — INSERT block"
```

---

### Task 3: Append the VERIFY + ROLLBACK blocks

**Files:**
- Modify: `docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql` (append)

- [ ] **Step 1: Append VERIFY + ROLLBACK**

Append to the file:

```sql

------------------------------------------------------------------------------
-- (3) VERIFY — run AFTER the INSERT.
------------------------------------------------------------------------------
select count(*) as migrated_rows
from public.place_cache
where model = 'migrated-from-trips';

-- Spot-check a few migrated rows (note: last_verified_at must be NULL).
select place_id,
       prompt_version,
       generation_status,
       left(history, 80)        as history_preview,
       jsonb_array_length(facts) as facts_n,
       good_for,
       content_source,
       prompt_id,
       model,
       last_verified_at
from public.place_cache
where model = 'migrated-from-trips'
order by updated_at desc
limit 5;

------------------------------------------------------------------------------
-- (4) ROLLBACK — undo the entire batch (only the migrated rows). Run only if
--     you want to revert; it never touches generated/manual/other rows.
------------------------------------------------------------------------------
-- delete from public.place_cache where model = 'migrated-from-trips';
```

Note: the ROLLBACK `delete` is intentionally left **commented out** so it can
never run by accident; the operator uncomments it only to revert.

- [ ] **Step 2: Commit**

```bash
git add docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql
git commit -m "feat(sql): place_cache backfill — VERIFY + ROLLBACK blocks"
```

---

### Task 4: Operator run sequence (manual, in Supabase SQL editor)

This task is executed by the human operator against the live project; there is
nothing to code. Document it in the handoff.

- [ ] **Step 1: Run PREVIEW**

Paste the PREVIEW block into the Supabase SQL editor and Run. Read the one-row
result: `qualifying_places`, `excluded_too_thin_places`, `already_cached_v3`,
`net_will_insert`. Sanity-check the split looks reasonable (e.g. most stubs
excluded). Because it is read-only, a syntax error here is harmless and surfaces
before any write.

- [ ] **Step 2: Run INSERT**

Paste the INSERT block and Run. Expected: `INSERT 0 N` where `N ≈ net_will_insert`
from the preview.

- [ ] **Step 3: Run VERIFY**

Run the two VERIFY queries. Expected: `migrated_rows` ≈ total migrated; spot-check
rows show `generation_status='ready'`, `prompt_version=3`, `last_verified_at` NULL,
`prompt_id='migrated-from-trips-v3'`, a real `history_preview`, and `facts_n ≥ 0`.

- [ ] **Step 4: (Optional) Confirm live read**

Open a trip whose stop's `placeId` was just migrated; its description should load
instantly from the cache (a `get` cache HIT — no generation). `goodFor` chip
appears only if that stop already had `goodFor`.

---

## Self-Review (against the spec)

**1. Spec coverage:**
- Free / no AI / no Google → no `ai-proxy` or Places calls anywhere ✅ (Tasks 1–3 are pure SQL over `trips`/`place_cache`).
- Quality bar (history≥300 AND (≥2 string facts OR tips≥40)) → `qualifying` CTE ✅.
- placeId shape filter `^[A-Za-z0-9_-]{16,}$` → `candidates` WHERE ✅.
- Dedupe richest → `ranked` DISTINCT ON + `richness` ✅.
- Hard array guards (days/stops/facts/placeTypes) → `case when jsonb_typeof…='array'` in all four spots ✅.
- Guarded lat/lng casts → `~ '^-?\d+(\.\d+)?$'` ✅.
- String-only facts → `facts_clean` subquery filters `jsonb_typeof='string'` and non-empty ✅; same drives `facts_count`.
- Field/provenance: `prompt_version=3`, `generation_status='ready'`, `content_source='generated'`, `prompt_id='migrated-from-trips-v3'`, `model='migrated-from-trips'`, `last_verified_at=NULL`, timestamps `now()` → INSERT SELECT ✅.
- `ON CONFLICT (place_id,prompt_version) DO NOTHING` → INSERT ✅.
- PREVIEW / INSERT / VERIFY / ROLLBACK sections present and separated ✅.
- Reversible via `model` marker → ROLLBACK ✅.

**2. Placeholder scan:** No TBD/TODO; every block is complete runnable SQL ✅.

**3. Type/name consistency:** Column names match `place_cache.sql` (`good_for`,
`place_types`, `last_verified_at`, `prompt_id`, `content_source`). CTE names
(`all_stops`/`candidates`/`scored`/`qualifying`/`ranked`) are identical between
PREVIEW and INSERT. INSERT column count (20) == SELECT value count (20) ✅.

No gaps found.
