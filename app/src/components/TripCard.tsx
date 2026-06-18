import { formatDateRange } from '../lib/trip-helpers'
import type { Trip } from '../types'

export function TripCard({ trip, onOpen, actions }: { trip: Trip; onOpen: (id: string) => void; actions?: React.ReactNode }) {
  const cover = trip.data?.days?.flatMap(d => d.stops)?.find(s => s.image)?.image
  const stops = trip.data?.days?.reduce((n, d) => n + (d.stops?.length || 0), 0) ?? 0
  return (
    <div className="group relative h-[260px] w-full overflow-hidden rounded-card border border-hair">
      <button onClick={() => onOpen(trip.id)} className="absolute inset-0 text-left" aria-label={`Open ${trip.title}`}>
        {cover
          ? <img src={cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          : <span className="absolute inset-0 bg-raised" />}
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
