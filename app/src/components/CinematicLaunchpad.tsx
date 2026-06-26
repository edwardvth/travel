import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { CinematicHero } from './CinematicHero'
import { FieldGlobe } from '../home/FieldGlobe'
import { useInViewActive } from '../home/useInViewActive'
import { TripGrid } from './TripGrid'
import { Button } from './ui/Button'
import globeStill from '../assets/globe-still.webp'
import type { Trip } from '../types'

const VIDEO_MASK = 'linear-gradient(to bottom, #000 70%, transparent 96%)'

/**
 * State C launchpad (spec §3). Cinematic hero (brightness 1.8) whose clip
 * dissolves into a tall night-Earth FieldGlobe; "Your travels" overlaid on glass
 * cards. The globe and video never animate together (useInViewActive).
 * Layer order (front→back): header → hero content → trip cards → masked video →
 * FieldGlobe → page black.
 */
export function CinematicLaunchpad({
  pastTrips, onCreate, onOpenTrip, tripActions, headerRight,
}: {
  pastTrips: Trip[]
  onCreate: () => void
  onOpenTrip: (id: string) => void
  tripActions?: (t: Trip) => ReactNode
  /** Right-hand header content. Default = the "+ New trip" button. */
  headerRight?: ReactNode
}) {
  const { globeRef, globeActive, heroActive } = useInViewActive()

  return (
    <div className="relative min-h-[100svh] bg-[#05060a] text-white">
      {/* FieldGlobe — tall background; dark sky behind the clip, arcs low behind tiles.
          The dark bg here guarantees the area is never white even if WebGL fails to
          start (the canvas + static image layer over it). */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[185vh] overflow-hidden bg-[#05060a]"
      >
        {/* Inner positioning box sets the globe's framing. FieldGlobe's root forces
            inset:0 inline, so it fills THIS box rather than its own className. */}
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

      {/* Cinematic hero — masked to dissolve into the globe; pauses when the globe is active. */}
      <CinematicHero
        className="relative z-10 h-[100svh] min-h-[620px] overflow-hidden"
        headline="Where to next?"
        subcopy="Name a city and we'll start the itinerary, day by day."
        brightness={1.8}
        videoMask={VIDEO_MASK}
        videoPlaying={heroActive}
        onSubmit={onCreate}
        headerRight={headerRight ?? <Button variant="claret" onClick={onCreate}><Plus size={16} strokeWidth={2.5} />New trip</Button>}
        // Overrides to match the approved preview metrics (Task 1 added these props;
        // defaults are Landing's, so we override here for the launchpad's look).
        headlineClassName="mt-4 font-serif font-medium tracking-tight text-[44px] leading-[1.02] md:text-[70px]"
        copyPaddingClassName="pt-[16vh] md:pt-[18vh]"
        pillMarginClassName="mt-[calc(8vh_+_2.25rem)] md:mt-10"
      />

      {/* Your travels — pulled up over the globe (glass cards let the Earth show beneath). */}
      <section className="relative z-10 -mt-[18vh]">
        <div className="mx-auto max-w-6xl px-5 md:px-8 pt-[2vh] pb-[40vh]">
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
          {pastTrips.length > 0 ? (
            <TripGrid trips={pastTrips} onOpen={onOpenTrip} tripActions={tripActions} glass />
          ) : (
            <p className="text-[14px] text-white/70">Your finished trips will live here as keepsakes.</p>
          )}
        </div>
      </section>
    </div>
  )
}

export default CinematicLaunchpad
