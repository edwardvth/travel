import type { CacheRow } from './types'

/** Concurrency/lease constants (seconds). MIRROR into enrich-place. */
export const GEN = {
  LEASE_SECONDS: 60,
  FAILURE_COOLDOWN_SECONDS: 300,
  MAX_ATTEMPTS: 5,
} as const

export type Decision =
  | { kind: 'serve' }
  | { kind: 'pending' }
  | { kind: 'failed' }
  | { kind: 'unsupported' }
  | { kind: 'claim' }    // no row / retry-eligible → attempt atomic claim
  | { kind: 'reclaim' }  // stuck generating lease → conditional reclaim

/**
 * Decide what to do for a place given its current row and the clock — the pure
 * core of the lock/lease/cooldown/terminal state machine. The function turns
 * 'claim'/'reclaim' into atomic PostgREST writes. Pure + fully unit-tested.
 * MIRROR: copied verbatim into supabase/functions/enrich-place.
 */
export function decideAction(row: CacheRow | null, nowMs: number): Decision {
  if (!row) return { kind: 'claim' }
  const started = Date.parse(row.generation_started_at)
  const ageS = (nowMs - started) / 1000
  switch (row.generation_status) {
    case 'ready': return { kind: 'serve' }
    case 'unsupported': return { kind: 'unsupported' }
    case 'generating':
      return ageS > GEN.LEASE_SECONDS ? { kind: 'reclaim' } : { kind: 'pending' }
    case 'failed':
      if (ageS <= GEN.FAILURE_COOLDOWN_SECONDS) return { kind: 'failed' }
      return row.generation_attempts >= GEN.MAX_ATTEMPTS ? { kind: 'failed' } : { kind: 'claim' }
  }
}
