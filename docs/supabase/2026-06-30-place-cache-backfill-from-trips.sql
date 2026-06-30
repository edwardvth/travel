-- docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql
--
-- ONE-TIME, FREE backfill of the shared place-description cache from existing
-- in-depth stop descriptions already stored in trips.data (JSONB). NO AI calls,
-- NO Google Place Details calls. Read-only on `trips`, insert-only on
-- `place_cache`. Run in the Supabase SQL editor (project wnpanbjzmcsvhfyjdczv).
--
-- Spec: docs/superpowers/specs/2026-06-30-place-cache-backfill-from-trips-design.md
-- Plan: docs/superpowers/plans/2026-06-30-place-cache-backfill-from-trips.md
--
-- RUN ORDER:  (1) PREVIEW  ->  (2) INSERT  ->  (3) VERIFY.   (4) ROLLBACK if needed.
-- The CTE chain in PREVIEW and INSERT is identical; it is repeated because the
-- SQL editor runs each statement independently (CTEs do not persist).
--
-- Quality bar (Story-led): history >= 300 chars AND (>= 2 string facts OR tips >= 40).
-- Dedupe: one row per placeId, richest qualifying copy. Never overwrites an
-- existing row (ON CONFLICT DO NOTHING). Reversible via model='migrated-from-trips'.

------------------------------------------------------------------------------
-- (1) PREVIEW -- read-only. Run this FIRST. Writes nothing.
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

------------------------------------------------------------------------------
-- (2) INSERT -- the migration. Run AFTER reviewing the PREVIEW numbers.
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

------------------------------------------------------------------------------
-- (3) VERIFY -- run AFTER the INSERT.
------------------------------------------------------------------------------
select count(*) as migrated_rows
from public.place_cache
where model = 'migrated-from-trips';

-- Spot-check a few migrated rows (note: last_verified_at must be NULL).
select place_id,
       prompt_version,
       generation_status,
       left(history, 80)         as history_preview,
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
-- (4) ROLLBACK -- undo the entire batch (only the migrated rows). Run only if
--     you want to revert; it never touches generated/manual/other rows.
--     Left commented out so it cannot run by accident -- uncomment to revert.
------------------------------------------------------------------------------
-- delete from public.place_cache where model = 'migrated-from-trips';
