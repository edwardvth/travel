# Passage — In-App Account Deletion — Design Spec

> **Status:** Approved (owner) · **Date:** 2026-06-29
> Implements plan tasks **B2 / B2.5** of `2026-06-29-passage-app-store-readiness.md`. Required by Apple
> **Guideline 5.1.1(v)** — any app with account creation must offer in-app account deletion that removes the
> account record + associated personal data (not just deactivate).

## Goal

Let a signed-in user permanently delete their account and personal data from inside the app, with a clear,
deliberate confirmation. Deleting an account:

- **deletes the travels they own that nobody else is in**, but
- **hands off** an owned travel that has other real members to one of those members (Zoom-style host transfer)
  so collaborators don't lose it, and
- **removes the user from travels they only joined** (owned by someone else) — those travels stay.

## Data model (audited 2026-06-29)

- `trips` — columns `id, owner_id, title, subtitle, config, data, updated_at`. **Ownership = `owner_id` (the
  owner's auth user id)**; nullable for legacy/anon trips. Cover images + photos live as URLs / data-URLs inside
  the JSONB `config`/`data` (so they're removed with the trip row).
- `trip_members` — links a user to a shared trip (created via `add_trip_member(p_id, p_email)`). RLS scopes rows
  to the current user, so a member row carries a user identity (a `user_id` and/or `email`). **Exact columns to be
  confirmed against the live schema at plan time** (see Open Questions).
- **No Supabase Storage** in the Vite app — nothing to clean in a bucket. (Only the legacy `Trip.html` used
  Storage; out of scope.)
- Existing server RPCs already enforce ownership: `create_trip`, `delete_trip(p_id)`, `add_trip_member`,
  `remove_trip_member(p_id, p_email)`, `trip_owner_emails`, `create_invite`.
- Global caches (`video_cache`, cover cache, enrichment cache) are trip-agnostic / non-personal → **excluded**.

## Behaviour (the rules)

Authenticated server-side from the caller's JWT → `uid` + `email`.

1. **Owned travels** (`trips.owner_id = uid`), for each:
   - Identify **other members with a real account** — members whose `user_id` is resolvable (they actually
     signed in), excluding the departing user and excluding pending **email-only** invites.
   - **≥1 real member →** *transfer*: set `owner_id` to the **earliest-joined** such member (longest-standing
     collaborator). The travel persists, now owned by them. Remove that member's now-redundant `trip_members`
     row; leave other members' rows intact. **Then scrub departing-user metadata** from the transferred travel:
     - **`trips.config` / `trips.data` JSON** — strip any fields that carry the deleting user's personal data
       (e.g. name, email, author/attribution metadata, per-user preferences), **preserving the shared itinerary
       content** remaining collaborators need. (If the JSON only holds neutral itinerary content, this is a
       verified no-op — the implementation must check, not assume.)
     - **Pending invites** on the transferred travel — remove or neutralize any invite rows that carry the
       departing user as sender (`created_by` / `invited_by` / `owner_email`-type fields), so a transferred trip
       doesn't retain the deleted user's personal metadata.
   - **No real member →** *delete* the travel; its `trip_members` + invite rows go with it.
2. **Joined travels** (the user's `trip_members` rows on trips owned by others) → **delete those rows** (the user
   leaves; the travel stays for its owner/others). Match on the user's `user_id` **and** `email` to catch both
   accepted and email-keyed rows.
3. **Profile** (`profiles` where `id = uid`) → delete.
4. **Auth user** → `auth.admin.deleteUser(uid)`.
5. **Apple-token revoke** → a clearly-marked hook that is a **no-op ONLY while Sign in with Apple is disabled**
   (`APPLE_SIGNIN_ENABLED === false`). Apple requires revoking the user's token on account deletion, so **this
   hook must become required (not a no-op) before any Sign in with Apple login ships** — call it out in the SIWA
   enablement checklist.
6. **Excluded:** global caches (non-personal).

**"Earliest-joined" tiebreak:** order candidate members by `trip_members.created_at` ascending if present, else
by row id — deterministic. Only members with a resolvable `user_id` are candidates.

**Notification:** v1 is a **silent transfer** — the new owner simply sees the travel become theirs in their
list. A "you're now the owner" email needs Resend (not deployed) → deferred.

## Architecture

Two layers — the **database work is one atomic Postgres transaction**, the Edge Function only orchestrates auth.

- **Postgres RPC `delete_account_data(p_uid uuid, p_email text)`** (SECURITY DEFINER, in a migration). Runs the
  entire DB algorithm above — owned-trip transfer/delete, JSON + invite scrub, membership removal, profile
  delete — **inside a single transaction**, so the database portion is all-or-nothing. Written to be
  **idempotent** (safe to re-run if a retry happens). Returns a summary `{ deleted, transferred, left }`.
- **Edge Function `supabase/functions/delete-account/index.ts`** (service-role) — the orchestrator only:
  1. requires `Authorization: Bearer <access_token>`; resolves the caller via `auth.getUser(token)` —
     **never trusts a `uid`/`email` from the request body**;
  2. calls `delete_account_data(uid, email)` (service role);
  3. runs the Apple-revoke hook (no-op while SIWA disabled);
  4. calls `auth.admin.deleteUser(uid)` **last** (Auth deletion can't join the Postgres transaction);
  5. returns a structured result. Service role stays inside the function. Deployed to ref `wnpanbjzmcsvhfyjdczv`.

  *(Auth deletion is last and separate because it isn't part of the DB transaction — see Failure handling.)*
- **Client:** a `deleteAccount()` helper (in `auth/AuthProvider.tsx` or a small `auth/deleteAccount.ts`) that
  invokes the function with the user's access token, then reuses the existing `signOut` teardown (clear `sb-*`
  localStorage, route to `/`).
- **UI:** a **Danger zone** "Delete account" action in `components/AccountSettings.tsx` (near the existing Legal &
  support section). Opens a **type-to-confirm dialog**: body explains the consequence ("Permanently deletes your
  account and the travels you own. Travels you've shared move to a collaborator; travels you joined stay with
  their owner. This can't be undone."), a text input that must equal **`DELETE`** to enable the destructive
  button. The current `ConfirmDialog` likely needs a typed-confirm variant (extend it or add a dedicated
  `DangerConfirm`) — decided at plan time.

## Failure handling

- Unauthenticated / invalid token → **401**, nothing runs.
- **Database deletion is transactional and idempotent.** If the `delete_account_data` RPC fails, the transaction
  rolls back — no partial DB changes — and the function returns an error; the client keeps the user signed in.
- **Auth deletion happens last and is *not* part of the DB transaction.** If `auth.admin.deleteUser` fails *after*
  the DB cleanup committed, the function returns a specific **`auth_delete_failed`** error and the operation is
  **retryable** (the idempotent RPC makes a retry safe). It must **not** claim "no data was deleted" — the honest
  state is "your data was removed; finishing account removal — retry." The client surfaces this accurately and
  offers retry rather than pretending nothing happened.
- Client only tears down the session + redirects on a clean success; on any error it stays signed in and shows
  the specific message.

## Testing

- **Client delete flow:** confirm-gate enables only on exact `DELETE`; calls the function with the session token;
  on success → sign-out teardown + redirect; on **failure → shows the specific error and does NOT redirect**
  (stays signed in); on **`auth_delete_failed` → shows the retryable message** (data removed, finish removal).
- **Database RPC logic** (the core cases): owned + no real members → trip **deleted**; owned + a real member →
  ownership **transferred** to the earliest-joined real member; owned + only a pending **email-only** invite →
  trip **deleted**; user is a **member of another's trip** → membership row removed, trip remains; **transfer
  scrub** → departing-user metadata removed from transferred `config`/`data` + pending invites, shared content
  preserved; **idempotency** → re-running the RPC after a partial retry doesn't corrupt or double-delete.
- **Edge Function:** wrong/no token → **401**; body-supplied `uid`/`email` are ignored (caller resolved from
  token only). Pure transfer-selection logic extracted to a testable helper where practical.

## Schema audit (first plan task — resolve against the live DB before writing the RPC)

Confirm the real columns/relationships the RPC depends on:
1. **`trip_members`** — `user_id`? `email`? `created_at`? `id`? (Drives transfer-target resolution + how the
   user's own rows are matched. If no `user_id`, resolve email→`user_id` via `profiles`/`auth.users`. If no
   `created_at`, pick a deterministic "earliest-joined" fallback.)
2. **Is the owner also stored in `trip_members`**, or only in `trips.owner_id`? (Affects redundant-row cleanup.)
3. **Invite table** — name, columns, and **whether it carries the inviter's personal metadata** (`created_by` /
   `invited_by` / `owner_email`), plus FK/cascade behavior to `trips`.
4. **`trips.config` / `trips.data`** — do they contain **user-specific** metadata (name, email, author,
   per-user prefs), or only neutral itinerary content? Determines whether the transfer scrub is real work or a
   verified no-op.

**Done when** the exact transfer/delete/scrub algorithm is mapped to real columns. Then implement the DB work as
the single transactional `delete_account_data` RPC (matching `delete_trip`'s cascade for the delete branch).

## Out of scope

**Sign in with Apple token revocation implementation is deferred only while SIWA login is disabled.** The
delete-account function must include the revoke hook/checklist now, and real token revocation becomes required
before any SIWA auth path ships. Transfer-notification emails, data export, undo/grace-period, and Android remain
out of scope.
