-- Cross-device account settings (additive) + narration storage bucket.
alter table profiles add column if not exists settings jsonb not null default '{}'::jsonb;

-- A user reads/updates their own profile row.
drop policy if exists "profile self read" on profiles;
create policy "profile self read"   on profiles for select using (id = auth.uid());
drop policy if exists "profile self update" on profiles;
create policy "profile self update" on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Private bucket for cached narration audio (served via the narrate function only).
insert into storage.buckets (id, name, public) values ('narration','narration', false)
  on conflict (id) do nothing;
