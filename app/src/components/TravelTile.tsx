import { formatDateRange, tripEnd } from '../lib/trip-helpers'
import { cockpitModel } from '../lib/cockpit-model'
import { isUndatedTrip } from '../lib/home-groups'
import { todayISO } from '../lib/focus-trip'
import { useTripCover } from './useTripCover'
import { TS } from './home-style'
import type { Trip } from '../types'

export type TravelKind = 'upcoming' | 'planning' | 'past'

/**
 * Classify a trip relative to `today` and derive its short status label — the
 * one source of truth shared by `TravelTile` and `TripRow`:
 *   - `planning` → undated upcoming trip (label "Planning")
 *   - `past`     → its end date is before today (label "Completed")
 *   - `upcoming` → dated, not past (label = the cockpit countdown, e.g. "In 7 days")
 */
export function deriveTravel(trip: Trip, today: string = todayISO()): { kind: TravelKind; when: string } {
  if (isUndatedTrip(trip)) return { kind: 'planning', when: 'Planning' }
  if (tripEnd(trip) < today) return { kind: 'past', when: 'Completed' }
  return { kind: 'upcoming', when: cockpitModel(trip, today).countdownLabel ?? 'Upcoming' }
}

/**
 * A glass photo tile for the "Your travels" list (Tiles view). The whole card is
 * a single click/tap target that opens the trip's Plan view. Upcoming/planning
 * trips carry a countdown chip top-left. `today` is a test/SSR seam.
 */
export function TravelTile({
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
  const meta = formatDateRange(trip) + (m.stopCount > 0 ? ` · ${m.stopCount} stops` : '')

  return (
    <div className="group relative w-full overflow-hidden rounded-card border border-white/15 bg-white/[0.06] shadow-[0_12px_40px_rgba(0,0,0,.42)] backdrop-blur-xl transition-[transform,box-shadow] duration-300 ease-out [@media(hover:hover)]:hover:-translate-y-1.5 [@media(hover:hover)]:hover:shadow-[0_26px_60px_rgba(0,0,0,.55)] active:translate-y-0 active:scale-[0.985] motion-reduce:transition-none motion-reduce:hover:transform-none motion-reduce:active:transform-none">
      {/* Whole-tile open target, beneath the content + actions. */}
      <button
        type="button"
        onClick={() => onOpen(trip.id)}
        aria-label={`Open ${trip.title}`}
        className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      />

      <div className="pointer-events-none relative z-10">
        <div className="relative h-[140px] overflow-hidden">
          {url && (
            <img
              src={url}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-[1.04]"
            />
          )}
          {loading && <span className="absolute inset-0 animate-pulse bg-white/[0.04]" />}
          {(kind === 'upcoming' || kind === 'planning') && (
            <span
              className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm"
              style={{ textShadow: TS }}
            >
              {when}
            </span>
          )}
        </div>
        <div className="px-4 py-3">
          <div className="font-serif text-[21px] text-white" style={{ textShadow: TS }}>{trip.title}</div>
          <div className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-white/65">{meta}</div>
        </div>
      </div>

      {actions && (
        <div className="absolute right-3 top-3 z-20 flex gap-1.5 opacity-100 transition-opacity duration-200 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
          {actions}
        </div>
      )}
    </div>
  )
}
