import { classifyCover, destinationOf } from '../trip/landmark-context'
import { coverUrlOverrideFor } from '../trip/cover-image'
import { useLandmarkImage } from '../data/useLandmarkImage'
import type { Trip } from '../types'

/**
 * Resolve a cover image for `trip`, in order:
 *   1. a pinned per-city URL override (`coverUrlOverrideFor`) — wins over an
 *      auto/stored cover so a known-wrong city cover can't be re-resolved away;
 *      but never over the user's own upload (a `data:` cover),
 *   2. a stored `config.coverImage` (fetched at create time),
 *   3. else an on-demand landmark image for the destination (cached, lazy).
 * Never falls back to an arbitrary stop `.image` — the cover represents the
 * destination and must stay stable as stops come and go.
 */
export function useTripCover(trip: Trip): { url: string | null; loading: boolean } {
  // Only a real string is a usable cover — guard against legacy/corrupt JSONB
  // (a non-string coverImage) so it falls back to the landmark image rather than
  // rendering a broken <img src>.
  const stored = typeof trip.config?.coverImage === 'string' ? trip.config.coverImage : null
  // Respect a user's own upload; otherwise a pinned override wins over an auto cover.
  const effective = classifyCover(stored) === 'user' ? stored : (coverUrlOverrideFor(destinationOf(trip)) ?? stored)
  const landmark = useLandmarkImage(effective ? undefined : destinationOf(trip))
  return { url: effective ?? landmark.url, loading: !effective && landmark.loading }
}
