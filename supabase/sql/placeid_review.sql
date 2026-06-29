-- PlaceId backfill review queue. Service-role only; the place-id-admin edge
-- function is the sole reader/writer. Run in the Supabase SQL editor.
-- Rows are NEVER deleted — resolved/skipped/stale form a permanent audit trail.

create table if not exists public.placeid_review (
  id                bigint generated always as identity primary key,
  trip_id           text        not null,
  owner_id          text,
  day_index         int         not null,
  stop_index        int         not null,
  stop_name         text        not null,
  stop_lat          double precision,
  stop_lng          double precision,
  score             double precision,
  candidates        jsonb       not null default '[]'::jsonb,  -- frozen top ≤3 {placeId,name,address,lat,lng,types,distanceM}
  status            text        not null default 'pending'
                      check (status in ('pending','resolved','skipped','stale')),
  resolved_place_id text,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);

-- Deterministic review ordering (score DESC, created_at ASC, id ASC) + status filter.
create index if not exists placeid_review_queue_idx
  on public.placeid_review (status, score desc, created_at, id);

-- At most ONE pending row per stop. Historical (resolved/skipped/stale) rows are
-- intentionally preserved and NOT treated as duplicates.
create unique index if not exists placeid_review_one_pending
  on public.placeid_review (trip_id, day_index, stop_index) where status = 'pending';

-- Lock to the service role: enable RLS with NO client policies.
alter table public.placeid_review enable row level security;

-- Optimistic-concurrency token: ensure trips.updated_at auto-bumps on every
-- UPDATE so the backfill's conditional writes can detect a concurrent user edit.
-- Self-contained trigger function (no extension dependency — moddatetime is not
-- reliably present in the `extensions` schema on every Supabase project).
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();
