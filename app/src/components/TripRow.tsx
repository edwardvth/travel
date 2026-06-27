import { formatDateRange } from '../lib/trip-helpers'
import { cockpitModel } from '../lib/cockpit-model'
import { useTripCover } from './useTripCover'
import { deriveTravel } from './TravelTile'
import { TS } from './home-style'
import type { Trip } from '../types'

/**
 * An Explorer-style detailed row for the "Your travels" list (Detailed view):
 * thumbnail · name + dates · stops · when. The whole row is a single click/tap
 * target that opens the trip's Plan view. `today` is a test/SSR seam.
 */
export function TripRow({
  trip, onOpen, today, actions,
}: {
  trip: Trip
  onOpen: (id: string) => void
  today?: string
  actions?: React.ReactNode
}) {
  const { kind, when } = deriveTravel(trip, today)
  const { url, loading } = useTripCover(trip)
  const m = cockpitModel(trip, today)
  const upcoming = kind === 'upcoming' || kind === 'planning'

  return (
    <div className="group relative flex w-full items-center gap-3.5 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2.5 backdrop-blur-xl transition-colors hover:bg-white/[0.09]">
      {/* Whole-row open target, beneath the columns + actions. */}
      <button
        type="button"
        onClick={() => onOpen(trip.id)}
        aria-label={`Open ${trip.title}`}
        className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      />

      <div className="pointer-events-none relative z-10 flex w-full items-center gap-3.5">
        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-white/[0.04] ring-1 ring-white/10">
          {url && <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />}
          {loading && <span className="absolute inset-0 animate-pulse bg-white/[0.04]" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-[17px] text-white" style={{ textShadow: TS }}>{trip.title}</div>
          <div className="truncate font-mono text-[11px] uppercase tracking-wide text-white/60">{formatDateRange(trip)}</div>
        </div>
        <div className="hidden w-20 shrink-0 text-center font-mono text-[12px] text-white/65 sm:block">
          {m.stopCount > 0 ? `${m.stopCount} stops` : '—'}
        </div>
        <div className={`w-24 shrink-0 text-right font-mono text-[12px] ${upcoming ? 'text-sig-link' : 'text-white/55'}`}>{when}</div>
      </div>

      {actions && (
        <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 gap-1.5 opacity-100 transition-opacity duration-200 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
          {actions}
        </div>
      )}
    </div>
  )
}
