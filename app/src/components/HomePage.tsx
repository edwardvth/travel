import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
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

const VIDEO_MASK = 'linear-gradient(to bottom, #000 70%, transparent 96%)'
const GLOBE_MASK = 'linear-gradient(to bottom, #000 84%, transparent 100%)'
// Travels-section starfield fades in below the globe's content (globe→stars split).
const STARS_MASK = 'linear-gradient(to bottom, transparent 0%, #000 14%)'

const REASONS: Record<string, string> = {
  slug_taken: "Couldn't find a free trip address — try a slightly different title.",
  no_credits: "You're out of trip credits. Credit packs are coming soon.",
  invalid_name: 'Please choose a different name.',
  no_profile: 'No account profile found — sign out and back in.',
}

export interface HomePageProps {
  trips: Trip[]
  focus: Trip | null            // selectFocusTrip result; null → State C
  units: Units
  userId?: string
  /** True until trips have loaded. Until then we render ONLY the hero, so the
   *  page never briefly commits to State C (which pulls "Your travels" up into
   *  view) before the real focus trip resolves and flips it to State B. */
  loading?: boolean
  /** Theme + account controls from Dashboard (rendered to the right of the home-owned "New trip" button). */
  accountControls: ReactNode
  tripActions?: (t: Trip) => ReactNode
}

/**
 * The unified, stacked logged-in home (spec §3). One page for ALL states:
 * cinematic hero (with the live CommandPill) → an UpcomingJourney section when a
 * focus trip exists → the "Your travels" list over the night-Earth globe. Trip
 * creation flows through the pill → useCreateTrip → navigate, with the seed-card
 * materialization flight. `useInViewActive` enforces the one-animated-background
 * guarantee (video plays on the hero, globe takes over once the travels sentinel
 * scrolls in).
 */
export function HomePage({ trips, focus, units, userId, loading = false, accountControls, tripActions }: HomePageProps) {
  const nav = useNavigate()
  const location = useLocation()
  const openTrip = (id: string) => nav('/trip/' + encodeURIComponent(id))
  const { globeRef, globeActive, heroActive } = useInViewActive()
  const { ref: pillSentinelRef, inView: pillInView } = useHeroPillInView<HTMLDivElement>()

  const create = useCreateTrip()
  const backfillCover = useBackfillCoverImage()
  const backfillGeo = useBackfillDestinationGeo()
  const [createErr, setCreateErr] = useState<string | null>(null)
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

  const focusHeroPill = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    requestAnimationFrame(() => pillHandleRef.current?.focus())
  }

  // Off-Home entry: /?new=1 scrolls to top and auto-focuses the pill (spec §6).
  useEffect(() => {
    if (new URLSearchParams(location.search).get('new') === '1') {
      window.scrollTo({ top: 0 })
      requestAnimationFrame(() => pillHandleRef.current?.focus())
      nav('/', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative min-h-[100svh] bg-[#05060a] text-white">
      {/* FieldGlobe — the page-top background, behind the hero (static high-quality frame). */}
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

      {/* Cinematic hero — masked to dissolve into the globe; pauses when the globe is active.
          The CommandPill is injected via renderPill so its typewriter still drives the video. */}
      <CinematicHero
        className="relative z-10 h-[100svh] min-h-[620px] overflow-hidden"
        headline="Where to next?"
        subcopy="Name a city and we'll start the itinerary, day by day."
        brightness={1.8}
        videoMask={VIDEO_MASK}
        videoPlaying={heroActive}
        headlineClassName="mt-4 font-serif font-medium tracking-tight text-[44px] leading-[1.02] md:text-[70px]"
        copyPaddingClassName="pt-[16vh] md:pt-[18vh]"
        pillMarginClassName="mt-[calc(8vh_+_2.25rem)] md:mt-10"
        renderPill={({ onWordStart }) => (
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
        )}
        headerRight={
          <div className="flex items-center gap-2.5 text-white [&_button]:text-white">
            {accountControls}
          </div>
        }
      />

      {/* Below-hero content waits for trips to load — otherwise the page briefly
          renders State C (which pulls "Your travels" up into the first viewport)
          before flipping to State B, which reads as a flash. While loading we show
          only the hero; the rest fades in once `loading` clears. */}
      {!loading && (
        <>
          {/* Your next journey — only when a focus trip exists. */}
          {focus && <UpcomingJourney trip={focus} units={units} onOpen={openTrip} playing={!globeActive} />}

          {/* Your travels — pulled up over the globe in State C (no journey section); a normal
              top margin when a journey precedes it (so the sections don't overlap). */}
          <section className={`relative z-10 ${focus ? 'pt-[6vh]' : '-mt-[18vh]'}`}>
            {/* Starfield — background of the travels section; fades in below the globe. */}
            <StarsBackground
              className="pointer-events-none absolute inset-0 -z-10 !bg-transparent"
              speed={70}
              style={{ WebkitMaskImage: STARS_MASK, maskImage: STARS_MASK }}
            />
            <div className="mx-auto max-w-6xl px-5 md:px-8 pt-[2vh] pb-[22vh]">
              {/* Globe-activation sentinel — once this scrolls into the top ~45% of the
                  viewport (useInViewActive's -55% bottom margin), the globe goes live and
                  the hero video pauses. At the top (on the hero) the globe stays paused. */}
              <div ref={globeRef} aria-hidden className="h-px w-full" />
              <h2
                className="mb-5 text-left font-serif text-[clamp(22px,3.2vw,30px)] font-medium tracking-tight text-white"
                style={{ textShadow: '0 2px 24px rgba(0,0,0,.55)' }}
              >
                Your travels
              </h2>
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

      {/* Fixed "New trip" button — fades in once the hero pill scrolls out of view (spec §5.1).
          Smooth-scrolls back to the hero and focuses the pill when clicked. */}
      <div
        aria-hidden={pillInView}
        className={`fixed right-4 top-4 z-40 transition-opacity duration-300 ${pillInView ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      >
        <Button variant="claret" onClick={focusHeroPill}><Plus size={16} strokeWidth={2.5} />New trip</Button>
      </div>

    </div>
  )
}

export default HomePage
