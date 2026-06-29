-- Shared, global destination hero-VIDEO link cache (Pexels).
--
-- Keyed by a NORMALIZED "city|country" (accent-folded, whitespace-collapsed) so
-- ambiguous cities don't collide (paris|france vs paris|usa). Each destination
-- is resolved on Pexels only ONCE (until stale) — every later trip (any user) is
-- a free cache hit. Touched ONLY by the `pexels-video` edge function (service
-- role); the client never reads or writes it.
--
--   resolved_query / resolved_level : what produced the clip (the city query, or
--       the country when the city was sparse) — provenance.
--   score                            : the heuristic quality score of the chosen
--       clip, so a cached COUNTRY entry competes fairly (no invented score).
--   pexels_url / photographer_*      : attribution metadata (Pexels API guidelines
--       ask for a Pexels link + photographer credit).
--   updated_at                       : drives a soft TTL — rows older than ~180d
--       are re-resolved, so new Pexels footage can win. (MUST be bumped on every
--       upsert, else stale rows re-hit Pexels forever.)
--
-- Run once in the Supabase dashboard → SQL Editor (idempotent; safe to re-run).

create table if not exists public.video_cache (
  query_key         text primary key,                -- normalized "city|country"
  url               text not null,                    -- resolved video .mp4 CDN link
  poster            text,                             -- preview poster image
  resolved_query    text,                             -- query that produced it
  resolved_level    text check (resolved_level in ('city', 'country')),
  score             numeric,                          -- heuristic quality score
  pexels_url        text,                             -- attribution: Pexels page
  photographer_name text,
  photographer_url  text,
  source            text not null default 'pexels',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Add the columns if an older version of this table already exists.
alter table public.video_cache add column if not exists poster            text;
alter table public.video_cache add column if not exists resolved_query    text;
alter table public.video_cache add column if not exists resolved_level    text;
alter table public.video_cache add column if not exists score             numeric;
alter table public.video_cache add column if not exists pexels_url        text;
alter table public.video_cache add column if not exists photographer_name text;
alter table public.video_cache add column if not exists photographer_url  text;
alter table public.video_cache add column if not exists updated_at        timestamptz not null default now();

create index if not exists video_cache_updated_at_idx on public.video_cache (updated_at);

-- Lock it down: RLS on with NO policies, so anon/authenticated clients have no
-- access. The edge function uses the service role, which bypasses RLS.
alter table public.video_cache enable row level security;
