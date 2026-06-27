import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Plus, Cloud, ArrowRight, Search, LayoutGrid, LayoutList } from 'lucide-react'
import { Mark } from '../components/Logo'
import { HeroVideoStage } from '../hero/HeroVideoStage'
import { clipForWord } from '../hero/wordClips'
import { FieldGlobe } from '../home/FieldGlobe'
import { useInViewActive } from '../home/useInViewActive'
import { Button } from '../components/ui/Button'
import globeStill from '../assets/globe-still.webp'

/**
 * TEMPORARY preview-only route (no auth) — NOT part of the app. A self-contained
 * State B home variant: the most-upcoming trip is the centered cockpit hero;
 * below, under "Your travels", a SEARCH box + a TILES/DETAILED view toggle list
 * the remaining upcoming trips (soonest first) then the past trips.
 * Background + transition geometry are the approved originals. Delete before merge.
 * Mounted at /x-home-search-views.
 */

type MockTrip = { name: string; countdown: string; dates: string; stops: number; weather: string; cover: string; phase: 'before' | 'during' }

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
  { name: 'Positano', dates: 'Jun 2025 · 4 days', cover: '/video/positano.jpg' },
  { name: 'Banff', dates: 'Sep 2024 · 5 days', cover: '/video/banff.jpg' },
  { name: 'Yerevan', dates: 'Mar 2024 · 6 days', cover: '/video/yerevan.jpg' },
]

type Row = { name: string; cover: string; dates: string; stops?: number; when: string; kind: 'upcoming' | 'past' }

const MASK = 'linear-gradient(to bottom, #000 70%, transparent 96%)'
const HEADER_SCRIM = 'linear-gradient(to bottom, rgba(8,8,12,.30) 0%, rgba(8,8,12,.12) 32%, rgba(8,8,12,.58) 74%, rgba(8,8,12,.9) 100%)'
const TS = '0 1px 3px rgba(0,0,0,.62), 0 4px 20px rgba(0,0,0,.55)'
const TS_STRONG = '0 1px 4px rgba(0,0,0,.72), 0 6px 28px rgba(0,0,0,.62)'

function SoftBackdrop() {
  return <div aria-hidden className="pointer-events-none absolute -inset-x-1 -inset-y-4 -z-10 rounded-[32px] bg-black/45 blur-[52px]" />
}

/** The centered cockpit hero card. Bigger on desktop (grows down + wide; top is
 *  fixed by its place in the flow). Lifts on hover. */
function CockpitCard({ t }: { t: MockTrip }) {
  const during = t.phase === 'during'
  return (
    <div className="group h-[264px] w-full overflow-hidden rounded-[22px] shadow-[0_22px_64px_rgba(0,0,0,.5)] transition-[transform,box-shadow] duration-300 ease-out md:h-[330px] [@media(hover:hover)]:hover:-translate-y-1.5 [@media(hover:hover)]:hover:shadow-[0_34px_82px_rgba(0,0,0,.62)] motion-reduce:transition-none motion-reduce:hover:transform-none">
      <div className="relative h-[192px] md:h-[242px]">
        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 ease-out [@media(hover:hover)]:group-hover:scale-[1.04]" style={{ backgroundImage: `url('${t.cover}')` }} />
        <div className="absolute inset-0" style={{ background: HEADER_SCRIM }} />
        <div className="relative flex h-full flex-col p-5 md:p-6">
          <div className="font-mono text-[14px] font-semibold uppercase tracking-[0.26em] text-white md:text-[16px]" style={{ textShadow: TS_STRONG }}>{t.countdown}</div>
          <div className="mt-auto">
            <div className="font-serif text-[36px] leading-[0.96] tracking-tight text-white md:text-[48px]" style={{ textShadow: TS_STRONG }}>{t.name}</div>
            <div className="mt-2 font-mono text-[11.5px] uppercase tracking-[0.18em] text-white/85 md:text-[13px]" style={{ textShadow: TS_STRONG }}>{t.dates} · {t.stops} stops</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-white/90 md:text-[14.5px]" style={{ textShadow: TS_STRONG }}>
              <Cloud size={14} className="text-white/80" />
              <span>{t.weather}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex h-[72px] items-center gap-3 bg-[#0f0f15] px-5 md:h-[88px] md:px-6">
        {during ? (
          <>
            <Button variant="claret" className="flex-1 justify-center py-2.5 text-[15px] md:py-3 md:text-[16px]">Start guide <ArrowRight size={16} /></Button>
            <button className="rounded-full border border-white/20 bg-white/[0.07] px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-white/15 md:px-6 md:py-3">Plan</button>
          </>
        ) : (
          <>
            <Button variant="claret" className="flex-1 justify-center py-2.5 text-[15px] md:py-3 md:text-[16px]">Start planning <ArrowRight size={16} /></Button>
            <button className="rounded-full border border-white/20 bg-white/[0.07] px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-white/15 md:px-6 md:py-3">Guide</button>
          </>
        )}
      </div>
    </div>
  )
}

/** Tiles view — image on top + an extended BLURRED GLASS footer holding the
 *  name/dates (the look from the deck-expand "Your travels" cards). Lifts on
 *  desktop hover AND on mobile tap (tap toggles the lifted state). */
function TripTileGlass({ r }: { r: Row }) {
  const [lift, setLift] = useState(false)
  return (
    <div
      onClick={() => setLift((v) => !v)}
      className={`group cursor-pointer overflow-hidden rounded-card border border-white/15 bg-white/[0.06] backdrop-blur-xl transition-[transform,box-shadow] duration-300 ease-out motion-reduce:transition-none ${lift ? '-translate-y-1.5 shadow-[0_26px_60px_rgba(0,0,0,.55)]' : 'shadow-[0_12px_40px_rgba(0,0,0,.42)]'} [@media(hover:hover)]:hover:-translate-y-1.5 [@media(hover:hover)]:hover:shadow-[0_26px_60px_rgba(0,0,0,.55)]`}
    >
      <div className="relative h-[140px] overflow-hidden">
        <div className={`absolute inset-0 bg-cover bg-center transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-[1.04] ${lift ? 'scale-[1.04]' : ''}`} style={{ backgroundImage: `url('${r.cover}')` }} />
        {r.kind === 'upcoming' && (
          <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm" style={{ textShadow: TS }}>{r.when}</span>
        )}
      </div>
      <div className="px-4 py-3">
        <div className="font-serif text-[21px] text-white" style={{ textShadow: TS }}>{r.name}</div>
        <div className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-white/65">{r.dates}{r.stops ? ` · ${r.stops} stops` : ''}</div>
      </div>
    </div>
  )
}

/** Detailed view — a compact Windows-Explorer-style row. */
function TripRow({ r }: { r: Row }) {
  return (
    <div className="group flex items-center gap-3.5 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2.5 backdrop-blur-xl transition-colors hover:bg-white/[0.09]">
      <div className="h-12 w-16 shrink-0 rounded-lg bg-cover bg-center ring-1 ring-white/10" style={{ backgroundImage: `url('${r.cover}')` }} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-serif text-[17px] text-white" style={{ textShadow: TS }}>{r.name}</div>
        <div className="truncate font-mono text-[11px] uppercase tracking-wide text-white/60">{r.dates}</div>
      </div>
      <div className="hidden w-20 shrink-0 text-center font-mono text-[12px] text-white/65 sm:block">{r.stops ? `${r.stops} stops` : '—'}</div>
      <div className={`w-24 shrink-0 text-right font-mono text-[12px] ${r.kind === 'upcoming' ? 'text-sig-link' : 'text-white/55'}`}>{r.when}</div>
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

export default function PreviewHomeSearch() {
  const reduce = useReducedMotion()
  const { globeRef, globeActive, heroActive } = useInViewActive()
  const featured = UPCOMING[0]
  const clip = clipForWord(featured.name)
  const [view, setView] = useState<'tiles' | 'detailed'>('tiles')
  const [query, setQuery] = useState('')

  // The list below the hero: remaining upcoming (soonest first), then past.
  const rows: Row[] = useMemo(() => [
    ...UPCOMING.slice(1).map((t): Row => ({ name: t.name, cover: t.cover, dates: t.dates, stops: t.stops, when: t.countdown, kind: 'upcoming' })),
    ...PAST.map((p): Row => ({ name: p.name, cover: p.cover, dates: p.dates, when: 'Completed', kind: 'past' })),
  ], [])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows
  }, [rows, query])

  const toggleBtn = (active: boolean) =>
    `grid h-8 w-9 place-items-center rounded-full transition-colors ${active ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white/80'}`

  return (
    <div className="relative min-h-[100svh] bg-[#05060a] text-white">
      {/* Globe — original transition geometry. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[185vh] overflow-hidden bg-[#05060a]">
        <div className="absolute inset-x-0 top-[20vh] h-[170vh]">
          <FieldGlobe className="absolute inset-0" active={globeActive} staticSrc={globeStill} dprCap={1.0} frag={{ octaves: 3, blur: false }} />
        </div>
      </div>

      {/* Hero — featured trip centered over the footage (original 100svh + mask). */}
      <section className="relative z-10 h-[100svh] min-h-[640px] overflow-hidden">
        <div className="absolute inset-0" style={{ WebkitMaskImage: MASK, maskImage: MASK, filter: 'brightness(1.8)' }}>
          <HeroVideoStage clip={clip} playing={heroActive} className="absolute inset-0" />
        </div>
        <Nav />
        <motion.div
          initial={reduce ? false : { y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-0 top-0 z-20 flex h-full flex-col items-center px-5 pt-[13vh] md:pt-[15vh] text-center text-white"
        >
          <div className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.32em] text-white/85" style={{ textShadow: TS }}>Plan · Walk · Remember</div>
          <h1 className="mt-4 font-serif font-medium tracking-tight text-[40px] leading-[1.02] md:text-[64px]" style={{ textShadow: TS_STRONG }}>
            Welcome back, Edward.
          </h1>
          <div className="relative mt-8 w-full max-w-[440px] md:max-w-[620px]">
            <SoftBackdrop />
            <CockpitCard t={featured} />
          </div>
        </motion.div>
      </section>

      {/* Your travels — search + view toggle + the rest of the trips. */}
      <section className="relative z-10 -mt-[18vh]">
        <div className="mx-auto max-w-5xl px-5 md:px-8 pt-[2vh] pb-[40vh]">
          <div ref={globeRef} aria-hidden className="h-px w-full" />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-[clamp(22px,3.2vw,30px)] font-medium tracking-tight text-white" style={{ textShadow: TS }}>Your travels</h2>
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] p-0.5 backdrop-blur">
              <button aria-pressed={view === 'tiles'} aria-label="Tiles view" onClick={() => setView('tiles')} className={toggleBtn(view === 'tiles')}><LayoutGrid size={16} /></button>
              <button aria-pressed={view === 'detailed'} aria-label="Detailed view" onClick={() => setView('detailed')} className={toggleBtn(view === 'detailed')}><LayoutList size={16} /></button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-5">
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/45" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your trips…"
              className="w-full rounded-full border border-white/15 bg-white/[0.06] py-2.5 pl-10 pr-4 text-[14px] text-white placeholder-white/40 outline-none backdrop-blur transition-colors focus:border-white/30 focus:bg-white/[0.09]"
            />
          </div>

          {/* Content */}
          <div className="relative">
            <SoftBackdrop />
            {filtered.length === 0 ? (
              <p className="py-12 text-center text-[14px] text-white/55">No trips match “{query}”.</p>
            ) : view === 'tiles' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((r) => <TripTileGlass key={r.name} r={r} />)}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3.5 px-3 pb-1 text-[10.5px] uppercase tracking-[0.16em] text-white/40">
                  <span className="w-16 shrink-0" />
                  <span className="flex-1">Trip</span>
                  <span className="hidden w-20 shrink-0 text-center sm:block">Stops</span>
                  <span className="w-24 shrink-0 text-right">When</span>
                </div>
                {filtered.map((r) => <TripRow key={r.name} r={r} />)}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
