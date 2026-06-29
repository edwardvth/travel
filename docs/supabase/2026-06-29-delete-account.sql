-- docs/supabase/2026-06-29-delete-account.sql
-- Transactional, idempotent account-data deletion for Passage account deletion.
-- Called ONLY by the service-role `delete-account` Edge Function. Runs entirely
-- inside the function's transaction (SECURITY DEFINER). Auth-user deletion is
-- handled by the Edge Function afterwards (cannot live in a Postgres tx).
--
-- Behaviour (see 2026-06-29-passage-account-deletion-design.md):
--  • owned trip with >=1 real member  -> transfer to earliest-joined real member,
--    drop that member's now-redundant membership row, scrub sender PII from invites
--  • owned trip with no real member   -> delete it (cascade members + invites)
--  • trips the user only joined        -> delete the user's membership rows
--  • profile row                       -> delete
-- Returns a summary so the caller can log/show counts.

create or replace function public.delete_account_data(p_uid uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
  v_new_owner uuid;
  v_deleted int := 0;
  v_transferred int := 0;
  v_left int := 0;
begin
  -- 1. Owned trips: transfer if a real collaborator exists, else delete.
  for v_trip in select id from trips where owner_id = p_uid loop
    -- earliest-joined OTHER member who has a real auth account.
    -- AUDIT-ADJUST(members): this assumes trip_members(email, created_at). If the
    -- table also has user_id, prefer m.user_id over the email->users lookup.
    select u.id into v_new_owner
    from trip_members m
    join auth.users u on lower(u.email) = lower(m.email)
    where m.trip_id = v_trip.id
      and lower(m.email) <> lower(p_email)
    order by m.created_at asc nulls last
    limit 1;

    if v_new_owner is not null then
      update trips set owner_id = v_new_owner where id = v_trip.id;
      -- drop the new owner's redundant membership row
      delete from trip_members m
      using auth.users u
      where m.trip_id = v_trip.id and lower(u.email) = lower(m.email) and u.id = v_new_owner;
      -- AUDIT-ADJUST(invites): neutralize sender PII on pending invites for this trip.
      -- If the invite table/columns differ, fix the table name + column here.
      -- If invites carry NO sender PII, delete this statement.
      update trip_invites set created_by = null
      where trip_id = v_trip.id and created_by = p_uid;
      -- AUDIT-ADJUST(json-scrub): the documented TripConfig/TripData hold only
      -- neutral itinerary content, so NO scrub by default. If the audit finds
      -- per-user PII in config/data, scrub those keys here, e.g.:
      --   update trips set config = config - 'someUserField' where id = v_trip.id;
      v_transferred := v_transferred + 1;
    else
      delete from trips where id = v_trip.id;  -- members + invites cascade via FK
      v_deleted := v_deleted + 1;
    end if;
  end loop;

  -- 2. Trips the user only joined: remove their membership rows.
  with del as (
    delete from trip_members where lower(email) = lower(p_email) returning 1
  )
  select count(*) into v_left from del;

  -- 3. Profile row (auth.users is deleted by the Edge Function afterwards).
  delete from profiles where id = p_uid;

  return jsonb_build_object('deleted', v_deleted, 'transferred', v_transferred, 'left', v_left);
end;
$$;

revoke all on function public.delete_account_data(uuid, text) from public, anon, authenticated;
