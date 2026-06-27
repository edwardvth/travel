import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Mark } from './Logo'
import { HeroSearchPill } from '../hero/HeroSearchPill'
import { HeroMicroDetails } from '../hero/HeroMicroDetails'
import { HeroVideoStage } from '../hero/HeroVideoStage'
import { clipForWord, FIRST_CLIP, upcomingClips } from '../hero/wordClips'
import type { HeroClip } from '../hero/types'

/**
 * CinematicHero — the single source of truth for the landing AND launchpad hero
 * (spec §4/§7). Renders the controlled HeroVideoStage (clip driven by the
 * typewriter), the entrance motion, eyebrow, headline, subcopy, the HeroSearchPill
 * (types/deletes), and HeroMicroDetails. Shared hero visual changes are made HERE,
 * never duplicated per page.
 *
 * Per-page knobs: headline/subcopy/eyebrow, the right-hand header content, a video
 * brightness filter, an optional dissolve mask on the video layer (launchpad), and
 * a `videoPlaying` gate for the one-animated-background guarantee.
 */
export interface CinematicHeroProps {
  headline: ReactNode
  subcopy: ReactNode
  eyebrow?: string
  headerRight?: ReactNode
  /** brightness() multiplier on the video layer. 1 = as-is. */
  brightness?: number
  /** CSS mask applied to the video layer (launchpad dissolve). */
  videoMask?: string
  /** When false, the video pauses (coordination). Default true. */
  videoPlaying?: boolean
  /** <h1> className. Defaults to Landing's exact metrics; launchpad overrides. */
  headlineClassName?: string
  /** Copy-block top padding. Defaults to Landing's exact metrics; launchpad overrides. */
  copyPaddingClassName?: string
  /** HeroSearchPill top margin. Defaults to Landing's exact metrics; launchpad overrides. */
  pillMarginClassName?: string
  onSubmit?: (destination: string) => void
  /**
   * When provided, renders this instead of the default HeroSearchPill. Receives the
   * hero's clip-driver so a custom pill's typewriter can still cycle the background video.
   */
  renderPill?: (api: { onWordStart: (word: string) => void }) => ReactNode
  className?: string
}

export function CinematicHero({
  headline, subcopy, eyebrow = 'Plan · Walk · Remember', headerRight,
  brightness = 1, videoMask, videoPlaying = true,
  headlineClassName = 'mt-4 font-serif font-medium tracking-tight text-[40px] leading-[1.04] md:text-[66px] md:leading-[1.02]',
  copyPaddingClassName = 'pt-[17vh] md:pt-[19vh]',
  pillMarginClassName = 'mt-[calc(10vh_+_2.25rem)] md:mt-12',
  onSubmit, renderPill, className,
}: CinematicHeroProps) {
  const reduce = useReducedMotion()
  const [clip, setClip] = useState(FIRST_CLIP)
  const [upcoming, setUpcoming] = useState<HeroClip[]>([])
  const onWord = (word: string) => {
    setClip(clipForWord(word))
    setUpcoming(upcomingClips(word, 3))
  }

  const videoLayer = (
    <HeroVideoStage clip={clip} upcoming={upcoming} playing={videoPlaying} className="absolute inset-0" />
  )

  return (
    <section className={className ?? 'relative h-[100svh] min-h-[620px] overflow-hidden'}>
      {videoMask || brightness !== 1 ? (
        <div
          className="absolute inset-0"
          style={{
            ...(videoMask ? { WebkitMaskImage: videoMask, maskImage: videoMask } : null),
            ...(brightness !== 1 ? { filter: `brightness(${brightness})` } : null),
          }}
        >
          {videoLayer}
        </div>
      ) : (
        videoLayer
      )}

      <nav className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 md:px-10 py-5 md:py-6 text-white">
        <span className="inline-flex items-center gap-2 font-sans font-extrabold tracking-tight">
          <span className="text-sig-link"><Mark size={30} /></span>
          <span className="font-serif text-[20px] md:text-[23px]">Voyager</span>
        </span>
        {headerRight}
      </nav>

      <motion.div
        initial={reduce ? false : { y: 12 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex h-full flex-col items-center px-5 text-center text-white ${copyPaddingClassName}`}
      >
        <div className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.32em] text-white/85">
          {eyebrow}
        </div>
        <h1
          className={headlineClassName}
          style={{ textShadow: '0 2px 30px rgba(0,0,0,.6)' }}
        >
          {headline}
        </h1>
        <p className="mt-4 md:mt-5 font-sans italic text-[15px] md:text-[18px] text-white/85">
          {subcopy}
        </p>
        <div className={`pointer-events-auto ${pillMarginClassName}`}>
          {renderPill
            ? renderPill({ onWordStart: onWord })
            : <HeroSearchPill onSubmit={onSubmit ?? (() => {})} onWordStart={onWord} />}
        </div>
        <HeroMicroDetails className="mt-4" />
      </motion.div>
    </section>
  )
}

export default CinematicHero
