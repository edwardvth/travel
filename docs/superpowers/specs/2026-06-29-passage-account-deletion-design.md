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
     collaborator). The travel persists, now owned by them. (Remove that member's now-redundant `trip_members`
     row; leave other members' rows intact.)
   - **No real member →** *delete* the travel; its `trip_members` + invite rows go with it.
2. **Joined travels** (the user's `trip_members` rows on trips owned by others) → **delete those rows** (the user
   leaves; the travel stays for its owner/others). Match on the user's `user_id` **and** `email` to catch both
   accepted and email-keyed rows.
3. **Profile** (`profiles` where `id = uid`) → delete.
4. **Auth user** → `auth.admin.deleteUser(uid)`.
5. **Apple-token revoke** → deferred (no Apple creds yet); the function leaves a clearly-marked hook that is a
   no-op until `APPLE_SIGNIN_ENABLED` work lands.
6. **Excluded:** global caches (non-personal).

**"Earliest-joined" tiebreak:** order candidate members by `trip_members.created_at` ascending if present, else
by row id — deterministic. Only members with a resolvable `user_id` are candidates.

**Notification:** v1 is a **silent transfer** — the new owner simply sees the travel become theirs in their
list. A "you're now the owner" email needs Resend (not deployed) → deferred.

## Architecture

- **Edge Function `supabase/functions/delete-account/index.ts`** (service-role). One transactional-ish pass that
  runs the algorithm above in FK-safe order. Service role is required because `auth.admin.deleteUser` is
  privileged and the function must read/modify rows across users (transfer target) beyond the caller's RLS scope.
  Mirrors the existing `ai-proxy` server-side pattern. Deployed to ref `wnpanbjzmcsvhfyjdczv`.
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

- Function authenticates the caller; rejects unauthenticated calls (401).
- If `auth.admin.deleteUser` or any step fails, return a non-200 so the client keeps the user signed in and shows
  an error (don't half-delete silently). Order steps so the auth-user deletion is last.
- Client shows an inline error on failure; only tears down the session on success.

## Testing

- **Client:** the delete flow — confirm-gate requires `DELETE`, calls the function, and on success runs the
  sign-out teardown + redirect; on failure shows an error and stays signed in.
- **Edge Function logic** (the four cases): owned + no members → deleted; owned + a real member → transferred to
  earliest-joined; owned + only a pending email invite → deleted; member-of-another's-trip → membership row
  removed. (Pure transfer-selection logic extracted to a testable helper where practical.)

## Open questions (resolve at plan time, technical — not blocking the design)

1. **`trip_members` columns** — does it store `user_id`, or only `email`? Drives how the transfer target's
   `user_id` is obtained (direct column vs resolve email→`user_id` via `profiles`/`auth.users`) and how step 2
   matches the user's rows.
2. **`trip_members.created_at`** — present? If not, pick a deterministic fallback ordering for "earliest-joined."
3. Whether to implement the deletion as one Edge Function doing raw table ops, or to **reuse `delete_trip` per
   owned trip** for the delete branch (consistency vs fewer round-trips) — lean: do it in the function for one
   atomic pass, matching `delete_trip`'s cascade.

## Out of scope

Apple-token revocation (deferred), transfer-notification emails, data export, undo/grace-period, Android.
