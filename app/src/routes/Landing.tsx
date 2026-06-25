import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Mark } from '../components/Logo'
import { HeroSearchPill } from '../hero/HeroSearchPill'
import { HeroMicroDetails } from '../hero/HeroMicroDetails'
import { AnimatedLink } from '../components/ui/animated-link'
import { HeroVideoStage } from '../hero/HeroVideoStage'
import { clipForWord, FIRST_CLIP, upcomingClips } from '../hero/wordClips'
import type { HeroClip } from '../hero/types'
import { cn } from '../lib/utils'

/**
 * Calm claret pill CTA — deeper oxblood `--sig`, neutral soft shadow, medium
 * weight, no colored glow halo. Claret is an accent; keep it quiet.
 */
function ClaretPill({
  onClick,
  children,
  className,
}: {
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-sig px-5 py-2.5',
        'font-sans font-medium text-[14px] text-white shadow-[0_4px_14px_rgba(0,0,0,.25)]',
        'transition-[transform,filter] duration-150 hover:brightness-110 active:translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        className,
      )}
    >
      {children}
    </button>
  )
}

export default function Landing() {
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const go = () => nav('/auth')
  const goSignup = () => nav('/auth?mode=signup')
  const goSignin = () => nav('/auth?mode=signin')

  // The background follows the typewriter: each word crossfades to its own clip,
  // and we prefetch the next couple so those crossfades are instant.
  const [clip, setClip] = useState(FIRST_CLIP)
  const [upcoming, setUpcoming] = useState<HeroClip[]>([])
  const onWord = (word: string) => {
    setClip(clipForWord(word))
    setUpcoming(upcomingClips(word, 3))
  }

  return (
    <div className="bg-base text-ink">
      <section className="relative h-[100svh] min-h-[600px] overflow-hidden">
        {/* Full-bleed cinematic background — a controlled video stage driven by
            the typewriter word. Provides its own legibility scrims. */}
        <HeroVideoStage clip={clip} upcoming={upcoming} className="absolute inset-0" />

        <nav className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-6 md:px-10 py-5 md:py-6 text-white">
          <span className="inline-flex items-center gap-2 font-sans font-extrabold tracking-tight">
            <span className="text-sig-link"><Mark size={30} /></span>
            <span className="font-serif text-[20px] md:text-[23px]">Voyager</span>
          </span>
          <div className="flex items-center gap-5 md:gap-7 text-[14px] text-white">
            <span className="hidden sm:inline-flex">
              <AnimatedLink
                href="/auth?mode=signin"
                onClick={(e) => {
                  e.preventDefault()
                  goSignin()
                }}
                className="text-[14px]"
              >
                Sign in
              </AnimatedLink>
            </span>
            <ClaretPill onClick={goSignup}>Get started</ClaretPill>
          </div>
        </nav>

        {/* Hero copy — centered horizontally, anchored in the upper-middle so it
            sits above the vertical center (raised up), matching the mockups. */}
        {/* Slide-up entrance only — NO opacity fade. An ancestor with opacity < 1
            isolates a group and suppresses the search pill's backdrop-blur until
            the fade lands on opacity:1, which flashed the pill transparent→
            translucent. Animating y alone keeps the pill glassy from frame 0. */}
        <motion.div
          initial={reduce ? false : { y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-full flex-col items-center px-5 text-center text-white pt-[17vh] md:pt-[19vh]"
        >
          <div className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.32em] text-white/85">
            Plan · Walk · Remember
          </div>
          <h1
            className="mt-4 font-serif font-medium tracking-tight text-[40px] leading-[1.04] md:text-[66px] md:leading-[1.02]"
            style={{ textShadow: '0 2px 30px rgba(0,0,0,.6)' }}
          >
            Every trip,
            <br />
            <span className="italic text-gold whitespace-nowrap">beautifully guided.</span>
          </h1>
          <p className="mt-4 md:mt-5 font-sans italic text-[15px] md:text-[18px] text-white/85">
            Made for travelers, by travelers
          </p>

          {/* Headline sits a bit up (pt-17vh); keep the pill at its original spot
              on mobile by compensating its gap so it doesn't move with the text. */}
          <HeroSearchPill
            onSubmit={go}
            onWordStart={onWord}
            className="pointer-events-auto mt-[calc(10vh_+_2.25rem)] md:mt-12"
          />
          <HeroMicroDetails className="mt-4" />
        </motion.div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-20 grid gap-10 md:grid-cols-3">
        {[
          { k: 'Plan', d: 'Build each day with smart suggestions — places, times, and notes that just work.' },
          { k: 'Walk', d: 'A calm live guide narrates each landmark as you approach it, hands-free.' },
          { k: 'Remember', d: 'Turn the trip into a beautiful story you’ll actually want to share.' },
        ].map((b, i) => (
          <motion.div key={b.k} initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}>
            <div className="font-serif text-2xl">{b.k}</div>
            <p className="text-muted text-[14px] mt-2 leading-relaxed">{b.d}</p>
          </motion.div>
        ))}
      </section>

      <section className="text-center pb-24 px-6">
        <ClaretPill onClick={go} className="px-6 py-3 text-[14.5px]">Start planning</ClaretPill>
      </section>
    </div>
  )
}
