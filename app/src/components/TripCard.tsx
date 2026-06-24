import { useState } from 'react'
import { formatDateRange } from '../lib/trip-helpers'
import { destinationOf } from '../trip/landmark-context'
import { useLandmarkImage } from '../data/useLandmarkImage'
import type { Trip } from '../types'

/**
 * Resolve a cover image for `trip`, cheapest source first:
 *   1. a stored `config.coverImage` (fetched at create time),
 *   2. else an on-demand landmark image for the destination (cached, lazy) —
 *      this backfills older trips that predate cover storage.
 * We deliberately do NOT fall back to an arbitrary stop's `.image`: the thumbnail
 * represents the destination and must stay stable as stops (and the Wikipedia
 * images `useLandmarkBackfill` writes onto them) come and go.
 * Returns the URL (or null) plus whether the on-demand lookup is still loading.
 */
function useTripCover(trip: Trip): { url: string | null; loading: boolean } {
  const stored = trip.config?.coverImage ?? null
  // Only hit Wikipedia when we have no stored cover.
  const landmark = useLandmarkImage(stored ? undefined : destinationOf(trip))
  return { url: stored ?? landmark.url, loading: !stored && landmark.loading }
}

export function TripCard({ trip, onOpen, actions }: { trip: Trip; onOpen: (id: string) => void; actions?: React.ReactNode }) {
  const { url, loading } = useTripCover(trip)
  // Track a load failure so a stale/404 stored URL falls back to the placeholder.
  const [failed, setFailed] = useState(false)
  const cover = !failed ? url : null
  const stops = trip.data?.days?.reduce((n, d) => n + (d.stops?.length || 0), 0) ?? 0
  return (
    <div className="group relative h-[260px] w-full overflow-hidden rounded-card border border-hair">
      <button onClick={() => onOpen(trip.id)} className="absolute inset-0 text-left" aria-label={`Open ${trip.title}`}>
        {/* Placeholder base — always present, so a missing/late image is never a gap. */}
        <span className={`absolute inset-0 bg-raised${loading ? ' animate-pulse' : ''}`} />
        {cover && (
          <img
            src={cover}
            alt={trip.title}
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
        <span className="absolute left-5 right-5 bottom-4 block">
          <span className="block font-serif font-medium text-[30px] leading-none tracking-tight text-white">{trip.title}</span>
          <span className="mt-2 block font-mono text-[11px] uppercase tracking-wider text-white/75">
            {formatDateRange(trip)} · {stops} stops{trip._shared ? ` · shared by ${trip._ownerEmail ?? 'owner'}` : ''}
          </span>
        </span>
      </button>
      {actions && <div className="absolute top-3 right-3 z-10 flex gap-1.5">{actions}</div>}
    </div>
  )
}
