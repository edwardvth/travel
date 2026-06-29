-- docs/supabase/2026-06-29-delete-account.sql
-- Transactional, idempotent account-data deletion for Passage account deletion.
-- Called ONLY by the service-role `delete-account` Edge Function (SECURITY DEFINER).
-- Auth-user deletion is handled by the Edge Function afterwards (cannot live in a
-- Postgres tx).
--
-- Tuned to the LIVE schema (audited 2026-06-29, see
-- docs/superpowers/notes/account-deletion-schema-audit.md):
--   trip_members(id bigint, trip_id text, user_id uuid NULL, email text NOT NULL, added_at timestamptz)
--   trips(id text, owner_id uuid NULL, config jsonb, data jsonb, share_token text, ...)
--   profiles(id uuid, email, name, role, credits, settings jsonb, ...)
--   • No separate invite table — sharing is trips.share_token + trip_members rows,
--     so there is NO inviter-PII to scrub.
--   • trips.config / trips.data hold only neutral itinerary content (no per-user
--     name/email/author), so transfer needs NO JSON scrub.
--
-- Behaviour (see 2026-06-29-passage-account-deletion-design.md):
--   • owned trip with >=1 member who has a real auth account
--       -> transfer ownership to the earliest-ADDED such member; drop their now-
--          redundant membership row
--   • owned trip with no real member -> delete it (+ its trip_members rows)
--   • trips the user only joined      -> delete the user's membership rows
--   • profile row                     -> delete
-- Returns a summary { deleted, transferred, left }.

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
  -- 1. Owned trips: transfer to the earliest-added real member, else delete.
  for v_trip in select id from trips where owner_id = p_uid loop
    -- earliest-added OTHER member whose email maps to a real auth account.
    -- (Joining email -> auth.users resolves the new owner's id whether or not
    -- trip_members.user_id is populated, and naturally excludes pending invites
    -- to people who never signed up.)
    select u.id into v_new_owner
    from trip_members m
    join auth.users u on lower(u.email) = lower(m.email)
    where m.trip_id = v_trip.id
      and u.id <> p_uid
    order by m.added_at asc nulls last
    limit 1;

    if v_new_owner is not null then
      update trips set owner_id = v_new_owner where id = v_trip.id;
      -- drop the new owner's now-redundant membership row(s) on this trip
      delete from trip_members m
      using auth.users u
      where m.trip_id = v_trip.id
        and lower(u.email) = lower(m.email)
        and u.id = v_new_owner;
      v_transferred := v_transferred + 1;
    else
      delete from trip_members where trip_id = v_trip.id;
      delete from trips where id = v_trip.id;
      v_deleted := v_deleted + 1;
    end if;
  end loop;

  -- 2. Trips the user only joined: remove their membership rows (by id or email).
  with del as (
    delete from trip_members
    where user_id = p_uid or lower(email) = lower(p_email)
    returning 1
  )
  select count(*) into v_left from del;

  -- 3. Profile row (auth.users is deleted by the Edge Function afterwards).
  delete from profiles where id = p_uid;

  return jsonb_build_object('deleted', v_deleted, 'transferred', v_transferred, 'left', v_left);
end;
$$;

revoke all on function public.delete_account_data(uuid, text) from public, anon, authenticated;
