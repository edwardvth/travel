/**
 * Tunable scoring + batch constants for the placeId backfill. Single source of
 * truth — no magic numbers live in the flow or scoreMatch. These are COPIED
 * VERBATIM into supabase/functions/place-id-admin/index.ts (keep in sync).
 */
/** How many candidates are frozen per review row. */
export const MAX_REVIEW_CANDIDATES = 3
/** Distance (m) at/under which a candidate scores a strong positive. */
export const EXACT_DISTANCE_M = 100
/** Distance (m) at/under which a candidate scores a positive; beyond → negative. */
export const NEAR_DISTANCE_M = 250
/** Score subtracted when a runner-up candidate is also close/similar (ambiguity). */
export const AMBIGUITY_PENALTY = 0.4
/** confident = score >= this. */
export const AUTO_ATTACH_THRESHOLD = 0.7
/** Max in-flight Google Text Search calls during a scan (never unbounded). */
export const GOOGLE_MAX_CONCURRENCY = 8
/** Trips read per scan page (keeps each invocation within the function budget). */
export const SCAN_PAGE_SIZE = 25
