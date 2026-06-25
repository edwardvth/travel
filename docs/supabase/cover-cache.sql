-- Shared, global cover-image link cache.
--
-- Keyed by the normalized location/landmark query (e.g. 'eiffel tower',
-- 'st. louis'), it stores the resolved Unsplash CDN URL so the SAME location is
-- searched on Unsplash only ONCE ever — every later trip (any user) is a free
-- cache hit. Touched ONLY by the `unsplash-photo` edge function (service role);
-- the client never reads or writes it.
--
-- Run once in the Supabase dashboard → SQL Editor (idempotent).

create table if not exists public.cover_cache (
  query_key  text primary key,                       -- normalized location query
  url        text not null,                          -- resolved image CDN link
  source     text not null default 'unsplash',       -- provenance
  created_at timestamptz not null default now()
);

-- Lock it down: enable RLS with NO policies, so anon/authenticated clients have
-- no access at all. The edge function uses the service role, which bypasses RLS.
alter table public.cover_cache enable row level security;
