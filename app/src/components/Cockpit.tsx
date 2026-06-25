import { formatDateRange } from '../lib/trip-helpers'
import { cockpitModel } from '../lib/cockpit-model'
import { tripGradient } from '../lib/trip-tile'
import { useTripCover } from './useTripCover'
import { dayDate, dayAnchorCoords } from '../trip/helpers'
import { useWeather } from '../trip/useWeather'
import { weatherFromCode } from '../trip/icons'
import type { Units } from '../data/useAccountSettings'
import type { Trip } from '../types'

/**
 * State B home surface: the focus trip as a single annotated card. The whole
 * card opens the trip (→ Plan); the readiness line carries the day, a "N to
 * arrange" deep-link (→ Trip view), and the weather. A live trip shows a "Start
 * guide" button (→ Guide); an upcoming trip with an unfinished itinerary shows
 * "Start planning" (→ Plan); a fully-planned upcoming trip shows neither.
 * `today` is a test/SSR seam.
 */
export function Cockpit({
  trip, onOpen, onOpenArrange, onOpenGuide, today, units = 'metric',
}: {
  trip: Trip
  onOpen: (id: string) => void
  onOpenArrange: (id: string) => void
  onOpenGuide: (id: string) => void
  today?: string
  /** Account unit preference; drives the weather readout. Defaults to metric. */
  units?: Units
}) {
  const m = cockpitModel(trip, today)
  const { url, loading } = useTripCover(trip)
  const seed = trip.config?.destination || trip.config?.title || trip.title || trip.id

  // Weather for the destination city (its resolved geo is always available, so
  // the glance shows even before any stop has coordinates); falls back to the
  // featured day's first located stop for legacy trips with no resolved geo.
  const geo = trip.config?.destinationGeo
  const coords =
    geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)
      ? { lat: geo.lat, lng: geo.lng }
      : dayAnchorCoords(trip, m.featuredDay)
  const date = dayDate(trip, m.featuredDay)
  const { tempMax, tempMin, code } = useWeather(coords, date, units)
  const hasWeather = tempMax !== null && tempMin !== null && code !== null
  const weather = hasWeather ? weatherFromCode(code) : null

  const meta =
    formatDateRange(trip) + (m.stopCount ? ` · ${m.stopCount} stop${m.stopCount === 1 ? '' : 's'}` : '')

  const btn =
    'relative z-10 mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-btn bg-white/10 px-3.5 py-2 text-[13px] font-bold text-white backdrop-blur transition-colors hover:bg-white/20'
  const sep = <span aria-hidden="true" className="pointer-events-none text-white/40">·</span>

  return (
    <div
      className="group relative h-[300px] w-full overflow-hidden rounded-card border border-hair md:h-[360px]"
      style={{ background: tripGradient(seed) }}
    >
      {url && (
        <img src={url} alt="" loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
      )}
      {loading && <span className="absolute inset-0 animate-pulse bg-white/[0.04]" />}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      {/* Top scrim — keeps the countdown legible over a bright sky/cover. */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />

      {/* Whole-surface open target (→ Plan), beneath the content + actions. */}
      <button onClick={() => onOpen(trip.id)} className="absolute inset-0 z-0" aria-label={`Open ${trip.title}`} />

      {/* Countdown eyebrow */}
      <div className="pointer-events-none absolute left-5 top-5 z-10 [text-shadow:0_2px_10px_rgba(0,0,0,0.95)]">
        <span className="font-mono text-[14px] uppercase tracking-[0.2em] text-white md:text-[18px]">
          {m.countdownLabel ?? 'Next trip'}
        </span>
      </div>

      {/* Identity + readiness + action, anchored bottom. */}
      <div className="absolute inset-x-5 bottom-5 z-10 [text-shadow:0_2px_8px_rgba(0,0,0,0.85)]">
        <h2 className="pointer-events-none font-serif text-[clamp(34px,5vw,52px)] font-medium leading-[0.95] tracking-tight text-white">
          {trip.title}
        </h2>
        <p className="pointer-events-none mt-2 font-mono text-[11px] uppercase tracking-wider text-white">{meta}</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-white">
          <span className="pointer-events-none font-medium">{m.dayLabel}</span>
          {m.toArrangeCount > 0 && (
            <>
              {sep}
              <button
                onClick={e => { e.stopPropagation(); onOpenArrange(trip.id) }}
                className="relative z-10 -my-1.5 py-1.5 font-medium text-white underline-offset-2 hover:underline"
              >
                {m.toArrangeCount} to arrange
              </button>
            </>
          )}
          {weather && (
            <>
              {sep}
              <span className="pointer-events-none inline-flex items-center gap-1">
                <weather.icon size={14} aria-hidden="true" className="opacity-85" />
                {Math.round(tempMax!)}° / {Math.round(tempMin!)}°{units === 'imperial' ? 'F' : 'C'}
              </span>
            </>
          )}
        </div>

        {m.phase === 'during' ? (
          <button onClick={e => { e.stopPropagation(); onOpenGuide(trip.id) }} className={btn}>
            Start guide <span aria-hidden="true">→</span>
          </button>
        ) : !m.itineraryComplete ? (
          <button onClick={e => { e.stopPropagation(); onOpen(trip.id) }} className={btn}>
            Start planning <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
