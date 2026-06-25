import { destinationOf } from '../trip/landmark-context'
import { useLandmarkImage } from '../data/useLandmarkImage'
import type { Trip } from '../types'

/**
 * Resolve a cover image for `trip`, cheapest source first:
 *   1. a stored `config.coverImage` (fetched at create time),
 *   2. else an on-demand landmark image for the destination (cached, lazy).
 * Never falls back to an arbitrary stop `.image` — the cover represents the
 * destination and must stay stable as stops come and go.
 */
export function useTripCover(trip: Trip): { url: string | null; loading: boolean } {
  // Only a real string is a usable cover — guard against legacy/corrupt JSONB
  // (a non-string coverImage) so it falls back to the landmark image rather than
  // rendering a broken <img src>.
  const stored = typeof trip.config?.coverImage === 'string' ? trip.config.coverImage : null
  const landmark = useLandmarkImage(stored ? undefined : destinationOf(trip))
  return { url: stored ?? landmark.url, loading: !stored && landmark.loading }
}
