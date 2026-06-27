import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Plus, Cloud, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { Mark } from '../components/Logo'
import { HeroVideoStage } from '../hero/HeroVideoStage'
import { clipForWord } from '../hero/wordClips'
import { FieldGlobe } from '../home/FieldGlobe'
import { useInViewActive } from '../home/useInViewActive'
import { Button } from '../components/ui/Button'
import globeStill from '../assets/globe-still.webp'

/**
 * TEMPORARY preview-only route (no auth) — NOT part of the app. Compares trip
 * tile/card INTERACTIONS for the State B home:
 *   • Desktop (both routes): hover-pop tiles + a Netflix-style horizontal rail
 *     once there are many upcoming trips.
 *   • Mobile, variant 'expand'  (/x-home-mobile-deck-expand)   — tap the deck →
 *     it unfolds downward into the full vertical list.
 *   • Mobile, variant 'rail'    (/x-home-mobile-horizontal-rail) — tap the deck →
 *     it opens into a horizontally scrollable card rail.
 * 10 upcoming trips are mocked so the overflow / deck cases are testable.
 * Delete before merge.
 */

type MockTrip = {
  name: string
  countdown: string
  dates: string
  stops: number
  weather: string
  cover: string
  phase: 'before' | 'during'
}

const UPCOMING: MockTrip[] = [
  { name: 'Tokyo', countdown: 'In 9 days', dates: 'Mar 18 → Mar 25', stops: 12, weather: 'Mar 18 · 16° / 8°', cover: '/video/tokyo.jpg', phase: 'before' },
  { name: 'Santorini', countdown: 'In 28 days', dates: 'Apr 6 → Apr 11', stops: 8, weather: 'Apr 6 · 19° / 12°', cover: '/video/santorini.jpg', phase: 'before' },
  { name: 'Paris', countdown: 'In 54 days', dates: 'May 2 → May 7', stops: 15, weather: 'May 2 · 21° / 11°', cover: '/video/paris.jpg', phase: 'before' },
  { name: 'Kyoto', countdown: 'In 72 days', dates: 'May 20 → May 26', stops: 11, weather: 'May 20 · 23° / 14°', cover: '/video/kyoto.jpg', phase: 'before' },
  { name: 'Dubai', countdown: 'In 96 days', dates: 'Jun 13 → Jun 18', stops: 9, weather: 'Jun 13 · 38° / 28°', cover: '/video/dubai.jpg', phase: 'before' },
  { name: 'Rio', countdown: 'In 120 days', dates: 'Jul 7 → Jul 14', stops: 13, weather: 'Jul 7 · 27° / 19°', cover: '/video/rio.jpg', phase: 'before' },
  { name: 'Singapore', countdown: 'In 141 days', dates: 'Jul 28 → Aug 2', stops: 7, weather: 'Jul 28 · 31° / 26°', cover: '/video/singapore.jpg', phase: 'before' },
  { name: 'Milan', countdown: 'In 165 days', dates: 'Aug 21 → Aug 25', stops: 6, weather: 'Aug 21 · 29° / 18°', cover: '/video/milan.jpg', phase: 'before' },
  { name: 'Swiss Alps', countdown: 'In 190 days', dates: 'Sep 15 → Sep 21', stops: 10, weather: 'Sep 15 · 14° / 4°', cover: '/video/swiss-alps.jpg', phase: 'before' },
  { name: 'Patagonia', countdown: 'In 220 days', dates: 'Oct 15 → Oct 24', stops: 14, weather: 'Oct 15 · 12° / 3°', cover: '/video/patagonia.jpg', phase: 'before' },
]
const PAST = [
  { name: 'Positano', date: 'Jun 2025 · 4 days', img: '/video/positano.jpg' },
  { name: 'Banff', date: 'Sep 2024 · 5 days', img: '/video/banff.jpg' },
  { name: 'Yerevan', date: 'Mar 2024 · 6 days', img: '/video/yerevan.jpg' },
]
const MASK = 'linear-gradient(to bottom, #000 70%, transparent 96%)'
const HEADER_SCRIM = 'linear-gradient(to bottom, rgba(8,8,12,.30) 0%, rgba(8,8,12,.12) 32%, rgba(8,8,12,.58) 74%, rgba(8,8,12,.9) 100%)'

// Deck / morph geometry (px). CARD_H must match the card's real height below.
const CARD_H = 264 // header 192 + footer 72
const PEEK = 26    // visible strip per card behind the front one
const DEPTH = 3    // max folded cards shown behind the front one (count lives in the button)
const GAP = 16     // gap between cards in the expanded list
const INSET = 14   // horizontal inset per depth layer

// Smooth two-layer text shadow — a tight layer for crispness + a soft wide layer
// that separates white text from the cinematic background. STRONG = over bright tiles.
const TS = '0 1px 3px rgba(0,0,0,.62), 0 4px 20px rgba(0,0,0,.55)'
const TS_STRONG = '0 1px 4px rgba(0,0,0,.72), 0 6px 28px rgba(0,0,0,.62)'

/** A soft, diffuse dark halo placed BEHIND a card group so the scrollable strip
 *  reads as separate from the busy background (not a hard edge). */
function SoftBackdrop() {
  return <div aria-hidden className="pointer-events-none absolute -inset-x-1 -inset-y-4 -z-10 rounded-[32px] bg-black/45 blur-[52px]" />
}

/** The cockpit tile — FIXED height so the deck math is deterministic. Lifts on
 *  hover (hover-capable pointers only, so touch taps never get a stuck hover). */
function CockpitCard({ t }: { t: MockTrip }) {
  const during = t.phase === 'during'
  return (
    <div className="group h-[264px] w-full overflow-hidden rounded-[22px] shadow-[0_22px_64px_rgba(0,0,0,.5)] transition-[transform,box-shadow] duration-300 ease-out [@media(hover:hover)]:hover:-translate-y-1.5 [@media(hover:hover)]:hover:shadow-[0_34px_82px_rgba(0,0,0,.62)] motion-reduce:transition-none motion-reduce:hover:transform-none">
      <div className="relative h-[192px]">
        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 ease-out [@media(hover:hover)]:group-hover:scale-[1.04]" style={{ backgroundImage: `url('${t.cover}')` }} />
        <div className="absolute inset-0" style={{ background: HEADER_SCRIM }} />
        <div className="relative flex h-full flex-col p-5">
          <div className="font-mono text-[14px] font-semibold uppercase tracking-[0.26em] text-white" style={{ textShadow: TS_STRONG }}>{t.countdown}</div>
          <div className="mt-auto">
            <div className="font-serif text-[36px] leading-[0.96] tracking-tight text-white" style={{ textShadow: TS_STRONG }}>{t.name}</div>
            <div className="mt-2 font-mono text-[11.5px] uppercase tracking-[0.18em] text-white/85" style={{ textShadow: TS_STRONG }}>{t.dates} · {t.stops} stops</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-white/90" style={{ textShadow: TS_STRONG }}>
              <Cloud size={14} className="text-white/80" />
              <span>{t.weather}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex h-[72px] items-center gap-3 bg-[#0f0f15] px-5">
        {during ? (
          <>
            <Button variant="claret" className="flex-1 justify-center py-2.5 text-[15px]">Start guide <ArrowRight size={16} /></Button>
            <button className="rounded-full border border-white/20 bg-white/[0.07] px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-white/15">Plan</button>
          </>
        ) : (
          <>
            <Button variant="claret" className="flex-1 justify-center py-2.5 text-[15px]">Start planning <ArrowRight size={16} /></Button>
            <button className="rounded-full border border-white/20 bg-white/[0.07] px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-white/15">Guide</button>
          </>
        )}
      </div>
    </div>
  )
}

/** Shared desktop behaviour: a horizontal rail (no infinite vertical stack).
 *  Scrolls past ~5 cards; scrollbar hidden but keyboard-focusable + swipeable. */
function DesktopRail() {
  return (
    <div className="relative hidden md:block">
      <SoftBackdrop />
      <div
        tabIndex={0}
        aria-label="Upcoming trips"
        className="flex gap-5 overflow-x-auto px-1 pt-4 pb-3 snap-x snap-mandatory scroll-smooth [scrollbar-width:thin] [scrollbar-color:var(--sig)_rgba(255,255,255,0.12)] [&::-webkit-scrollbar]:h-[9px] [&::-webkit-scrollbar-track]:my-1 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-sig"
      >
        {UPCOMING.map((t) => (
          <div key={t.name} className="w-[300px] shrink-0 snap-start">
            <CockpitCard t={t} />
          </div>
        ))}
      </div>
    </div>
  )
}

function MobileTrips({ variant }: { variant: 'expand' | 'rail' }) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  // Render order — first = front of the deck. (Preserved across open/close.)
  const order = UPCOMING.map((_, i) => i)
  const n = UPCOMING.length
  const cappedDepth = Math.min(n - 1, DEPTH)
  const deckHeight = CARD_H + cappedDepth * PEEK
  const listHeight = n * CARD_H + (n - 1) * GAP
  const morph = reduce ? undefined : 'transform .5s cubic-bezier(.22,1,.36,1), margin .5s cubic-bezier(.22,1,.36,1), opacity .35s ease'

  // "Show all N trips" CTA overlaid on the deck — just below the front card, on
  // top of the peeking cards, so it's always reachable without shifting anything.
  const showAll = (
    <button
      onClick={() => setOpen(true)}
      aria-label={`Show all ${n} upcoming trips`}
      style={{ top: CARD_H + 6 }}
      className="absolute left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/25 bg-[#0f0f15]/95 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_10px_26px_rgba(0,0,0,.55)] backdrop-blur transition-colors hover:bg-[#0f0f15] [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]"
    >
      Show all {n} upcoming trips <ChevronDown size={15} />
    </button>
  )
  const collapse = (
    <div className="mt-5 flex justify-center">
      <button
        onClick={() => setOpen(false)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-[13px] font-medium text-white backdrop-blur transition-colors hover:bg-white/15 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]"
      >
        Collapse <ChevronUp size={15} />
      </button>
    </div>
  )

  // ── Version A: tap the deck → it unfolds DOWNWARD into the full list. The same
  // card elements animate from their stacked offsets to their list slots. ──
  if (variant === 'expand') {
    return (
      <div className={open ? 'pb-[18vh]' : undefined}>
        <div className="relative w-full" style={{ height: open ? listHeight : deckHeight, transition: reduce ? undefined : 'height .5s cubic-bezier(.22,1,.36,1)' }}>
          {!open && <SoftBackdrop />}
          {order.map((idx, pos) => {
            const t = UPCOMING[idx]
            const d = Math.min(pos, DEPTH)
            const y = open ? pos * (CARD_H + GAP) : d * PEEK
            const mx = open ? 0 : d * INSET
            return (
              <div
                key={t.name}
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${y}px)`, marginLeft: mx, marginRight: mx, zIndex: open ? 1 : n - pos, transition: morph }}
              >
                <CockpitCard t={t} />
                {/* dim behind cards so they recede; fades out as it opens */}
                <div className="pointer-events-none absolute inset-0 rounded-[22px] bg-black" style={{ opacity: open ? 0 : (pos > 0 ? Math.min(d * 0.16, 0.48) : 0), transition: reduce ? undefined : 'opacity .35s ease' }} />
              </div>
            )
          })}
          {!open && showAll}
        </div>
        {open && collapse}
      </div>
    )
  }

  // ── Version B: tap the deck → it opens into a horizontal card rail. ──
  return (
    <div>
      {open ? (
        <>
          <div
            tabIndex={0}
            aria-label="Upcoming trips"
            className="relative flex gap-4 overflow-x-auto px-0.5 pb-3 pt-1 snap-x snap-mandatory scroll-smooth [scrollbar-width:thin] [scrollbar-color:var(--sig)_rgba(255,255,255,0.12)] [&::-webkit-scrollbar]:h-[9px] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-sig"
          >
            <SoftBackdrop />
            {order.map((idx, pos) => {
              const t = UPCOMING[idx]
              return (
                <motion.div
                  key={t.name}
                  className="w-[80vw] max-w-[340px] shrink-0 snap-start"
                  initial={reduce ? false : { opacity: 0, x: 30, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ duration: 0.42, delay: reduce ? 0 : Math.min(pos, 6) * 0.05, ease: [0.22, 1, 0.36, 1] }}
                >
                  <CockpitCard t={t} />
                </motion.div>
              )
            })}
          </div>
          {collapse}
        </>
      ) : (
        <div className="relative w-full" style={{ height: deckHeight }}>
          <SoftBackdrop />
          {order.map((idx, pos) => {
            const t = UPCOMING[idx]
            const d = Math.min(pos, DEPTH)
            return (
              <div
                key={t.name}
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${d * PEEK}px)`, marginLeft: d * INSET, marginRight: d * INSET, zIndex: n - pos }}
              >
                <CockpitCard t={t} />
                <div className="pointer-events-none absolute inset-0 rounded-[22px] bg-black" style={{ opacity: pos > 0 ? Math.min(d * 0.16, 0.48) : 0 }} />
              </div>
            )
          })}
          {showAll}
        </div>
      )}
    </div>
  )
}

function Nav() {
  return (
    <nav className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-6 md:px-10 py-5 md:py-6 text-white">
      <span className="inline-flex items-center gap-2 font-sans font-extrabold tracking-tight">
        <span className="text-sig-link"><Mark size={30} /></span>
        <span className="font-serif text-[20px] md:text-[23px]" style={{ textShadow: TS }}>Voyager</span>
      </span>
      <div className="flex items-center gap-3">
        <Button variant="claret"><Plus size={16} strokeWidth={2.5} />New trip</Button>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-sig text-[13px] font-semibold text-white">E</span>
      </div>
    </nav>
  )
}

export default function PreviewHomeInteractions({ variant = 'expand' }: { variant?: 'expand' | 'rail' }) {
  const reduce = useReducedMotion()
  const { globeRef, globeActive, heroActive } = useInViewActive()
  const clip = clipForWord(UPCOMING[0].name) // curated Tokyo clip — instant, no auth

  return (
    <div className="relative min-h-[100svh] bg-[#05060a] text-white">
      {/* Globe — original transition geometry. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[185vh] overflow-hidden bg-[#05060a]">
        <div className="absolute inset-x-0 top-[20vh] h-[170vh]">
          <FieldGlobe className="absolute inset-0" active={globeActive} staticSrc={globeStill} dprCap={1.0} frag={{ octaves: 3, blur: false }} />
        </div>
      </div>

      {/* Hero — full-height welcome band (original 100svh; mask fades 70→96%). */}
      <section className="relative z-10 min-h-[100svh] overflow-hidden">
        {/* Footage is pinned to a fixed top band — it does NOT stretch when the deck
            expands. Below it the background stays the globe, then solid black past it. */}
        <div className="absolute inset-x-0 top-0 h-[100svh]" style={{ WebkitMaskImage: MASK, maskImage: MASK, filter: 'brightness(1.8)' }}>
          <HeroVideoStage clip={clip} playing={heroActive} className="absolute inset-0" />
        </div>
        <Nav />
        <motion.div
          initial={reduce ? false : { y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-20 mx-auto flex min-h-[100svh] max-w-6xl flex-col items-center px-5 md:px-8 pt-[13vh] md:pt-[15vh] pb-[12vh] text-center text-white"
        >
          <div className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.32em] text-white/85" style={{ textShadow: TS }}>Plan · Walk · Remember</div>
          <h1 className="mt-4 font-serif font-medium tracking-tight text-[40px] leading-[1.02] md:text-[64px]" style={{ textShadow: TS_STRONG }}>
            Welcome back, Edward.
          </h1>
          <p className="mt-4 font-sans text-[15px] md:text-[17px] text-white/80" style={{ textShadow: TS }}>
            {UPCOMING.length} trips on the horizon.
          </p>
          {/* Upcoming cards centered over the footage — desktop rail / mobile deck. */}
          <div className="mt-9 w-full">
            <DesktopRail />
            <div className="md:hidden">
              <MobileTrips variant={variant} />
            </div>
          </div>
        </motion.div>
      </section>

      {/* Your travels — pulled up into the fade (original -18vh); globe wakes here. */}
      <section className="relative z-10 -mt-[18vh]">
        <div className="mx-auto max-w-6xl px-5 md:px-8 pt-[2vh] pb-[40vh]">
          <div ref={globeRef} aria-hidden className="h-px w-full" />
          <h2 className="mb-5 text-left font-serif text-[clamp(22px,3.2vw,30px)] font-medium tracking-tight text-white" style={{ textShadow: TS }}>
            Your travels
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PAST.map((t) => (
              <div key={t.name} className="group overflow-hidden rounded-card border border-white/15 bg-white/[0.06] backdrop-blur-xl shadow-[0_10px_34px_rgba(0,0,0,.35)] transition-transform duration-300 ease-out [@media(hover:hover)]:hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:transform-none">
                <div className="h-[120px] bg-cover bg-center transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-[1.04]" style={{ backgroundImage: `url('${t.img}')` }} />
                <div className="px-4 py-3">
                  <div className="font-serif text-xl text-white" style={{ textShadow: TS }}>{t.name}</div>
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
