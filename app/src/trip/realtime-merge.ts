import type { Trip } from '../types'

/**
 * Resolve a realtime `postgres_changes` row against the local cache with real
 * last-write-wins, so the client never clobbers its own newer optimistic edits.
 *
 * Supabase Realtime echoes a client's *own* writes back (and may deliver them
 * after newer local edits during a fast burst). Each trip save stamps
 * `data.savedAt` (an ISO timestamp); we apply `incoming` to the cache **only when
 * it is strictly newer** than what we already hold:
 *
 * - `local` undefined → accept `incoming` (nothing cached yet).
 * - `incoming` has no `data.savedAt` → keep `local` (can't prove it's newer; this
 *   covers self-echoes and any partial row — ignore rather than risk a revert).
 * - `incoming.savedAt > local.savedAt` (ISO strings compare lexicographically) →
 *   apply `incoming` (a genuinely newer edit, e.g. from another device).
 * - equal or older `savedAt` → keep `local` (drops own/older echoes).
 *
 * Pure — never mutates its inputs.
 */
export function mergeRealtimeTrip(local: Trip | undefined | null, incoming: Trip): Trip {
  if (!local) return incoming

  const incomingAt = incoming.data?.savedAt
  // No stamp on the incoming row → we cannot prove it is newer; keep what we have.
  if (!incomingAt) return local

  const localAt = local.data?.savedAt
  // Local has no stamp but the remote does → the remote is the only dated truth.
  if (!localAt) return incoming

  // ISO 8601 timestamps sort correctly as plain strings; apply only if strictly newer.
  return incomingAt > localAt ? incoming : local
}
