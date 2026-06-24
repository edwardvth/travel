-- Shared place-description cache. Service-role only; the enrich-place function is
-- the sole reader/writer. Run in the Supabase SQL editor.

create table if not exists public.place_cache (
  place_id              text        not null,
  prompt_version        int         not null,
  prompt_id             text,
  supersedes_version    int,
  generation_status     text        not null default 'generating'
                          check (generation_status in ('generating','ready','failed','unsupported')),
  generation_started_at timestamptz not null default now(),
  generation_attempts   int         not null default 0,
  generation_error      text,
  content_source        text        not null default 'generated'
                          check (content_source in ('generated','manual')),
  manual_lock           boolean     not null default false,
  is_stale              boolean     not null default false,
  history               text,
  facts                 jsonb,
  tips                  text,
  notice                text,
  source                text,
  place_name            text,
  address               text,
  lat                   double precision,
  lng                   double precision,
  place_types           jsonb,
  country_code          text,
  region                text,
  model                 text,
  generated_at          timestamptz,
  updated_at            timestamptz,
  last_verified_at      timestamptz,
  edited_by             text,
  primary key (place_id, prompt_version)
);

-- At most one curated override per place (deliberate, version-independent).
create unique index if not exists place_cache_one_manual_lock
  on public.place_cache (place_id) where manual_lock;

create table if not exists public.place_cache_audit (
  id             bigint generated always as identity primary key,
  place_id       text not null,
  prompt_version int,
  action         text not null check (action in ('generate','regenerate','manual_edit','mark_stale')),
  actor          text,
  model          text,
  prompt_id      text,
  detail         text,
  created_at     timestamptz not null default now()
);
create index if not exists place_cache_audit_place_idx on public.place_cache_audit (place_id, created_at);

-- Lock both tables to the service role: enable RLS with NO client policies.
-- (The service role used by the edge function bypasses RLS; anon/authenticated
--  get no policy => no access.)
alter table public.place_cache       enable row level security;
alter table public.place_cache_audit enable row level security;

-- Manual-edit + mark-stale audit trigger. Fires ONLY for a genuine manual edit
-- (content_source='manual' AND content changed) so a function regenerate
-- (which writes content_source='generated') never double-logs.
create or replace function public.place_cache_audit_trg() returns trigger as $$
begin
  if NEW.content_source = 'manual'
     and (NEW.history is distinct from OLD.history
          or NEW.facts is distinct from OLD.facts
          or NEW.tips is distinct from OLD.tips
          or NEW.notice is distinct from OLD.notice) then
    insert into public.place_cache_audit(place_id, prompt_version, action, actor, prompt_id, detail)
    values (NEW.place_id, NEW.prompt_version, 'manual_edit', coalesce(NEW.edited_by,'dashboard'), NEW.prompt_id, 'content edited');
  end if;
  if NEW.is_stale and not OLD.is_stale then
    insert into public.place_cache_audit(place_id, prompt_version, action, actor, detail)
    values (NEW.place_id, NEW.prompt_version, 'mark_stale', coalesce(NEW.edited_by,'dashboard'), 'marked stale');
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists place_cache_audit_after_update on public.place_cache;
create trigger place_cache_audit_after_update
  after update on public.place_cache
  for each row execute function public.place_cache_audit_trg();
