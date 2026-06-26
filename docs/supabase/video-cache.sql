-- Shared, global destination hero-VIDEO link cache.
--
-- Keyed by a NORMALIZED `city|country` (accent-folded, whitespace-collapsed) so
-- ambiguous cities don't collide (paris|france vs paris|usa), and the SAME
-- destination is searched on Pexels only ONCE ever — every later trip (any user)
-- is a free cache hit. Touched ONLY by the `pexels-video` edge function (service
-- role); the client never reads or writes it.
--
-- `resolved_query` records WHAT actually produced the clip (the city, or — when
-- the city was sparse — the country), so we know the provenance. `created_at`
-- drives a soft TTL: the edge function treats rows older than ~180 days as a miss
-- and re-resolves, so the cache benefits from newly-added Pexels footage.
--
-- Run once in the Supabase dashboard → SQL Editor (idempotent).

create table if not exists public.video_cache (
  query_key      text primary key,                   -- normalized "city|country"
  url            text not null,                       -- resolved Pexels .mp4 CDN link
  poster         text,                                -- preview poster (Pexels video `image`)
  resolved_query text,                                -- the query that produced it (city or country)
  source         text not null default 'pexels',
  created_at     timestamptz not null default now()
);

-- Lock it down: enable RLS with NO policies, so anon/authenticated clients have
-- no access at all. The edge function uses the service role, which bypasses RLS.
alter table public.video_cache enable row level security;
