import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Plus, Cloud, ArrowRight } from 'lucide-react'
import { Mark } from '../components/Logo'
import { HeroVideoStage } from '../hero/HeroVideoStage'
import { clipForWord } from '../hero/wordClips'
import { FieldGlobe } from '../home/FieldGlobe'
import { useInViewActive } from '../home/useInViewActive'
import { Button } from '../components/ui/Button'
import globeStill from '../assets/globe-still.webp'

/**
 * TEMPORARY preview-only route (no auth) — NOT part of the app. Side-by-side
 * comparison of how MULTIPLE upcoming trips arrange on the State B home.
 *   variant 'a' = ONE featured cockpit hero + smaller "Upcoming" row beneath.
 *   variant 'c' = EVERY upcoming trip is a cockpit card (grid on desktop,
 *                 stacked cards on mobile); past trips go to "Your travels".
 * Delete before merge. Mounted at /x-layout-a and /x-layout-c.
 */

type MockTrip = {
  name: string
  country: string
  countdown: string
  dates: string
  stops: number
  weather: string
  cover: string
  phase: 'before' | 'during'
}

const UPCOMING: MockTrip[] = [
  { name: 'Tokyo', country: 'Japan', countdown: 'In 9 days', dates: 'Mar 18 → Mar 25', stops: 12, weather: 'Mar 18 · 16° / 8°', cover: '/video/tokyo.jpg', phase: 'before' },
  { name: 'Santorini', country: 'Greece', countdown: 'In 28 days', dates: 'Apr 6 → Apr 11', stops: 8, weather: 'Apr 6 · 19° / 12°', cover: '/video/santorini.jpg', phase: 'before' },
  { name: 'Paris', country: 'France', countdown: 'In 54 days', dates: 'May 2 → May 7', stops: 15, weather: 'May 2 · 21° / 11°', cover: '/video/paris.jpg', phase: 'before' },
]
const PAST = [
  { name: 'Positano', date: 'Jun 2025 · 4 days', img: '/video/positano.jpg' },
  { name: 'Banff', date: 'Sep 2024 · 5 days', img: '/video/banff.jpg' },
]
const MASK = 'linear-gradient(to bottom, #000 70%, transparent 96%)'
const HEADER_SCRIM = 'linear-gradient(to bottom, rgba(8,8,12,.30) 0%, rgba(8,8,12,.12) 32%, rgba(8,8,12,.58) 74%, rgba(8,8,12,.9) 100%)'

/** The approved cockpit card: photo header (countdown + identity + weather) over
 *  a solid action bar. `hero` = the bigger featured size; otherwise grid size. */
function CockpitCard({ t, hero = false }: { t: MockTrip; hero?: boolean }) {
  const during = t.phase === 'during'
  return (
    <div className="pointer-events-auto w-full overflow-hidden rounded-[22px] text-left shadow-[0_22px_64px_rgba(0,0,0,.55)]">
      <div className={`relative ${hero ? 'h-[228px]' : 'h-[188px]'}`}>
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${t.cover}')` }} />
        <div className="absolute inset-0" style={{ background: HEADER_SCRIM }} />
        <div className="relative flex h-full flex-col p-5">
          <div className={`font-mono font-semibold uppercase tracking-[0.26em] text-white ${hero ? 'text-[15px]' : 'text-[12.5px]'}`} style={{ textShadow: '0 1px 14px rgba(0,0,0,.7)' }}>{t.countdown}</div>
          <div className="mt-auto">
            <div className={`font-serif leading-[0.96] tracking-tight text-white ${hero ? 'text-[40px]' : 'text-[30px]'}`} style={{ textShadow: '0 2px 18px rgba(0,0,0,.5)' }}>{t.name}</div>
            <div className="mt-2 font-mono text-[11.5px] uppercase tracking-[0.18em] text-white/85" style={{ textShadow: '0 1px 10px rgba(0,0,0,.75)' }}>{t.dates} · {t.stops} stops</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-white/90" style={{ textShadow: '0 1px 10px rgba(0,0,0,.75)' }}>
              <Cloud size={14} className="text-white/80" />
              <span>{t.weather}</span>
            </div>
          </div>
        </div>
      </div>
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
  )
}

/** Lighter "Upcoming" card used in Option A (cover + countdown chip + identity,
 *  no action bar — the whole tile opens the trip). */
function UpcomingMini({ t }: { t: MockTrip }) {
  return (
    <div className="group relative h-[176px] cursor-pointer overflow-hidden rounded-card shadow-[0_12px_38px_rgba(0,0,0,.4)]">
      <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.04]" style={{ backgroundImage: `url('${t.cover}')` }} />
      <div className="absolute inset-0" style={{ background: HEADER_SCRIM }} />
      <div className="absolute left-3.5 top-3.5 rounded-full bg-black/35 px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm">{t.countdown}</div>
      <div className="absolute inset-x-4 bottom-3.5">
        <div className="font-serif text-[26px] leading-none tracking-tight text-white" style={{ textShadow: '0 2px 14px rgba(0,0,0,.5)' }}>{t.name}</div>
        <div className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/80" style={{ textShadow: '0 1px 8px rgba(0,0,0,.7)' }}>{t.dates} · {t.stops} stops</div>
      </div>
    </div>
  )
}

function PastGrid() {
  return (
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
  )
}

function Nav() {
  return (
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
  )
}

export default function PreviewLayouts({ variant = 'a' }: { variant?: 'a' | 'c' }) {
  const reduce = useReducedMotion()
  const { globeRef, globeActive, heroActive } = useInViewActive()
  const clip = clipForWord(UPCOMING[0].name) // curated Tokyo clip — plays instantly, no auth

  // Option C mobile deck: render order (first = front). Tapping a card behind
  // brings it to the front, like flipping through a deck.
  const [order, setOrder] = useState(() => UPCOMING.map((_, i) => i))
  const bringToFront = (pos: number) => setOrder((o) => [o[pos], ...o.filter((_, i) => i !== pos)])

  // Globe layer shared by both options.
  const globe = (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[185vh] overflow-hidden bg-[#05060a]">
      <div className="absolute inset-x-0 top-[20vh] h-[170vh]">
        <FieldGlobe className="absolute inset-0" active={globeActive} staticSrc={globeStill} dprCap={1.0} frag={{ octaves: 3, blur: false }} />
      </div>
    </div>
  )

  const yourTravels = (
    <section className="relative z-10 -mt-[18vh]">
      <div className="mx-auto max-w-6xl px-5 md:px-8 pt-[2vh] pb-[40vh]">
        <div ref={globeRef} aria-hidden className="h-px w-full" />
        <h2 className="mb-5 text-left font-serif text-[clamp(22px,3.2vw,30px)] font-medium tracking-tight text-white" style={{ textShadow: '0 2px 24px rgba(0,0,0,.55)' }}>
          Your travels
        </h2>
        <PastGrid />
      </div>
    </section>
  )

  // ── Option C ── tiles live OVER the video. Original transition geometry: a
  // 100svh-tall footage hero whose mask fades at 70→96% with "Your travels"
  // pulled up -18vh. Content flows (not absolute) so stacked mobile cards grow
  // the hero instead of being clipped — the footage still covers them and the
  // dissolve stays below the cards.
  if (variant === 'c') {
    return (
      <div className="relative min-h-[100svh] bg-[#05060a] text-white">
        {globe}
        <section className="relative z-10 min-h-[100svh] overflow-hidden">
          <div className="absolute inset-0" style={{ WebkitMaskImage: MASK, maskImage: MASK, filter: 'brightness(1.8)' }}>
            <HeroVideoStage clip={clip} playing={heroActive} className="absolute inset-0" />
          </div>
          <Nav />
          <motion.div
            initial={reduce ? false : { y: 12 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-20 mx-auto flex max-w-6xl flex-col items-center px-5 md:px-8 pt-[13vh] md:pt-[15vh] pb-[6vh] text-center"
          >
            <div className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.32em] text-white/85">Plan · Walk · Remember</div>
            <h1 className="mt-4 font-serif font-medium tracking-tight text-[40px] leading-[1.02] md:text-[64px]" style={{ textShadow: '0 2px 30px rgba(0,0,0,.6)' }}>
              Welcome back, Edward.
            </h1>
            <p className="mt-4 font-sans text-[15px] md:text-[17px] text-white/80" style={{ textShadow: '0 1px 16px rgba(0,0,0,.6)' }}>
              {UPCOMING.length} trips on the horizon.
            </p>
            {/* Desktop: every upcoming trip is a cockpit tile, 3-across over the footage. */}
            <div className="mt-9 hidden w-full gap-5 text-left lg:grid lg:grid-cols-3">
              {UPCOMING.map((t) => <CockpitCard key={t.name} t={t} />)}
            </div>

            {/* Mobile: a DECK — the front trip full, the rest peeking beneath like
                stacked cards. Tap a card behind to bring it forward. */}
            <div className="relative mt-9 w-full pb-10 text-left lg:hidden">
              {order.map((tripIdx, pos) => {
                const t = UPCOMING[tripIdx]
                const behind = pos > 0
                return (
                  <div
                    key={t.name}
                    className={behind ? 'absolute inset-x-0 top-0 cursor-pointer transition-all duration-300' : 'relative transition-all duration-300'}
                    style={{
                      transform: `translateY(${pos * 18}px)`,
                      marginLeft: `${pos * 14}px`,
                      marginRight: `${pos * 14}px`,
                      zIndex: order.length - pos,
                    }}
                    onClick={behind ? () => bringToFront(pos) : undefined}
                    aria-hidden={behind}
                  >
                    <CockpitCard t={t} />
                    {behind && (
                      <div className="pointer-events-none absolute inset-0 rounded-[22px] bg-black" style={{ opacity: pos * 0.24 }} />
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        </section>
        {yourTravels}
      </div>
    )
  }

  // ── Option A ── one featured cockpit centered on a tall hero; the remaining
  // upcoming trips drop into a smaller "Upcoming" row beneath.
  return (
    <div className="relative min-h-[100svh] bg-[#05060a] text-white">
      {globe}
      <section className="relative z-10 h-[100svh] min-h-[640px] overflow-hidden">
        <div className="absolute inset-0" style={{ WebkitMaskImage: MASK, maskImage: MASK, filter: 'brightness(1.8)' }}>
          <HeroVideoStage clip={clip} playing={heroActive} className="absolute inset-0" />
        </div>
        <Nav />
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
          <div className="mt-8 w-full max-w-[440px]"><CockpitCard t={UPCOMING[0]} hero /></div>
        </motion.div>
      </section>

      <section className="relative z-10 -mt-[10vh]">
        <div className="mx-auto max-w-6xl px-5 md:px-8 pt-[2vh]">
          <div ref={globeRef} aria-hidden className="h-px w-full" />
          <h2 className="mb-5 text-left font-serif text-[clamp(22px,3.2vw,30px)] font-medium tracking-tight text-white" style={{ textShadow: '0 2px 24px rgba(0,0,0,.55)' }}>
            Upcoming
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {UPCOMING.slice(1).map((t) => <UpcomingMini key={t.name} t={t} />)}
          </div>
        </div>
      </section>

      <section className="relative z-10 mt-14">
        <div className="mx-auto max-w-6xl px-5 md:px-8 pb-[40vh]">
          <h2 className="mb-5 text-left font-serif text-[clamp(22px,3.2vw,30px)] font-medium tracking-tight text-white" style={{ textShadow: '0 2px 24px rgba(0,0,0,.55)' }}>
            Your travels
          </h2>
          <PastGrid />
        </div>
      </section>
    </div>
  )
}
