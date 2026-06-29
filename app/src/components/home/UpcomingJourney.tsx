import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Mark } from '../Logo'
import { CockpitCard } from '../CockpitCard'
import { SoftBackdrop, TS, TS_STRONG } from '../home-style'
import { cockpitModel } from '../../lib/cockpit-model'
import { useDestinationClip } from '../../hero/useDestinationClip'
import { HeroVideoStage } from '../../hero/HeroVideoStage'
import type { Units } from '../../data/useAccountSettings'
import type { Trip } from '../../types'

// Landing form sits at the top of the page → fade only the bottom into the globe.
const MASK = 'linear-gradient(to bottom, #000 70%, transparent 96%)'
// Stacked form sits BELOW the create hero → fade top + bottom so it dissolves
// between the create hero above and the globe/travels below.
const SECTION_MASK = 'linear-gradient(to bottom, transparent 0%, #000 10%, #000 90%, transparent 100%)'

export interface UpcomingJourneyProps {
  trip: Trip
  firstName: string
  units: Units
  /** → Plan */
  onOpen: (id: string) => void
  /** → Trip view ("N to arrange" deep-link) */
  onOpenArrange: (id: string) => void
  /** → Guide */
  onOpenGuide: (id: string) => void
  /** Landing header's right side (account controls + New trip). Unused when stacked. */
  headerRight: ReactNode
  /** True when this sits UNDER the rolled-down create hero — renders the compact
   *  "Your journey" form (small eyebrow, no greeting, no header bar) instead of the
   *  full "Welcome back" landing, since the create hero already owns the top. */
  stacked?: boolean
  today?: string
  /** When false, the video pauses (background coordination). Default true. */
  playing?: boolean
}

/**
 * The trip surface. As the home LANDING it's the former State B / CockpitHome:
 * brand header, "Welcome back, {firstName}.", and the featured `CockpitCard` over
 * the destination footage. When `stacked` under the "+ New trip" create hero it
 * collapses to the compact "Your journey" section. HomePage owns the globe and
 * "Your travels"; this renders just the hero section.
 */
export function UpcomingJourney({
  trip, firstName, units, onOpen, onOpenArrange, onOpenGuide, headerRight, stacked = false, today, playing = true,
}: UpcomingJourneyProps) {
  const reduce = useReducedMotion()
  const m = cockpitModel(trip, today)
  const { clip } = useDestinationClip(trip)

  const card = (
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
  )

  // Compact form — under the create hero (Image #80): small eyebrow + card only.
  if (stacked) {
    return (
      <section className="relative z-10 h-[100svh] min-h-[640px] w-full overflow-hidden" aria-label={`Your next journey: ${trip.title}`}>
        <div
          className="absolute inset-0"
          style={{ WebkitMaskImage: SECTION_MASK, maskImage: SECTION_MASK, filter: 'brightness(1.8)' }}
        >
          <HeroVideoStage clip={clip} playing={playing} className="absolute inset-0" />
        </div>
        <div className="absolute inset-x-0 top-0 z-20 flex h-full flex-col items-center px-5 pt-[13vh] md:pt-[15vh] text-center text-white">
          <div className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.32em]" style={{ color: 'var(--gold)', textShadow: TS }}>
            {m.phase === 'during' ? 'Your journey · in progress' : 'Your next journey'}
          </div>
          {card}
        </div>
      </section>
    )
  }

  // Landing form — the former State B / CockpitHome (Image #79).
  return (
    <section className="relative z-10 h-[100svh] min-h-[640px] overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ WebkitMaskImage: MASK, maskImage: MASK, filter: 'brightness(1.8)' }}
      >
        <HeroVideoStage clip={clip} playing={playing} className="absolute inset-0" />
      </div>

      {/* Header bar — brand left, account controls + New trip right. */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-6 md:px-10 py-5 md:py-6 text-white">
        <span className="inline-flex items-center gap-2 font-sans font-extrabold tracking-tight">
          <span className="text-sig-link"><Mark size={30} /></span>
          <span className="font-serif text-[20px] md:text-[23px]" style={{ textShadow: TS }}>Voyager</span>
        </span>
        <div className="flex items-center gap-2.5 text-white [&_button]:text-white">{headerRight}</div>
      </div>

      <motion.div
        initial={reduce ? false : { y: 12 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-x-0 top-0 z-20 flex h-full flex-col items-center px-5 pt-[13vh] md:pt-[15vh] text-center text-white"
      >
        <div className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.32em] text-white/85" style={{ textShadow: TS }}>
          Plan · Walk · Remember
        </div>
        <h1 className="mt-4 font-serif font-medium tracking-tight text-[40px] leading-[1.02] md:text-[64px]" style={{ textShadow: TS_STRONG }}>
          Welcome back, {firstName}.
        </h1>
        {card}
      </motion.div>
    </section>
  )
}

export default UpcomingJourney
