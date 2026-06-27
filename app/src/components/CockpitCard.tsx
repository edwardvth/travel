import { ArrowRight } from 'lucide-react'
import { formatDateRange } from '../lib/trip-helpers'
import { cockpitModel } from '../lib/cockpit-model'
import { tripGradient } from '../lib/trip-tile'
import { useTripCover } from './useTripCover'
import { dayDate, dayAnchorCoords } from '../trip/helpers'
import { useWeather } from '../trip/useWeather'
import { weatherFromCode } from '../trip/icons'
import { Button } from './ui/Button'
import { TS_STRONG, HEADER_SCRIM } from './home-style'
import type { Units } from '../data/useAccountSettings'
import type { Trip } from '../types'

/**
 * State B home surface — the cinematic featured-trip card shown over the hero
 * footage. Wiring (cockpitModel, cover, weather coords/date) mirrors `Cockpit`;
 * the markup is the approved preview's. The card is NOT itself a clickable
 * element — navigation happens only via the action-bar buttons and the
 * "N to arrange" deep-link. `today` is a test/SSR seam.
 */
export function CockpitCard({
  trip, onOpen, onOpenArrange, onOpenGuide, units, today,
}: {
  trip: Trip
  /** → Plan */
  onOpen: (id: string) => void
  /** → Trip view */
  onOpenArrange: (id: string) => void
  /** → Guide */
  onOpenGuide: (id: string) => void
  units: Units
  today?: string
}) {
  const m = cockpitModel(trip, today)
  const { url } = useTripCover(trip)
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

  const context =
    formatDateRange(trip) + (m.stopCount > 0 ? ` · ${m.stopCount} stop${m.stopCount === 1 ? '' : 's'}` : ' · No stops yet')

  const secondaryBtn =
    'rounded-full border border-white/20 bg-white/[0.07] px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-white/15 md:px-6 md:py-3'

  return (
    <div className="group h-[264px] w-full overflow-hidden rounded-[22px] shadow-[0_22px_64px_rgba(0,0,0,.5)] transition-[transform,box-shadow] duration-300 ease-out md:h-[330px] [@media(hover:hover)]:hover:-translate-y-1.5 [@media(hover:hover)]:hover:shadow-[0_34px_82px_rgba(0,0,0,.62)] motion-reduce:transition-none motion-reduce:hover:transform-none">
      {/* Header — cover + scrim + identity. */}
      <div className="relative h-[192px] md:h-[242px]" style={{ background: tripGradient(seed) }}>
        {url && (
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-500 ease-out [@media(hover:hover)]:group-hover:scale-[1.04]"
            style={{ backgroundImage: `url('${url}')` }}
          />
        )}
        <div className="absolute inset-0" style={{ background: HEADER_SCRIM }} />
        <div className="relative flex h-full flex-col p-5 md:p-6">
          <div className="font-mono text-[14px] font-semibold uppercase tracking-[0.26em] text-white md:text-[16px]" style={{ textShadow: TS_STRONG }}>
            {m.countdownLabel ?? 'Planning trip'}
          </div>
          <div className="mt-auto">
            <div className="font-serif text-[36px] leading-[0.96] tracking-tight text-white md:text-[48px]" style={{ textShadow: TS_STRONG }}>
              {trip.title}
            </div>
            <div className="mt-2 font-mono text-[11.5px] uppercase tracking-[0.18em] text-white/85 md:text-[13px]" style={{ textShadow: TS_STRONG }}>
              {context}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/90 md:text-[14.5px]" style={{ textShadow: TS_STRONG }}>
              <span className="font-medium">{m.dayLabel}</span>
              {m.toArrangeCount > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); onOpenArrange(trip.id) }}
                  className="font-medium text-white underline-offset-2 hover:underline"
                >
                  {m.toArrangeCount} to arrange
                </button>
              )}
              {weather && (
                <span className="inline-flex items-center gap-1.5">
                  <weather.icon size={14} aria-hidden="true" className="text-white/80" />
                  {Math.round(tempMax!)}° / {Math.round(tempMin!)}°{units === 'imperial' ? 'F' : 'C'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action bar — solid, buttons never hidden. */}
      <div className="flex h-[72px] items-center gap-3 bg-[#0f0f15] px-5 md:h-[88px] md:px-6">
        {m.phase === 'during' ? (
          <>
            <Button variant="claret" onClick={() => onOpenGuide(trip.id)} className="flex-1 justify-center py-2.5 text-[15px] md:py-3 md:text-[16px]">
              Start guide <ArrowRight size={16} />
            </Button>
            <button onClick={() => onOpen(trip.id)} className={secondaryBtn}>Plan</button>
          </>
        ) : (
          <>
            <Button variant="claret" onClick={() => onOpen(trip.id)} className="flex-1 justify-center py-2.5 text-[15px] md:py-3 md:text-[16px]">
              {m.itineraryComplete ? 'Open plan' : 'Start planning'} <ArrowRight size={16} />
            </Button>
            <button onClick={() => onOpenGuide(trip.id)} className={secondaryBtn}>Guide</button>
          </>
        )}
      </div>
    </div>
  )
}
