import { useDestinationClip } from '../../hero/useDestinationClip'
import { HeroVideoStage } from '../../hero/HeroVideoStage'
import { CockpitCard } from '../CockpitCard'
import { SoftBackdrop, TS } from '../home-style'
import { cockpitModel } from '../../lib/cockpit-model'
import type { Units } from '../../data/useAccountSettings'
import type { Trip } from '../../types'

/** Fades the footage into the page at the top (from the hero) and the bottom
 *  (into the travels globe) so the section blends as one continuous background. */
const SECTION_MASK = 'linear-gradient(to bottom, transparent 0%, #000 10%, #000 90%, transparent 100%)'

export interface UpcomingJourneyProps {
  trip: Trip
  units: Units
  /** → Plan */
  onOpen: (id: string) => void
  /** → Trip view ("N to arrange" deep-link) */
  onOpenArrange: (id: string) => void
  /** → Guide */
  onOpenGuide: (id: string) => void
  today?: string
  /** When false, the video pauses (background coordination). Default true. */
  playing?: boolean
}

/**
 * State-B "Your next journey" section — the featured trip's `CockpitCard`
 * centered over its destination video, mirroring the (retired) CockpitHome hero
 * treatment. Sits between the home's "Where to next?" hero and the travels list.
 * Purely presentational; all derivation lives in `cockpitModel` / `CockpitCard`.
 */
export function UpcomingJourney({
  trip, units, onOpen, onOpenArrange, onOpenGuide, today, playing = true,
}: UpcomingJourneyProps) {
  const m = cockpitModel(trip, today)
  const { clip } = useDestinationClip(trip)

  return (
    <section
      className="relative h-[100svh] min-h-[640px] w-full overflow-hidden"
      aria-label={`Your next journey: ${trip.title}`}
    >
      {/* Destination video — masked top+bottom + brightened, matching the hero treatment. */}
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

      {/* Centered content — eyebrow + the featured-trip cockpit card. */}
      <div className="absolute inset-x-0 top-0 z-20 flex h-full flex-col items-center px-5 pt-[13vh] md:pt-[15vh] text-center text-white">
        <div
          className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.32em]"
          style={{ color: 'var(--gold)', textShadow: TS }}
        >
          {m.phase === 'during' ? 'Your journey · in progress' : 'Your next journey'}
        </div>
        <div className="relative mt-8 w-full max-w-[440px] md:max-w-[620px]">
          <SoftBackdrop />
          <CockpitCard
            trip={trip}
            onOpen={onOpen}
            onOpenArrange={onOpenArrange}
            onOpenGuide={onOpenGuide}
            units={units}
            today={today}
          />
        </div>
      </div>
    </section>
  )
}

export default UpcomingJourney
