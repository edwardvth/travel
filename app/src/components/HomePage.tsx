import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { CinematicHero } from './CinematicHero'
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
 *  the "+ New trip" create hero so they read as the same surface. */
const HERO_SHARED = {
  headline: 'Where to next?',
  subcopy: "Name a city and we'll start the itinerary, day by day.",
  brightness: 1.8,
  videoMask: VIDEO_MASK,
  headlineClassName: 'mt-4 font-serif font-medium tracking-tight text-[44px] leading-[1.02] md:text-[70px]',
  copyPaddingClassName: 'pt-[16vh] md:pt-[18vh]',
  // Mobile lifts the pill 30px (and its caption below) without moving the copy above.
  pillMarginClassName: 'mt-[calc(8vh_+_2.25rem_-_30px)] md:mt-10',
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
  firstName: string             // greeting on the trip landing ("Welcome back, …")
  units: Units
  userId?: string
  /** True until trips have loaded. Until then we render only the dark base, so the
   *  page never briefly commits to the wrong landing before `focus` resolves. */
  loading?: boolean
  /** Theme + account controls from Dashboard. */
  accountControls: ReactNode
  tripActions?: (t: Trip) => ReactNode
}

/**
 * The logged-in home. With an upcoming/occurring trip (`focus`) it LANDS on that
 * trip — the `UpcomingJourney` screen over its video, then "Your travels". Tapping
 * "+ New trip" rolls the full cinematic "Where to next?" hero (the `CommandPill`)
 * down from the top INTO the page, so it becomes the stacked layout you can scroll
 * down past to reach the trip; the ✕ rolls it back up. With no trip, "Where to
 * next?" is the landing as before. Trip creation flows through the pill →
 * useCreateTrip → navigate, with the seed-card materialization flight.
 */
export function HomePage({ trips, focus, firstName, units, userId, loading = false, accountControls, tripActions }: HomePageProps) {
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
  // With a trip, "+ New trip" rolls the create hero down over the top of the page.
  const [creating, setCreating] = useState(false)
  const pillWrapRef = useRef<HTMLDivElement>(null)
  const pillHandleRef = useRef<CommandPillHandle>(null)

  // The create hero sits ABOVE the journey only in this state; that's the one case
  // where the globe must drop a viewport so it stays behind journey + travels.
  const heroAboveJourney = !!focus && creating

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

  // The pill slot — used by whichever hero is mounted (landing OR create; never both).
  const renderPill = ({ onWordStart }: { onWordStart: (w: string) => void }) => (
    <div ref={pillWrapRef} className="relative w-full">
      <div ref={pillSentinelRef} aria-hidden className="absolute inset-x-0 top-0 h-px" />
      <CommandPill
        ref={pillHandleRef}
        onWordStart={onWordStart}
        onCommit={handleCommit}
        pending={create.isPending}
        error={createErr}
      />
    </div>
  )

  // State-C fixed "New trip" → scroll back to the landing pill.
  const focusHeroPill = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.setTimeout(() => pillHandleRef.current?.focus({ preventScroll: true }), 500)
  }

  // "+ New trip" on the trip landing: be at the top so the hero rolls in on screen,
  // then focus the pill once it has settled.
  const openCreate = () => {
    window.scrollTo({ top: 0 })
    setCreating(true)
  }
  useEffect(() => {
    if (!creating) return
    const t = window.setTimeout(() => pillHandleRef.current?.focus({ preventScroll: true }), 560)
    return () => window.clearTimeout(t)
  }, [creating])

  // Off-Home entry: /?new=1 opens the create surface — rolls the hero down with a
  // trip, focuses the landing pill otherwise. Waits for `loading` so we know which.
  const [wantNew, setWantNew] = useState(() => new URLSearchParams(location.search).get('new') === '1')
  useEffect(() => {
    if (!wantNew || loading) return
    setWantNew(false)
    nav('/', { replace: true })
    if (focus) {
      openCreate()
    } else {
      window.scrollTo({ top: 0 })
      requestAnimationFrame(() => pillHandleRef.current?.focus({ preventScroll: true }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantNew, loading, focus])

  return (
    <div className="relative min-h-[100svh] bg-[#05060a] text-white">
      {/* Night-Earth globe — behind the lead and "Your travels". It sits at top-0,
          except when the create hero is rolled down ABOVE the journey, where it
          drops a viewport so its lit Earth limb stays behind the travels. */}
      {!loading && (
        <div
          className={`pointer-events-none absolute inset-x-0 z-0 h-[185vh] overflow-hidden ${heroAboveJourney ? 'top-[100svh]' : 'top-0'}`}
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

      {/* While trips load we render only the dark base, so the wrong landing never
          flashes before `focus` resolves. */}
      {!loading && (
        <>
          {/* "Where to next?" hero — the landing with no trip; with a trip it rolls
              down from the top (in flow) when "+ New trip" is tapped, pushing the
              journey below so you can scroll on to it. */}
          {!focus ? (
            <CinematicHero
              {...HERO_SHARED}
              className="relative z-10 h-[100svh] min-h-[620px] overflow-hidden"
              videoPlaying={heroActive}
              renderPill={renderPill}
              headerRight={
                <div className="flex items-center gap-2.5 text-white [&_button]:text-white">
                  {accountControls}
                </div>
              }
            />
          ) : (
            <AnimatePresence initial={false}>
              {creating && (
                <motion.div
                  key="create-hero"
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="relative z-20 overflow-hidden"
                >
                  <CinematicHero
                    {...HERO_SHARED}
                    className="relative h-[100svh] min-h-[620px] overflow-hidden"
                    videoPlaying={heroActive}
                    renderPill={renderPill}
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
          )}

          {/* Your next journey — the trip landing (former State B), with its own
              brand header + "Welcome back". Sits below the create hero when it's
              rolled down. */}
          {focus && (
            <UpcomingJourney
              trip={focus}
              firstName={firstName}
              units={units}
              onOpen={openTrip}
              onOpenArrange={openArrange}
              onOpenGuide={openGuide}
              stacked={creating}
              headerRight={
                <>
                  <Button variant="claret" onClick={openCreate} className={POP}>
                    <Plus size={16} strokeWidth={2.5} />New travel
                  </Button>
                  {accountControls}
                </>
              }
              playing={!globeActive}
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

      {/* Fixed "New trip" that fades in once the "Where to next?" pill scrolls out
          of view — both on the no-trip landing AND while the create hero is rolled
          down — and scrolls back up to the pill (focusing it). */}
      {(!focus || creating) && (
        <div
          aria-hidden={pillInView}
          className={`fixed right-4 top-4 z-40 transition-opacity duration-300 ${pillInView ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        >
          <Button variant="claret" onClick={focusHeroPill} className={POP}><Plus size={16} strokeWidth={2.5} />New travel</Button>
        </div>
      )}
    </div>
  )
}

export default HomePage
