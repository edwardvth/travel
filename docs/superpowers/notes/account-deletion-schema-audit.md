# Account Deletion — Live Schema Audit (Task 1)

> Run 2026-06-29 against Supabase project `wnpanbjzmcsvhfyjdczv`. Resolves the
> AUDIT-ADJUST points in `docs/supabase/2026-06-29-delete-account.sql`.

## trip_members
- `id` bigint
- `trip_id` text
- **`user_id` uuid (nullable)** — present, but nullable (email-only invites exist)
- `email` text **NOT NULL** — the reliable share key
- **`added_at` timestamptz** — the join-time column (NOT `created_at`)

→ Transfer target resolved by joining `email → auth.users`; ordered by `added_at`.

## trips
- `id` text, `owner_id` uuid (nullable), `config` jsonb, `data` jsonb,
  `share_token` text, `title`, `subtitle`, `edit_password_hash`, `created_at`, `updated_at`
- **No per-user PII columns**; `config`/`data` hold neutral itinerary content →
  **transfer JSON scrub is a verified no-op.**

## Invites
- **No invite table exists** (the `%invite%` query returned nothing). Sharing is
  `trips.share_token` (a share link) + `trip_members` rows. `share_token` is the
  trip's link, not the inviter's identity → **no inviter-PII scrub needed.**

## profiles
- `id` uuid, `email`, `name`, `role`, `credits`, `created_at`, `last_active`,
  `settings` jsonb → the user's own row, deleted whole.

## Net changes applied to the RPC
1. order members by **`added_at`** (was `created_at`).
2. **removed** the `trip_invites` scrub (no such table).
3. no JSON scrub (config/data are neutral).
4. step-2 membership removal matches **`user_id = p_uid OR email = p_email`**.
