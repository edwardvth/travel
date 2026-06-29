import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { CinematicHero } from './CinematicHero'
import { Mark } from './Logo'
import { FieldGlobe } from '../home/FieldGlobe'
import { useInViewActive } from '../home/useInViewActive'
import { TravelsList } from './TravelsList'
import { StarsBackground } from './ui/stars'
import { HomeCredits } from './home-style'
import { Button } from './ui/Button'
import { CommandPill, type CommandPillHandle, type CommandPillCommit } from './home/CommandPill'
import { UpcomingJourney } from './home/UpcomingJourney'
import { materialize } from './home/materialize-controller'
import { useHeroPillInView } from './home/useHeroPillInView'
import { peekCover } from '../lib/cover-prefetch'
import { formatRangeChip } from '../lib/range-calendar'
import { useCreateTrip, useBackfillCoverImage } from '../data/useTrips'
import { useBackfillDestinationGeo } from '../data/useBackfillDestinationGeo'
import globeStill from '../assets/globe-still.webp'
import type { Trip } from '../types'
import type { Units } from '../data/useAccountSettings'

const VIDEO_MASK = 'linear-gradient(to bottom, #000 90%, transparent 100%)'
const GLOBE_MASK = 'linear-gradient(to bottom, #000 84%, transparent 100%)'
// Travels-section starfield fades in below the globe's content (globe→stars split).
const STARS_MASK = 'linear-gradient(to bottom, transparent 0%, #000 14%)'

/** Tile-style hover "pop" — lift + deeper shadow on hover-capable devices,
 *  disabled under reduced motion. Matches `TravelTile` / `UpcomingJourney`. */
const POP =
  '[@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-[0_16px_38px_rgba(0,0,0,.45)] motion-reduce:hover:transform-none'

/** Common "Where to next?" hero copy/metrics — shared by the State-C landing and
 *  the "+ New trip" create overlay so they read as the same surface. */
const HERO_SHARED = {
  headline: 'Where to next?',
  subcopy: "Name a city and we'll start the itinerary, day by day.",
  brightness: 1.8,
  videoMask: VIDEO_MASK,
  headlineClassName: 'mt-4 font-serif font-medium tracking-tight text-[44px] leading-[1.02] md:text-[70px]',
} as const

const REASONS: Record<string, string> = {
  slug_taken: "Couldn't find a free trip address — try a slightly different title.",
  no_credits: "You're out of trip credits. Credit packs are coming soon.",
  invalid_name: 'Please choose a different name.',
  no_profile: 'No account profile found — sign out and back in.',
}

export interface HomePageProps {
  trips: Trip[]
  focus: Trip | null            // selectFocusTrip result; null → "Where to next?" landing
  units: Units
  userId?: string
  /** True until trips have loaded. Until then we render nothing but the dark base,
   *  so the page never briefly commits to the wrong landing (e.g. flashing "Where
   *  to next?" before the focus trip resolves). */
  loading?: boolean
  /** Theme + account controls from Dashboard. */
  accountControls: ReactNode
  tripActions?: (t: Trip) => ReactNode
}

/**
 * The logged-in home. With an upcoming/occurring trip (`focus`) it LANDS on that
 * trip — the `UpcomingJourney` screen over its destination video, then "Your
 * travels". "Where to next?" is no longer the landing in that case: tapping
 * "+ New trip" drops the full cinematic create hero (the `CommandPill`) down from
 * the top as a dismissible overlay. With no trip, "Where to next?" is the landing
 * as before. Trip creation flows through the pill → useCreateTrip → navigate, with
 * the seed-card materialization flight; `useInViewActive` keeps one animated
 * background (lead video at top, globe once the travels sentinel scrolls in).
 */
export function HomePage({ trips, focus, units, userId, loading = false, accountControls, tripActions }: HomePageProps) {
  const nav = useNavigate()
  const location = useLocation()
  const openTrip = (id: string) => nav('/trip/' + encodeURIComponent(id))
  const openArrange = (id: string) => nav('/trip/' + encodeURIComponent(id) + '/trip')
  const openGuide = (id: string) => nav('/trip/' + encodeURIComponent(id) + '/guide')
  const { globeRef, globeActive, heroActive } = useInViewActive()
  const { ref: pillSentinelRef, inView: pillInView } = useHeroPillInView<HTMLDivElement>()

  const create = useCreateTrip()
  const backfillCover = useBackfillCoverImage()
  const backfillGeo = useBackfillDestinationGeo()
  const [createErr, setCreateErr] = useState<string | null>(null)
  // State-B "+ New trip" → the create hero drops in over the trip landing.
  const [creating, setCreating] = useState(false)
  const pillWrapRef = useRef<HTMLDivElement>(null)
  const pillHandleRef = useRef<CommandPillHandle>(null)

  const handleCommit = async (c: CommandPillCommit) => {
    setCreateErr(null)
    const city = c.destination.split(',')[0]
    const rangeLabel = c.datesTBD ? 'Dates TBD' : formatRangeChip({ start: c.start!, end: c.end! })
    materialize.begin({
      destination: c.destination,
      rangeLabel,
      coverUrl: peekCover(c.destination) ?? null,
      sourceRect: pillWrapRef.current?.getBoundingClientRect() ?? null,
    })
    try {
      const id = await create.mutateAsync({
        slug: '', title: city, subtitle: '',
        start: c.start ?? '', end: c.end ?? '', destination: c.destination, notes: '',
      })
      void backfillCover({ id, title: city, config: { title: city, destination: c.destination }, data: { days: [], completed: [] } })
      void backfillGeo({ id, destination: c.destination })
      nav(`/trip/${encodeURIComponent(id)}`)
    } catch (e) {
      materialize.fail()
      setCreateErr(REASONS[(e as Error).message] ?? "Couldn't create this trip. Try again.")
    }
  }

  // The pill slot — used by whichever hero is mounted (landing OR overlay; never
  // both). `noNudge` for the overlay, where a window scroll can't move a fixed pill.
  const renderPillSlot = (noNudge: boolean) => ({ onWordStart }: { onWordStart: (w: string) => void }) => (
    <div ref={pillWrapRef} className="relative w-full">
      <div ref={pillSentinelRef} aria-hidden className="absolute inset-x-0 top-0 h-px" />
      <CommandPill
        ref={pillHandleRef}
        onWordStart={onWordStart}
        onCommit={handleCommit}
        pending={create.isPending}
        error={createErr}
        noNudge={noNudge}
      />
    </div>
  )

  // State-C fixed "New trip" → scroll back to the landing pill.
  const focusHeroPill = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.setTimeout(() => pillHandleRef.current?.focus({ preventScroll: true }), 500)
  }

  // Focus the create-overlay pill once it has dropped in.
  useEffect(() => {
    if (!creating) return
    const t = window.setTimeout(() => pillHandleRef.current?.focus({ preventScroll: true }), 480)
    return () => window.clearTimeout(t)
  }, [creating])

  // Off-Home entry: /?new=1 opens the create surface — the overlay when a trip is
  // the landing, the landing pill otherwise. Waits for `loading` so we know which.
  const [wantNew, setWantNew] = useState(() => new URLSearchParams(location.search).get('new') === '1')
  useEffect(() => {
    if (!wantNew || loading) return
    setWantNew(false)
    nav('/', { replace: true })
    if (focus) {
      setCreating(true)
    } else {
      window.scrollTo({ top: 0 })
      requestAnimationFrame(() => pillHandleRef.current?.focus({ preventScroll: true }))
    }
  }, [wantNew, loading, focus, nav])

  return (
    <div className="relative min-h-[100svh] bg-[#05060a] text-white">
      {/* Night-Earth globe — top-0, behind the lead (trip OR hero) and the travels
          list. The lead always occupies the first ~100svh; the globe's Earth sits
          at top-20vh so its lit lower limb shows behind "Your travels" (-18vh up). */}
      {!loading && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[185vh] overflow-hidden"
          style={{ WebkitMaskImage: GLOBE_MASK, maskImage: GLOBE_MASK }}
        >
          <div className="absolute inset-x-0 top-[20vh] h-[170vh]">
            <FieldGlobe
              className="absolute inset-0"
              active={globeActive}
              staticSrc={globeStill}
              staticFrame
              dprCap={1.5}
              frag={{ octaves: 6, blur: true }}
            />
          </div>
        </div>
      )}

      {/* While trips load we render only the dark base — no lead — so we never flash
          the wrong landing before `focus` resolves. */}
      {!loading && (
        <>
          {/* LEAD — the trip screen when there's an upcoming/occurring trip; the
              "Where to next?" hero otherwise. */}
          {focus ? (
            <>
              {/* Trip-landing top bar (the hero owns its own nav, so the trip
                  landing needs one: logo + account controls + "New trip"). */}
              <nav className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-6 md:px-10 py-5 md:py-6 text-white">
                <span className="inline-flex items-center gap-2 font-sans font-extrabold tracking-tight">
                  <span className="text-sig-link"><Mark size={30} /></span>
                  <span className="font-serif text-[20px] md:text-[23px]">Voyager</span>
                </span>
                <div className="flex items-center gap-2.5 text-white [&_button]:text-white">
                  {accountControls}
                  <Button variant="claret" onClick={() => setCreating(true)} className={POP}>
                    <Plus size={16} strokeWidth={2.5} />New trip
                  </Button>
                </div>
              </nav>
              <UpcomingJourney
                trip={focus}
                units={units}
                onOpen={openTrip}
                onOpenArrange={openArrange}
                onOpenGuide={openGuide}
                playing={!globeActive && !creating}
              />
            </>
          ) : (
            <CinematicHero
              {...HERO_SHARED}
              className="relative z-10 h-[100svh] min-h-[620px] overflow-hidden"
              videoPlaying={heroActive}
              copyPaddingClassName="pt-[16vh] md:pt-[18vh]"
              // Mobile lifts the pill 30px (and its caption below, which follows in
              // flow) without moving the headline/subcopy above. Desktop unchanged.
              pillMarginClassName="mt-[calc(8vh_+_2.25rem_-_30px)] md:mt-10"
              renderPill={renderPillSlot(false)}
              headerRight={
                <div className="flex items-center gap-2.5 text-white [&_button]:text-white">
                  {accountControls}
                </div>
              }
            />
          )}

          {/* Your travels — pulled -18vh up over the globe's lit limb. */}
          <section className="relative z-10 -mt-[18vh]">
            <StarsBackground
              className="pointer-events-none absolute inset-0 -z-10 !bg-transparent"
              speed={70}
              style={{ WebkitMaskImage: STARS_MASK, maskImage: STARS_MASK }}
            />
            <div className="mx-auto max-w-6xl px-5 md:px-8 pt-[2vh] pb-[22vh]">
              {/* Globe-activation sentinel — once this scrolls into the top ~45% of
                  the viewport the globe goes live and the lead video pauses. */}
              <div ref={globeRef} aria-hidden className="h-px w-full" />
              <TravelsList
                trips={trips}
                featuredId={focus?.id ?? ''}
                onOpen={openTrip}
                userId={userId}
                tripActions={tripActions}
              />
            </div>
          </section>

          <HomeCredits />
        </>
      )}

      {/* State-C only: fixed "New trip" that fades in once the landing pill scrolls
          out of view, scrolling back to it. (With a trip, the trip-nav button +
          the create overlay handle this instead.) */}
      {!focus && (
        <div
          aria-hidden={pillInView}
          className={`fixed right-4 top-4 z-40 transition-opacity duration-300 ${pillInView ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        >
          <Button variant="claret" onClick={focusHeroPill} className={POP}><Plus size={16} strokeWidth={2.5} />New trip</Button>
        </div>
      )}

      {/* CREATE OVERLAY — the full "Where to next?" hero drops in from the top when
          "+ New trip" is tapped on the trip landing. Fixed + full-screen; the ✕
          slides it back up to reveal the trip underneath. The pill sits a touch
          higher here (keyboard-friendly) and skips the scroll nudge (fixed). */}
      <AnimatePresence>
        {creating && (
          <motion.div
            key="create-overlay"
            className="fixed inset-0 z-50 overflow-hidden bg-[#05060a]"
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 32 }}
          >
            <CinematicHero
              {...HERO_SHARED}
              className="relative h-[100svh] min-h-[620px] overflow-hidden"
              videoPlaying={creating}
              copyPaddingClassName="pt-[9vh] md:pt-[16vh]"
              pillMarginClassName="mt-[calc(4vh_+_1.25rem)] md:mt-10"
              renderPill={renderPillSlot(true)}
              headerRight={
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  aria-label="Close"
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <X size={18} />
                </button>
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default HomePage
