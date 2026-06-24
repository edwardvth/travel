import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Stop } from '../../types'
import { ListenButton } from './ListenButton'
import { StoryTabs, type StoryTab } from './StoryTabs'
import { Check, Map as MapIcon, Image as ImageIcon, Plus, Minus } from 'lucide-react'
import { StopMinimap, type StopMinimapHandle } from './StopMinimap'
import { stopCoords, type LatLng } from '../walk'

/** "480 m" / "1.2 km" from a distance in metres; null when unknown. */
function formatDistance(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m)) return null
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`
}

/** Striped-gradient placeholder when a stop has no hero photo (per the reference). */
function HeroPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        background:
          'repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 1px,transparent 1px 12px),linear-gradient(160deg,#2a201d,#15110f)',
      }}
    />
  )
}

/**
 * The image-forward current-stop card — the primary "traveling" surface, built
 * to the Premium Modern reference. A hero photo (or striped placeholder) carries
 * a live claret chip ("NOW · {dist} · {eta} · {heading}" with a `vyPulse` dot),
 * then a Fraunces place name, a subtitle, the ListenButton, the Story/
 * Interesting Facts/Experience tabs, and the Directions (claret) + ✓ complete
 * actions.
 *
 * LOCKED: there is no embedded map here — Directions hands off to the device's
 * maps app (the parent wires `onDirections`). Pure presentation: props in,
 * callbacks out.
 */
export function CurrentStopCard({
  stop,
  heroUrl,
  distanceM,
  etaMin,
  headingLabel,
  story,
  notice,
  experience,
  facts = [],
  voiceId,
  onDirections,
  onComplete,
  completed = false,
  canComplete = true,
  stopNumber,
  activeTab,
  onTabChange,
  enableMinimap = false,
  userPos = null,
  onMinimapInteracting,
}: {
  stop: Stop
  heroUrl?: string | null
  distanceM?: number | null
  etaMin?: number | null
  headingLabel?: string | null
  /** 1-based position of this stop in the day, shown as a badge on the hero. */
  stopNumber?: number
  story: string
  notice: string
  experience: string
  /** Structured interesting facts — rendered as a list in the Facts tab. */
  facts?: string[]
  voiceId: string
  onDirections: () => void
  onComplete: () => void
  /** When true this (focused) stop is already done — the ✓ becomes un-complete. */
  completed?: boolean
  /** Edit-gate: view-only users can browse/Listen/Directions but not (un)complete. */
  canComplete?: boolean
  activeTab: StoryTab
  onTabChange: (tab: StoryTab) => void
  /** Phase-1 minimap: when true (the focused live card only), show the
   *  orientation-minimap toggle in the hero. Off for deck peeks / the throw ghost. */
  enableMinimap?: boolean
  /** Live user position (from Guide's geolocation) for the minimap; null if unknown. */
  userPos?: LatLng | null
  /** Called while the user is touching the minimap (pan/pinch) so the parent can
   *  lock the swipe deck. True on first pointer down, false when the last lifts. */
  onMinimapInteracting?: (active: boolean) => void
}) {
  const reduce = useReducedMotion() ?? false
  const [mode, setMode] = useState<'photo' | 'map'>('photo')
  const dest = stopCoords(stop)
  const hasMinimap = enableMinimap && dest != null
  const showingMap = hasMinimap && mode === 'map'

  // Measure the hero width so map mode can expand the hero to a 1:1 square
  // (height = current width) — animated. Photo mode stays the 160px band.
  const heroRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<StopMinimapHandle>(null)
  const [heroW, setHeroW] = useState(0)
  // True while the user is touching the minimap — drives both the deck lock
  // (via onMinimapInteracting) and a subtle "map is active" ring.
  const [interacting, setInteracting] = useState(false)
  const handleInteracting = (active: boolean) => {
    setInteracting(active)
    onMinimapInteracting?.(active)
  }
  useEffect(() => {
    const el = heroRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    setHeroW(el.clientWidth)
    const ro = new ResizeObserver((entries) => setHeroW(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const heroHeight = showingMap && heroW ? heroW : 160

  const dist = formatDistance(distanceM)
  const eta = etaMin != null && Number.isFinite(etaMin) ? `${Math.round(etaMin)} MIN` : null
  const heading = headingLabel || null

  // The chip leads with the stop's standing — "VISITED" once done, otherwise the
  // live "NOW" — then whatever telemetry is known (dist · eta · heading).
  const lead = completed ? 'VISITED' : 'NOW'
  const chipParts = [lead, dist, eta, heading].filter(Boolean) as string[]

  // Subtitle: type (heading lives in the chip). Keep it calm; fall back gracefully.
  const subtitleParts = [stop.type].filter(Boolean) as string[]

  const listenText = story || notice || experience || stop.name

  return (
    <div className="rounded-[18px] overflow-hidden bg-raised border border-hair shadow-[0_1px_2px_rgba(0,0,0,.4),0_26px_60px_-28px_rgba(0,0,0,.9)]">
      {/* Hero — animates to a 1:1 square in map mode (keeps its width). A subtle
          inset ring (clipped hero → inset) signals the map owns the gesture. */}
      <motion.div
        ref={heroRef}
        className={
          'relative w-full overflow-hidden bg-raised transition-shadow duration-200 ' +
          (interacting && showingMap ? 'ring-2 ring-inset ring-white/45' : '')
        }
        // Don't animate height on mount — the card remounts on every swipe, and
        // the hero's children are all absolute (natural height 0), so a fresh
        // mount would animate 0→160 and visibly "drop" the title to reveal the
        // photo. `initial={false}` paints at the correct height immediately;
        // height still animates on the photo↔map toggle (the square expand).
        initial={false}
        animate={{ height: heroHeight }}
        transition={{ duration: reduce ? 0 : 0.42, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Photo layer (always mounted; fades under the map) */}
        <motion.div
          className="absolute inset-0 z-0"
          animate={{ opacity: showingMap ? 0 : 1 }}
          transition={{ duration: reduce ? 0 : 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          {heroUrl ? (
            <img src={heroUrl} alt={stop.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <HeroPlaceholder />
          )}
        </motion.div>

        {/* Map layer — mounted only in map mode (Leaflet only lives while shown) */}
        {showingMap && dest && (
          <motion.div
            className="absolute inset-0 z-0"
            initial={{ opacity: reduce ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <StopMinimap
              ref={minimapRef}
              destination={dest}
              user={userPos ?? null}
              stopName={stop.name}
              onInteracting={handleInteracting}
            />
          </motion.div>
        )}

        {/* Gradient + badge + chip (above both layers) */}
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          aria-hidden="true"
          style={{ background: 'linear-gradient(180deg,rgba(0,0,0,.28) 0%,transparent 30%,transparent 40%,rgba(0,0,0,.55))' }}
        />
        {stopNumber != null && (
          <span
            className="absolute left-[13px] top-[11px] z-10 grid place-items-center min-w-[26px] h-[26px] px-1.5 rounded-full bg-black/45 backdrop-blur-[4px] border border-white/25 font-mono text-[12px] font-semibold text-white"
            aria-label={`Stop ${stopNumber}`}
          >
            {stopNumber}
          </span>
        )}
        <div className="absolute left-[13px] bottom-[11px] z-10 inline-flex items-center gap-[7px] font-mono text-[10px] tracking-[0.07em] text-white bg-sig-btn/85 px-2.5 py-[5px] rounded-full backdrop-blur-[4px]">
          <span
            className="w-[6px] h-[6px] rounded-full bg-white"
            style={completed ? undefined : { animation: 'vyPulse 1.4s ease-in-out infinite' }}
            aria-hidden="true"
          />
          {chipParts.join(' · ')}
        </div>

        {/* Zoom +/- (map mode only) — bottom-right, stacked above the toggle */}
        {showingMap && (
          <div className="absolute right-[11px] bottom-[64px] z-10 flex flex-col rounded-full bg-black/45 backdrop-blur-[4px] border border-white/25 overflow-hidden">
            <button
              type="button"
              onClick={() => minimapRef.current?.zoomIn()}
              aria-label="Zoom in"
              className="grid place-items-center w-11 h-9 text-white cursor-pointer transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
            >
              <Plus size={16} aria-hidden="true" />
            </button>
            <span className="h-px bg-white/25" aria-hidden="true" />
            <button
              type="button"
              onClick={() => minimapRef.current?.zoomOut()}
              aria-label="Zoom out"
              className="grid place-items-center w-11 h-9 text-white cursor-pointer transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
            >
              <Minus size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Minimap toggle (Phase 1) — bottom-right, opposite the chip */}
        {hasMinimap && (
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'photo' ? 'map' : 'photo'))}
            aria-pressed={mode === 'map'}
            aria-label={mode === 'map' ? 'Show photo' : 'Show minimap'}
            className="absolute right-[11px] bottom-[11px] z-10 grid place-items-center w-11 h-11 rounded-full bg-black/45 backdrop-blur-[4px] border border-white/25 text-white cursor-pointer transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {mode === 'map' ? <ImageIcon size={17} aria-hidden="true" /> : <MapIcon size={17} aria-hidden="true" />}
          </button>
        )}
        {hasMinimap && (
          <span className="sr-only" aria-live="polite">
            {showingMap ? 'Minimap shown' : 'Photo shown'}
          </span>
        )}
      </motion.div>

      {/* Body */}
      <div className="px-[17px] pt-4 pb-[15px]">
        <h2 className="font-serif font-medium text-[34px] leading-[1.02] tracking-[-0.02em] text-ink">
          {stop.name}
        </h2>
        {subtitleParts.length > 0 && (
          <p className="text-[12.5px] text-muted mt-[5px]">{subtitleParts.join(' · ')}</p>
        )}

        <ListenButton text={listenText} voiceId={voiceId} variant="pill" />

        <StoryTabs
          story={story}
          notice={notice}
          experience={experience}
          facts={facts}
          active={activeTab}
          onChange={onTabChange}
        />

        <div className="flex gap-[9px] mt-3.5">
          <button
            type="button"
            onClick={onDirections}
            className="flex-1 rounded-[12px] bg-sig-btn text-white font-semibold text-[13.5px] py-[11px] min-h-[44px] cursor-pointer transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
          >
            Directions
          </button>
          {canComplete && (
            <button
              type="button"
              onClick={onComplete}
              aria-label={completed ? `Mark ${stop.name} not complete` : `Mark ${stop.name} complete`}
              aria-pressed={completed}
              className={
                'flex-none grid place-items-center w-11 min-h-[44px] rounded-[12px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link ' +
                (completed
                  ? 'border border-sig/40 bg-sig/[0.1] text-sig hover:bg-sig/[0.18]'
                  : 'border border-hair-strong bg-transparent text-ink/80 hover:bg-fill')
              }
            >
              <Check size={16} strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CurrentStopCard
