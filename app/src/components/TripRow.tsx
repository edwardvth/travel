import { formatDateRange } from '../lib/trip-helpers'
import type { Trip } from '../types'

export function TripRow({ trip, onOpen, actions }: { trip: Trip; onOpen: (id: string) => void; actions?: React.ReactNode }) {
  const cover = trip.data?.days?.flatMap(d => d.stops)?.find(s => s.image)?.image
  return (
    <div className="flex w-full items-center gap-3.5 p-4 border border-hair rounded-card hover:bg-fill transition-colors">
      <button onClick={() => onOpen(trip.id)} className="flex flex-1 items-center gap-3.5 text-left min-w-0" aria-label={`Open ${trip.title}`}>
        <span className="h-[54px] w-[54px] flex-none rounded-[12px] bg-raised bg-cover bg-center"
          style={cover ? { backgroundImage: `url(${cover})` } : undefined} />
        <span className="min-w-0">
          <span className="block font-sans font-semibold text-[15.5px] truncate">{trip.title}</span>
          <span className="block font-mono text-[11px] uppercase tracking-wide text-muted">{formatDateRange(trip)}</span>
        </span>
      </button>
      {actions
        ? <div className="flex gap-1.5">{actions}</div>
        : <svg className="text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" strokeLinecap="round" /></svg>}
    </div>
  )
}
