import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Plus, Cloud, ArrowRight } from 'lucide-react'
import { Mark } from '../components/Logo'
import { HeroVideoStage } from '../hero/HeroVideoStage'
import { clipForWord } from '../hero/wordClips'
import { fetchDestinationVideo, clipFromDestinationVideo } from '../hero/destinationVideo'
import { FieldGlobe } from '../home/FieldGlobe'
import { useInViewActive } from '../home/useInViewActive'
import { Button } from '../components/ui/Button'
import globeStill from '../assets/globe-still.webp'

/**
 * TEMPORARY preview-only route (no auth) — NOT part of the app. The cinematic
 * State B (account WITH an upcoming/active trip) home: "Welcome back, Edward."
 * over the destination footage, with a rich "cockpit card" (big countdown,
 * destination, dates · stops, weather, Plan/Guide actions) that dissolves into
 * the globe with "Your travels" below.
 *   variant 'a' = BEFORE (upcoming)  → big Plan, small Guide, "IN 12 DAYS"
 *   variant 'b' = DURING (active)    → big Guide, small Plan, "DAY 3 OF 6"
 * Delete before merge. Mounted at /x-cockpit-a and /x-cockpit-b.
 */

const TRIP = {
  name: 'Luxembourg',
  country: 'Luxembourg',
  dates: 'Apr 14 → Apr 20',
  stops: '10 stops',
  // Resolved by the cover pipeline (no matching hero clip → cover photo is used).
  cover: 'https://images.unsplash.com/photo-1588336899284-950764f07147?ixid=M3w5ODU3NjF8MHwxfHNlYXJjaHwxfHxMdXhlbWJvdXJnfGVufDF8MHx8fDE3ODI1MTEyOTJ8MA&ixlib=rb-4.1.0&w=1600&q=80&fm=jpg&fit=max',
}
const PAST = [
  { name: 'Positano', date: 'Jun 2025 · 4 days', img: '/video/positano.jpg' },
  { name: 'Banff', date: 'Sep 2024 · 5 days', img: '/video/banff.jpg' },
]
const MASK = 'linear-gradient(to bottom, #000 70%, transparent 96%)'

export default function PreviewCockpit({ variant = 'a' }: { variant?: 'a' | 'b' }) {
  const reduce = useReducedMotion()
  const { globeRef, globeActive, heroActive } = useInViewActive()
  // Start with the girl-walking fallback; swap in a real Pexels destination video
  // once it resolves (HeroVideoStage crossfades). Falls back gracefully if the
  // pexels-video function isn't deployed / has no result.
  const [clip, setClip] = useState(() => clipForWord(TRIP.name))
  useEffect(() => {
    let cancelled = false
    fetchDestinationVideo(TRIP.name, TRIP.country).then((v) => {
      if (!cancelled && v) setClip(clipFromDestinationVideo(TRIP.name, v))
    })
    return () => { cancelled = true }
  }, [])
  const during = variant === 'b'

  const countdown = during ? 'Day 3 of 6' : 'In 12 days'
  const weatherLine = during ? 'Today · 18° / 11°' : 'Apr 14 · 19° / 9°'

  return (
    <div className="relative min-h-[100svh] bg-[#05060a] text-white">
      {/* Globe */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[185vh] overflow-hidden bg-[#05060a]">
        <div className="absolute inset-x-0 top-[20vh] h-[170vh]">
          <FieldGlobe className="absolute inset-0" active={globeActive} staticSrc={globeStill} dprCap={1.0} frag={{ octaves: 3, blur: false }} />
        </div>
      </div>

      {/* Hero */}
      <section className="relative z-10 h-[100svh] min-h-[640px] overflow-hidden">
        {/* Hero = a destination clip when one matches, else the girl-walking generic
            clip (HeroVideoStage handles that fallback). The trip's cover PHOTO is used
            in the card below — so the hero and card are never the same picture. */}
        <div className="absolute inset-0" style={{ WebkitMaskImage: MASK, maskImage: MASK, filter: 'brightness(1.8)' }}>
          <HeroVideoStage clip={clip} playing={heroActive} className="absolute inset-0" />
        </div>

        <nav className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 md:px-10 py-5 md:py-6 text-white">
          <span className="inline-flex items-center gap-2 font-sans font-extrabold tracking-tight">
            <span className="text-sig-link"><Mark size={30} /></span>
            <span className="font-serif text-[20px] md:text-[23px]">Voyager</span>
          </span>
          <div className="flex items-center gap-3">
            <Button variant="claret"><Plus size={16} strokeWidth={2.5} />New trip</Button>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-sig text-[13px] font-semibold text-white">E</span>
          </div>
        </nav>

        <motion.div
          initial={reduce ? false : { y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-0 top-0 z-20 flex h-full flex-col items-center px-5 text-center text-white pt-[13vh] md:pt-[15vh]"
        >
          <div className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.32em] text-white/85">Plan · Walk · Remember</div>
          <h1 className="mt-4 font-serif font-medium tracking-tight text-[40px] leading-[1.02] md:text-[64px]" style={{ textShadow: '0 2px 30px rgba(0,0,0,.6)' }}>
            Welcome back, Edward.
          </h1>

          {/* Cockpit card — destination photo header (countdown + identity +
              weather overlaid) with the actions on a SOLID footer bar so Plan /
              Guide are always clearly visible and easy to press. */}
          <div className="pointer-events-auto mt-8 w-full max-w-[440px] overflow-hidden rounded-[22px] text-left shadow-[0_22px_64px_rgba(0,0,0,.55)]">
            {/* photo header */}
            <div className="relative h-[228px]">
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${TRIP.cover}')` }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(8,8,12,.30) 0%, rgba(8,8,12,.12) 32%, rgba(8,8,12,.58) 74%, rgba(8,8,12,.9) 100%)' }} />
              <div className="relative flex h-full flex-col p-5">
                <div className="font-mono text-[15px] font-semibold uppercase tracking-[0.26em] text-white" style={{ textShadow: '0 1px 14px rgba(0,0,0,.7)' }}>{countdown}</div>
                <div className="mt-auto">
                  <div className="font-serif text-[40px] leading-[0.96] tracking-tight" style={{ textShadow: '0 2px 18px rgba(0,0,0,.5)' }}>{TRIP.name}</div>
                  {/* context line — always the dates; duration when planning, today's plan when active */}
                  <div className="mt-2 font-mono text-[11.5px] uppercase tracking-[0.18em] text-white/85" style={{ textShadow: '0 1px 10px rgba(0,0,0,.75)' }}>{during ? `${TRIP.dates} · 10 stops today` : `${TRIP.dates} · 6 days`}</div>
                  {/* weather on its own line */}
                  <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-white/90" style={{ textShadow: '0 1px 10px rgba(0,0,0,.75)' }}>
                    <Cloud size={14} className="text-white/80" />
                    <span>{weatherLine}</span>
                  </div>
                </div>
              </div>
            </div>
            {/* solid action bar — buttons never hidden, easy to tap */}
            <div className="flex items-center gap-3 bg-[#0f0f15] px-5 py-4">
              {during ? (
                <>
                  <Button variant="claret" className="flex-1 justify-center py-3 text-[15px]">Start guide <ArrowRight size={16} /></Button>
                  <button className="rounded-full border border-white/20 bg-white/[0.07] px-5 py-3 text-[14px] font-medium text-white transition-colors hover:bg-white/15">Plan</button>
                </>
              ) : (
                <>
                  <Button variant="claret" className="flex-1 justify-center py-3 text-[15px]">Start planning <ArrowRight size={16} /></Button>
                  <button className="rounded-full border border-white/20 bg-white/[0.07] px-5 py-3 text-[14px] font-medium text-white transition-colors hover:bg-white/15">Guide</button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Your travels */}
      <section className="relative z-10 -mt-[18vh]">
        <div className="mx-auto max-w-6xl px-5 md:px-8 pt-[2vh] pb-[40vh]">
          <div ref={globeRef} aria-hidden className="h-px w-full" />
          <h2 className="mb-5 text-left font-serif text-[clamp(22px,3.2vw,30px)] font-medium tracking-tight text-white" style={{ textShadow: '0 2px 24px rgba(0,0,0,.55)' }}>
            Your travels
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PAST.map((t) => (
              <div key={t.name} className="overflow-hidden rounded-card border border-white/15 bg-white/[0.06] backdrop-blur-xl shadow-[0_10px_34px_rgba(0,0,0,.35)]">
                <div className="h-[120px] bg-cover bg-center" style={{ backgroundImage: `url('${t.img}')` }} />
                <div className="px-4 py-3">
                  <div className="font-serif text-xl text-white">{t.name}</div>
                  <div className="mt-0.5 text-[12px] text-white/65">{t.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
