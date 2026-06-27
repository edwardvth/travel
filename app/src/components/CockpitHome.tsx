import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Mark } from './Logo'
import { CockpitCard } from './CockpitCard'
import { TravelsList } from './TravelsList'
import { SoftBackdrop, TS, TS_STRONG } from './home-style'
import { useDestinationClip } from '../hero/useDestinationClip'
import { HeroVideoStage } from '../hero/HeroVideoStage'
import { FieldGlobe } from '../home/FieldGlobe'
import { useInViewActive } from '../home/useInViewActive'
import globeStill from '../assets/globe-still.webp'
import type { Units } from '../data/useAccountSettings'
import type { Trip } from '../types'

const MASK = 'linear-gradient(to bottom, #000 70%, transparent 96%)'

/**
 * State-B cockpit home — the full-bleed page that assembles the night-Earth globe
 * background, the masked destination footage hero, the centered featured
 * `CockpitCard`, and the "Your travels" `TravelsList` below. Geometry mirrors the
 * approved preview (`_PreviewHomeSearch`) and State-C launchpad
 * (`CinematicLaunchpad`) verbatim: a `185vh` globe box, a `100svh` masked hero,
 * then "Your travels" pulled up `-18vh` over the globe. `useInViewActive` enforces
 * the one-animated-background guarantee (video plays on the hero, globe takes over
 * once the travels sentinel scrolls in). Rendered by the Dashboard, which supplies
 * `headerRight` (already styled white-on-dark) and the pre-selected `focus` trip.
 */
export function CockpitHome({
  trips, focus, firstName, units, userId, today,
  onOpen, onOpenArrange, onOpenGuide, headerRight,
}: {
  trips: Trip[]
  focus: Trip
  firstName: string
  units: Units
  userId?: string
  today?: string
  onOpen: (id: string) => void
  onOpenArrange: (id: string) => void
  onOpenGuide: (id: string) => void
  headerRight: ReactNode
}) {
  const reduce = useReducedMotion()
  const { globeRef, globeActive, heroActive } = useInViewActive()
  const { clip, credit } = useDestinationClip(focus)

  return (
    <div className="relative min-h-[100svh] bg-[#05060a] text-white">
      {/* Globe — original transition geometry (tall background, dark sky behind the clip). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[185vh] overflow-hidden bg-[#05060a]">
        <div className="absolute inset-x-0 top-[20vh] h-[170vh]">
          <FieldGlobe
            className="absolute inset-0"
            active={globeActive}
            staticSrc={globeStill}
            dprCap={1.0}
            frag={{ octaves: 3, blur: false }}
          />
        </div>
      </div>

      {/* Hero — featured trip centered over the masked footage (100svh + mask). */}
      <section className="relative z-10 h-[100svh] min-h-[640px] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ WebkitMaskImage: MASK, maskImage: MASK, filter: 'brightness(1.8)' }}
        >
          <HeroVideoStage clip={clip} playing={heroActive} className="absolute inset-0" />
        </div>

        {/* Header bar — brand left, Dashboard-supplied controls right. */}
        <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-6 md:px-10 py-5 md:py-6 text-white">
          <span className="inline-flex items-center gap-2 font-sans font-extrabold tracking-tight">
            <span className="text-sig-link"><Mark size={30} /></span>
            <span className="font-serif text-[20px] md:text-[23px]" style={{ textShadow: TS }}>Voyager</span>
          </span>
          <div className="flex items-center gap-3">{headerRight}</div>
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
              trip={focus}
              onOpen={onOpen}
              onOpenArrange={onOpenArrange}
              onOpenGuide={onOpenGuide}
              units={units}
              today={today}
            />
          </div>
        </motion.div>

        {/* Pexels attribution — only when the clip came from a Pexels fetch. */}
        {credit && (
          <a
            href={credit.pexelsUrl ?? 'https://www.pexels.com'}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-3 right-4 z-30 font-mono text-[10px] tracking-wide text-white/45 transition-colors hover:text-white/70"
            style={{ textShadow: TS }}
          >
            Video{credit.name ? ` by ${credit.name}` : ''} · Pexels
          </a>
        )}
      </section>

      {/* Your travels — pulled up over the globe (glass cards let the Earth show beneath). */}
      <section className="relative z-10 -mt-[18vh]">
        <div className="mx-auto max-w-5xl px-5 md:px-8 pt-[2vh] pb-[40vh]">
          {/* Globe-activation sentinel — once it scrolls into the top ~45% of the
              viewport the globe goes live and the hero video pauses. */}
          <div ref={globeRef} aria-hidden className="h-px w-full" />
          <TravelsList trips={trips} featuredId={focus.id} onOpen={onOpen} userId={userId} today={today} />
        </div>
      </section>
    </div>
  )
}

export default CockpitHome
