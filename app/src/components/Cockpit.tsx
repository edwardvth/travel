import { cn } from '../lib/utils'
import { formatDateRange } from '../lib/trip-helpers'
import { cockpitModel } from '../lib/cockpit-model'
import { tripGradient } from '../lib/trip-tile'
import { useTripCover } from './useTripCover'
import { dayDate, dayAnchorCoords } from '../trip/helpers'
import { useWeather } from '../trip/useWeather'
import { weatherFromCode } from '../trip/icons'
import type { Trip } from '../types'

/**
 * State B home surface (spec §5): the next trip as a single annotated card.
 * The whole card opens the trip (→ Plan); the lone secondary action is the
 * "N to arrange" deep-link (→ Trip view). Unplanned trips show a "Start
 * planning" nudge instead of the readiness line. `today` is a test/SSR seam.
 */
export function Cockpit({
  trip, onOpen, onOpenArrange, actions, today,
}: {
  trip: Trip
  onOpen: (id: string) => void
  onOpenArrange: (id: string) => void
  actions?: React.ReactNode
  today?: string
}) {
  const m = cockpitModel(trip, today)
  const { url, loading } = useTripCover(trip)
  const seed = trip.config?.destination || trip.config?.title || trip.title || trip.id

  // Weather for the featured day (inline, optional). Hooks run unconditionally.
  const weatherDay = m.featuredDay ?? 0
  const coords = dayAnchorCoords(trip, weatherDay)
  const date = dayDate(trip, weatherDay)
  const { tempMax, code } = useWeather(coords, date)
  const hasWeather = tempMax !== null && code !== null
  const weather = hasWeather ? weatherFromCode(code) : null

  const meta =
    `${formatDateRange(trip)}` + (m.stopCount ? ` · ${m.stopCount} stop${m.stopCount === 1 ? '' : 's'}` : '')

  const dayLabel = m.phase === 'during' ? 'Today' : m.featuredDay !== null ? `Day ${m.featuredDay + 1}` : null

  return (
    <div
      className={cn(
        'group relative h-[300px] w-full overflow-hidden rounded-card border border-hair md:h-[360px]',
      )}
      style={{ background: tripGradient(seed) }}
    >
      {url && (
        <img src={url} alt="" loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
      )}
      {loading && <span className="absolute inset-0 animate-pulse bg-white/[0.04]" />}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      {/* Whole-surface open target (→ Plan), beneath the content + actions. */}
      <button onClick={() => onOpen(trip.id)} className="absolute inset-0 z-0" aria-label={`Open ${trip.title}`} />

      {/* Countdown eyebrow */}
      <div className="pointer-events-none absolute left-5 top-5 z-10 flex items-center gap-2">
        <span className="h-px w-6 bg-gold/70" />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold/85">
          {m.countdownLabel ?? 'Next trip'}
        </span>
      </div>

      {actions && <div className="absolute right-3 top-3 z-20 flex gap-1.5">{actions}</div>}

      {/* Identity + readiness, anchored bottom */}
      <div className="absolute inset-x-5 bottom-5 z-10">
        <h2 className="pointer-events-none font-serif text-[clamp(34px,5vw,52px)] font-medium leading-[0.95] tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)]">
          {trip.title}
        </h2>
        <p className="pointer-events-none mt-2 font-mono text-[11px] uppercase tracking-wider text-white/75">{meta}</p>

        {m.phase === 'unplanned' ? (
          <button
            onClick={() => onOpen(trip.id)}
            className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-btn bg-white/10 px-3.5 py-2 text-[13px] font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            Start planning <span aria-hidden="true">→</span>
          </button>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-white/85">
            {dayLabel && <span className="pointer-events-none font-medium">{dayLabel}</span>}
            {m.toArrangeCount > 0 && (
              <>
                <span aria-hidden="true" className="pointer-events-none text-white/40">·</span>
                <button
                  onClick={e => { e.stopPropagation(); onOpenArrange(trip.id) }}
                  className="relative z-10 font-medium text-white underline-offset-2 hover:underline"
                >
                  {m.toArrangeCount} to arrange
                </button>
              </>
            )}
            {weather && (
              <>
                <span aria-hidden="true" className="pointer-events-none text-white/40">·</span>
                <span className="pointer-events-none inline-flex items-center gap-1">
                  <weather.icon size={14} aria-hidden="true" className="opacity-85" />
                  {Math.round(tempMax!)}°
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
