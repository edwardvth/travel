import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Mark } from '../Logo'
import { CockpitCard } from '../CockpitCard'
import { SoftBackdrop, TS, TS_STRONG } from '../home-style'
import { useDestinationClip } from '../../hero/useDestinationClip'
import { HeroVideoStage } from '../../hero/HeroVideoStage'
import type { Units } from '../../data/useAccountSettings'
import type { Trip } from '../../types'

const MASK = 'linear-gradient(to bottom, #000 70%, transparent 96%)'

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
  /** Brand-left header's right side (account controls + New trip). */
  headerRight: ReactNode
  today?: string
  /** When false, the video pauses (background coordination). Default true. */
  playing?: boolean
}

/**
 * The trip landing (former State B / CockpitHome): the featured trip's `CockpitCard`
 * centered over its destination footage, with the brand header and "Welcome back"
 * greeting. HomePage owns the globe, "Your travels", and the create-hero roll-down;
 * this renders the hero section verbatim to the retired CockpitHome.
 */
export function UpcomingJourney({
  trip, firstName, units, onOpen, onOpenArrange, onOpenGuide, headerRight, today, playing = true,
}: UpcomingJourneyProps) {
  const reduce = useReducedMotion()
  const { clip } = useDestinationClip(trip)

  return (
    <section className="relative z-10 h-[100svh] min-h-[640px] overflow-hidden">
      {/* Destination footage — masked (fades into the globe below) + brightened. */}
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
      </motion.div>
    </section>
  )
}

export default UpcomingJourney
