import { ArrowRight } from 'lucide-react'
import { cockpitModel } from '../../lib/cockpit-model'
import { useDestinationClip } from '../../hero/useDestinationClip'
import { HeroVideoStage } from '../../hero/HeroVideoStage'
import { TS, TS_STRONG } from '../home-style'
import { dayDate, dayAnchorCoords } from '../../trip/helpers'
import { useWeather } from '../../trip/useWeather'
import { weatherFromCode } from '../../trip/icons'
import type { Units } from '../../data/useAccountSettings'
import type { Trip } from '../../types'

/** Scrims so text over the video stays legible. The top one only smooths the
 *  seam from the hero above (text lives at the BOTTOM), so it's light + short;
 *  the bottom one carries the title/status/button contrast. Kept restrained so
 *  the destination photo dominates rather than the dark gradients. */
const TOP_SCRIM = 'linear-gradient(to bottom, rgba(6,7,12,.50) 0%, rgba(6,7,12,.08) 22%, rgba(6,7,12,0) 38%)'
const BOTTOM_SCRIM = 'linear-gradient(to top, rgba(6,7,12,.86) 0%, rgba(6,7,12,.34) 24%, rgba(6,7,12,0) 46%)'

/** Mask that fades the video at the very bottom for a clean section seam — kept
 *  shallow so only a thin band goes to black. */
const SECTION_MASK = 'linear-gradient(to bottom, #000 90%, transparent 100%)'

export interface UpcomingJourneyProps {
  trip: Trip
  units: Units
  onOpen: (id: string) => void
  today?: string
  /** When false, the video pauses (background coordination). Default true. */
  playing?: boolean
}

/**
 * State-B "Your next journey" full-width section.
 *
 * Sits between the home hero and the travels list. Shows the focus
 * (upcoming/active) trip large, over its own destination video, with a glass
 * status line and an "Open →" primary action into the trip's Plan view.
 *
 * Purely presentational — all derivation comes from `cockpitModel`.
 */
export function UpcomingJourney({ trip, units, onOpen, today, playing = true }: UpcomingJourneyProps) {
  const m = cockpitModel(trip, today)
  const { clip } = useDestinationClip(trip)

  // City display name — first segment of "Tokyo, Japan" etc.
  const city = trip.config?.destination?.split(',')[0].trim() ?? trip.title

  // Eyebrow text
  const eyebrow = m.countdownLabel ? `Your next journey · ${m.countdownLabel}` : 'Your next journey'

  // Weather — same derivation as CockpitCard
  const geo = trip.config?.destinationGeo
  const coords =
    geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)
      ? { lat: geo.lat, lng: geo.lng }
      : dayAnchorCoords(trip, m.featuredDay)
  const date = dayDate(trip, m.featuredDay)
  const { tempMax, tempMin, code } = useWeather(coords, date, units)
  const hasWeather = tempMax !== null && tempMin !== null && code !== null
  const weather = hasWeather ? weatherFromCode(code) : null

  return (
    <section
      className="relative min-h-[80vh] w-full overflow-hidden"
      aria-label={`Your next journey: ${city}`}
    >
      {/* Video background — masked + brightened to match CockpitHome treatment. */}
      <div
        className="absolute inset-0"
        style={{
          WebkitMaskImage: SECTION_MASK,
          maskImage: SECTION_MASK,
          filter: 'brightness(1.8)',
        }}
      >
        <HeroVideoStage clip={clip} playing={playing} className="absolute inset-0" />
      </div>

      {/* Top scrim — darkens so the eyebrow/title reads cleanly. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{ background: TOP_SCRIM }}
      />

      {/* Bottom scrim — lifts the status line + button off the video. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{ background: BOTTOM_SCRIM }}
      />

      {/* Content — centered, pushed toward the bottom third. */}
      <div className="relative z-20 flex h-full min-h-[80vh] flex-col items-center justify-end px-5 pb-[10vh] text-center text-white md:pb-[12vh]">
        {/* Eyebrow */}
        <div
          className="font-mono text-[11px] uppercase tracking-[0.32em] md:text-[12px]"
          style={{ color: 'var(--gold)', textShadow: TS }}
        >
          {eyebrow}
        </div>

        {/* Destination name */}
        <h2
          className="mt-3 font-serif font-medium tracking-tight text-[48px] leading-[0.96] md:text-[80px] lg:text-[100px]"
          style={{ textShadow: TS_STRONG }}
        >
          {city}
        </h2>

        {/* Glass status line */}
        <div
          className="mt-6 inline-flex items-center gap-x-3 rounded-full border border-white/15 bg-white/[0.08] px-5 py-2.5 text-[13px] font-medium text-white/90 backdrop-blur-md md:text-[14px]"
          style={{ textShadow: TS }}
        >
          <span>{m.dayLabel}</span>
          {m.toArrangeCount > 0 && (
            <>
              <span aria-hidden="true" className="h-3 w-px bg-white/25" />
              <span>{m.toArrangeCount} to arrange</span>
            </>
          )}
          {weather && (
            <>
              <span aria-hidden="true" className="h-3 w-px bg-white/25" />
              <span className="inline-flex items-center gap-1.5">
                <weather.icon size={14} aria-hidden="true" className="text-white/80" />
                {Math.round(tempMax!)}° / {Math.round(tempMin!)}°{units === 'imperial' ? 'F' : 'C'}
              </span>
            </>
          )}
        </div>

        {/* Primary action */}
        <button
          onClick={() => onOpen(trip.id)}
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-7 py-3 text-[15px] font-bold text-[#05060a] transition-[background,box-shadow] duration-150 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:translate-y-px md:text-[16px]"
          aria-label={`Open ${city} trip`}
        >
          Open {city}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

export default UpcomingJourney
