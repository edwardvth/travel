import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, useMotionValue, useTransform, animate, cubicBezier } from 'framer-motion'
import { Check, Undo2 } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import type { Stop } from '../types'
import { useAuth } from '../auth/useAuth'
import { useAccountSettings } from '../data/useAccountSettings'
import { useHeroImage } from '../data/useLandmarkImage'

import { GuideProgress } from './guide/GuideProgress'
import { DayNav } from './guide/DayNav'
import { CurrentStopCard } from './guide/CurrentStopCard'
import { StopList } from './guide/StopList'
import { CompletedSection } from './guide/CompletedSection'
import { ArrivingBanner } from './guide/ArrivingBanner'
import { ArrivalView } from './guide/ArrivalView'
import type { StoryTab } from './guide/StoryTabs'

import { useGeolocation, bearing, compassLabel } from './guide/geo'
import { isArrived } from './guide/arrival'
import { activeDayIndex, completedStops, currentStopIndex, dayStopRows, stopHeroQueries } from './guide/guide-helpers'
import { directionsUrl, detectPlatform } from './guide/maps'
import { resolveVoiceId } from './guide/voices'
import { SWIPE, clamp, swipeCommit, type EnterFrom } from './guide/swipe'

import { walkMinutes, haversineKm, stopCoords } from './walk'
import { coverPhoto } from './photo'
import { destinationOf } from './landmark-context'
import {
  useStopDescription,
  usePrefetchStopDescriptions,
  stopDescriptionKey,
  applyStopDescription,
} from '../data/useStopDescription'
import { toggleCompleted } from './itinerary-helpers'
import { dayLabel as dayLabelOf, dayDate, formatDayDate } from './helpers'
import { applyTripBasics } from './settings-helpers'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Compass, Sparkles } from './icons'

/** Local `YYYY-MM-DD` for today, used to pick the active day. */
function todayYmd(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** "~5s" soft-arrival auto-open delay (locked decision). */
const AUTO_OPEN_MS = 5000

/** Exponential ease-in (slow, then accelerating) for the back peek's fade. */
const EXPO_IN = cubicBezier(0.7, 0, 0.84, 0)

/** Props for the outgoing card snapshot the ghost overlay re-renders while it flies off. */
interface GhostSnap {
  stop: Stop
  heroUrl?: string | null
  story: string
  notice: string
  facts: string[]
  experience: string
  voiceId: string
  stopNumber: number
  completed: boolean
  distanceM: number | null
  etaMin: number | null
  headingLabel: string | null
  activeTab: StoryTab
}
interface GhostState {
  dir: 'left' | 'right'
  /** The drag offset (px) and tilt (deg) the card was released at, so the throw
   *  picks up seamlessly from the finger instead of snapping. */
  startX: number
  startRotate: number
  snap: GhostSnap
}

/**
 * The outgoing card's "throw" — an absolutely-positioned clone that overlays the
 * stable hero slot and flies off diagonally while the real card re-renders the
 * next/previous stop and slides in beneath it. It starts at the card's exact
 * release transform (`startX`/`startRotate`) so the hand-off from the drag is
 * seamless (no jump). Lives inside the slot (not a portal) — the slot is a single
 * stable subtree now, so no fixed-position math is needed. `onDone` clears it.
 */
function SwipeGhost({ ghost, reduce, onDone }: { ghost: GhostState; reduce: boolean; onDone: () => void }) {
  const { dir, startX, startRotate, snap } = ghost
  const target = reduce ? { opacity: 0 } : SWIPE.exit[dir]
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      // On top — this is the card you're throwing off the deck; as it flies away
      // the next card (which was peeking behind) is revealed and settles to front.
      style={{ zIndex: 30 }}
      initial={{ x: startX, y: 0, rotate: reduce ? 0 : startRotate, opacity: 1 }}
      animate={target}
      transition={reduce ? { duration: SWIPE.reducedFadeSec } : { duration: SWIPE.throwSec, ease: SWIPE.ease }}
      onAnimationComplete={onDone}
    >
      <CurrentStopCard
        stop={snap.stop}
        heroUrl={snap.heroUrl}
        distanceM={snap.distanceM}
        etaMin={snap.etaMin}
        headingLabel={snap.headingLabel}
        story={snap.story}
        notice={snap.notice}
        experience={snap.experience}
        facts={snap.facts}
        voiceId={snap.voiceId}
        onDirections={() => {}}
        onComplete={() => {}}
        completed={snap.completed}
        canComplete={false}
        stopNumber={snap.stopNumber}
        activeTab={snap.activeTab}
        onTabChange={() => {}}
      />
    </motion.div>
  )
}

/**
 * Guide — the live walking companion (Phase 3). It is a read-mostly **lens** over
 * the same trip `data`: it reads the active day's stops and writes only
 * `data.completed` (and, on demand, a stop's enrichment) through the lifted
 * `save`. It never reorders/adds/edits the itinerary.
 *
 * Behaviour (all locked decisions enforced here):
 *  - **No embedded map** — Directions hands off to the device's maps app.
 *  - **Narration never auto-plays** — the cards expose ▶ Listen and wait.
 *  - **Soft arrival** — a geofence flips a per-stop `wasArrived`; on first arrival
 *    a non-blocking banner slides in and a ~5s timer (owned HERE) auto-opens the
 *    Arrival state. Tapping View Guide opens it immediately; dismissing cancels.
 *  - Geolocation runs only while Guide is mounted (`useGeolocation(true)`); when
 *    it's denied/unsupported or the stop has no coords we degrade gracefully
 *    (no live chip, manual complete).
 */
export default function Guide() {
  const { trip, canEdit, save, activeDay } = useOutletContext<PlannerOutletContext>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { settings } = useAccountSettings(user?.id)
  const voiceId = resolveVoiceId(settings.voiceId)

  const data = trip.data
  const days = data?.days ?? []
  const destination = destinationOf(trip)

  // ── Active day: today-in-range, else the planner's selected day ───────────
  // This seeds the *focused* day Guide is currently browsing; DayNav lets the
  // traveller move off it freely (prev/next/pick), so everything downstream keys
  // off `focusedDay` rather than the seed.
  const seedDayIndex = useMemo(
    () => activeDayIndex(trip.config?.startDate, days.length, activeDay, todayYmd()),
    [trip.config?.startDate, days.length, activeDay],
  )
  const [focusedDay, setFocusedDay] = useState(seedDayIndex)
  // Re-seed when the underlying anchor moves (day added/removed, planner day
  // change) and re-clamp into range if the trip shrank beneath the focus.
  useEffect(() => {
    setFocusedDay(seedDayIndex)
  }, [seedDayIndex])
  const dayCount = days.length
  const dayIndex = Math.min(Math.max(focusedDay, 0), Math.max(0, dayCount - 1))
  const day = days[dayIndex]
  const stops = day?.stops ?? []
  const stopNames = useMemo(() => stops.map(s => s.name), [stops])

  // ── Tab state (held here; passed to the card / arrival view) ──────────────
  const [activeTab, setActiveTab] = useState<StoryTab>('story')

  // Completed Stops disclosure — collapsed by default; the traveller expands it
  // freely. New completions while it's open never force it closed (state is
  // independent of the completed set); a day change re-collapses it (below).
  const [completedExpanded, setCompletedExpanded] = useState(false)

  // After completing a stop auto-advances focus, scroll the new activity to the
  // top so the user lands on its start (not mid-card). Set on completion only.
  const focusedCardRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion() ?? false

  // ── Swipe-to-progress state (the focused card is a Tinder-style draggable) ──
  // `x` tracks the horizontal drag; `rotate` is the tilt derived from it. A
  // committed swipe spawns a `ghost` (the outgoing card flying off) and records
  // where the *next* card should animate in from (`enterFromRef`). `busyRef`
  // locks out re-entry while a throw is mid-flight.
  const x = useMotionValue(0)
  const rotate = useTransform(x, v => (reduce ? 0 : clamp(v * SWIPE.tiltDegPerPx, -SWIPE.maxTiltDeg, SWIPE.maxTiltDeg)))
  const busyRef = useRef(false)
  const enterFromRef = useRef<EnterFrom>('none')
  // The transform the incoming focused card starts its entrance from — captured
  // from the peek at release so the hand-off is seamless (set in launchGhost).
  const enterStartRef = useRef<{ scale: number; y: number; opacity: number } | null>(null)
  const [ghost, setGhost] = useState<GhostState | null>(null)
  // Gesture ownership: true while the user is touching the focused stop's
  // minimap, which disables the deck swipe so map pan/pinch never advance a stop.
  const [mapLock, setMapLock] = useState(false)

  // ── Current stop = first not-completed in the active day ──────────────────
  const currentIndex = currentStopIndex(dayIndex, stopNames, data?.completed)

  // ── Focus = the stop the traveller is *viewing* (free, non-linear) ────────
  // Defaults to the current stop and auto-advances with it, UNLESS the traveller
  // has manually picked another stop within this day (`userPicked`) — then we
  // leave their choice alone so auto-advance never yanks focus out from under a
  // deliberate browse. A day change resets the pick and re-seeds to current.
  const [focusedStopIndex, setFocusedStopIndex] = useState(currentIndex)
  const userPickedRef = useRef(false)

  // Day change → drop any manual pick (re-seed below picks up the new current)
  // and re-collapse the Completed Stops section (default-collapsed per day).
  useEffect(() => {
    userPickedRef.current = false
    enterFromRef.current = 'none'
    setCompletedExpanded(false)
  }, [dayIndex])

  // Re-seed focus to the current stop on day change, and follow auto-advance
  // while the traveller hasn't manually picked a stop this day. Clamp into range.
  useEffect(() => {
    if (userPickedRef.current) return
    const seed = currentIndex >= 0 ? currentIndex : 0
    setFocusedStopIndex(prev => (prev === seed ? prev : seed))
  }, [dayIndex, currentIndex])

  // Guard focus into range when the day's stop count changes underneath us.
  const focusIndex = stops.length === 0 ? -1 : Math.min(Math.max(focusedStopIndex, 0), stops.length - 1)

  // The operative stop for telemetry / hero / enrichment / the expanded card is
  // the *focused* one (so opening a completed/upcoming stop fetches its hero +
  // enriches on demand exactly like the current stop does).
  const stopIndex = focusIndex
  const stop: Stop | undefined = stopIndex >= 0 ? stops[stopIndex] : undefined
  const sc = stop ? stopCoords(stop) : null
  const focusedCompleted = stopIndex >= 0 && (data?.completed ?? []).includes(`${dayIndex}-${stopIndex}`)

  // Swipe edges: left (done+next) is a no-op past the last stop; right (back) is
  // a no-op at the first. On a no-op the directional hint dims (it won't commit).
  const isLeftNoop = stops.length === 0 || stopIndex >= stops.length - 1
  const isRightNoop = stopIndex <= 0
  const doneOpacity = useTransform(x, [-SWIPE.thresholdPx, 0], [isLeftNoop ? 0.42 : 1, 0], { clamp: true })
  const backOpacity = useTransform(x, [0, SWIPE.thresholdPx], [0, isRightNoop ? 0.42 : 1], { clamp: true })
  // Forward deck peek (next card, behind/below) comes forward as you drag left,
  // and fades out on a right-drag so it doesn't fight the back peek.
  const peekScale = useTransform(x, [-SWIPE.thresholdPx, 0], [1, SWIPE.peek.scale], { clamp: true })
  const peekLift = useTransform(x, [-SWIPE.thresholdPx, 0], [0, SWIPE.peek.y], { clamp: true })
  // Hidden at rest (opacity 0); fades in only as you drag left, and stays hidden
  // on a right-drag (clamped).
  const peekOpacity = useTransform(x, [-SWIPE.thresholdPx, 0], [1, 0], { clamp: true })
  // Back deck peek (previous card) descends from the top and exponentially fades
  // in as you drag right; hidden at rest and on a left-drag.
  const prevDrop = useTransform(x, [0, SWIPE.thresholdPx], [SWIPE.prevPeek.fromY, 0], { clamp: true })
  const prevOpacity = useTransform(x, [0, SWIPE.thresholdPx], [0, SWIPE.prevPeek.opacity], { clamp: true, ease: EXPO_IN })

  const onFocusStop = useCallback((i: number) => {
    enterFromRef.current = 'fade'
    userPickedRef.current = true
    setFocusedStopIndex(i)
    setActiveTab('story')
  }, [])

  // ── Live telemetry (geolocation while Guide is open) ──────────────────────
  const geo = useGeolocation(true)
  const live = geo.pos != null && sc != null
  const distanceM = live ? haversineKm(geo.pos!, sc!) * 1000 : null
  const etaMin = live ? walkMinutes(geo.pos!, sc!) : null
  const headingLabel = live ? compassLabel(bearing(geo.pos!, sc!)) : null

  // Degraded distance: static walk from the previous stop when geo is unavailable.
  const prevCoords = stopIndex > 0 ? stopCoords(stops[stopIndex - 1]) : null
  const staticEta = !live && prevCoords && sc ? walkMinutes(prevCoords, sc) : null

  // ── Soft arrival ──────────────────────────────────────────────────────────
  // `wasArrived` tracks the geofence (with hysteresis) for the *current* stop;
  // `phase` is the surface we show. The auto-open timer lives here (locked).
  const [phase, setPhase] = useState<'traveling' | 'arriving' | 'arrived'>('traveling')
  const wasArrivedRef = useRef(false)
  const dismissedRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Reset arrival tracking whenever the focused stop changes (advance/day switch).
  const stopKey = `${dayIndex}-${stopIndex}`
  useEffect(() => {
    wasArrivedRef.current = false
    dismissedRef.current = false
    clearTimer()
    setPhase('traveling')
    setActiveTab('story')
    setMapLock(false) // defensive: never carry a minimap gesture lock across stops
  }, [stopKey, clearTimer])

  // Geofence: on the first arrival flip, surface the soft banner + ~5s timer.
  useEffect(() => {
    if (!stop || geo.pos == null) return
    const arrived = isArrived(geo.pos, { lat: sc?.lat, lng: sc?.lng }, wasArrivedRef.current)
    wasArrivedRef.current = arrived
    if (arrived && !dismissedRef.current) {
      setPhase(p => {
        if (p !== 'traveling') return p
        clearTimer()
        timerRef.current = window.setTimeout(() => setPhase('arrived'), AUTO_OPEN_MS)
        return 'arriving'
      })
    }
  }, [stop, geo.pos, sc?.lat, sc?.lng, clearTimer])

  // Clean up the timer on unmount.
  useEffect(() => clearTimer, [clearTimer])

  // ── Lazy, per-stop description loading (cache-aware, swipe-safe) ───────────
  // Replaces the old global `enriching` boolean + index-keyed ref. State is keyed
  // by stop IDENTITY (placeId-preferred), so a request resolving for a previous
  // stop can never leave the next one stuck, and a stop that already has content
  // renders instantly. Only generates when editable (the old enrichment gate).
  const desc = useStopDescription(stop, { tripTitle: trip.title, destination, enabled: canEdit })

  // Prefetch ahead of the traveller: warm the focused stop + the next three so a
  // forward swipe usually lands on already-loaded content. Bounded, deduped, and
  // cache-first (skips stops that already have content); re-runs only when the
  // window's identity set changes.
  usePrefetchStopDescriptions(
    [stops[stopIndex], stops[stopIndex + 1], stops[stopIndex + 2], stops[stopIndex + 3]],
    { tripTitle: trip.title, destination, enabled: canEdit },
  )

  // Persist freshly-generated content back onto the stop (by identity, edit-gated)
  // so it survives reload and appears on the Plan / StopDetail surfaces. Matching
  // by identity (not a day/stop index) means a result that resolves after a swipe
  // still lands on the correct stop. A no-op save is skipped (same data ref).
  useEffect(() => {
    if (!stop || !canEdit) return
    if (desc.fromStop || !desc.content) return
    const next = applyStopDescription(trip.data, stopDescriptionKey(stop, destination), destination, desc.content)
    if (next !== trip.data) save({ data: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desc.content, desc.fromStop, canEdit])

  // ── Hero photo: stored cover → on-demand chain → striped placeholder ──────
  // The on-demand chain runs in priority order, advancing only on a miss:
  //   pageimages (Wikipedia) → Commons (free) → Google Places (paid, dormant).
  // Each over the ORDERED queries ("Name, Destination" → "Name, City" → "Name");
  // the Places layer uses the most-specific "Name, Destination". Only when ALL
  // layers miss do we fall to the striped placeholder. The Google layer no-ops
  // to null until its key is deployed, so this matches today's behaviour until
  // an operator turns it on.
  const stored = stop ? coverPhoto(stop) : undefined
  const heroQueryList = stop && !stored ? stopHeroQueries(stop.name, destination) : undefined
  const { url: landmarkUrl } = useHeroImage(heroQueryList)
  const heroUrl = stored ?? landmarkUrl ?? undefined

  // ── Deck peeks: the next / previous stops, rendered behind the focused card ─
  // The next shows where a left-swipe heads (comes forward from below); the
  // previous shows where a right-swipe heads (descends from the top). Resolving
  // their heroes here also preloads both neighbour images. Each is null at the
  // respective end of the day.
  const peekStop: Stop | undefined = stopIndex >= 0 && stopIndex + 1 < stops.length ? stops[stopIndex + 1] : undefined
  const peekStored = peekStop ? coverPhoto(peekStop) : undefined
  const peekQueryList = peekStop && !peekStored ? stopHeroQueries(peekStop.name, destination) : undefined
  const { url: peekLandmarkUrl } = useHeroImage(peekQueryList)
  const peekHeroUrl = peekStored ?? peekLandmarkUrl ?? undefined

  const prevStop: Stop | undefined = stopIndex > 0 ? stops[stopIndex - 1] : undefined
  const prevStored = prevStop ? coverPhoto(prevStop) : undefined
  const prevQueryList = prevStop && !prevStored ? stopHeroQueries(prevStop.name, destination) : undefined
  const { url: prevLandmarkUrl } = useHeroImage(prevQueryList)
  const prevHeroUrl = prevStored ?? prevLandmarkUrl ?? undefined
  const prevCompleted = prevStop != null && (data?.completed ?? []).includes(`${dayIndex}-${stopIndex - 1}`)

  // ── Content mapped to tabs ────────────────────────────────────────────────
  // Sourced from the description layer: the stop's persisted content if present,
  // otherwise the freshly-generated result (shown the moment it resolves, before
  // the persist save round-trips). Empty while loading → the card shows the
  // in-body loader, never a stuck full card.
  const descContent = desc.content
  const story = descContent?.history ?? ''
  const notice = descContent?.notice ?? ''
  const facts = descContent?.facts ?? []
  const experience = descContent?.tips ?? ''

  // ── Actions ───────────────────────────────────────────────────────────────
  const onDirections = useCallback(() => {
    if (!stop) return
    const url = directionsUrl(
      { name: stop.name, destination, coords: stopCoords(stop) ?? undefined },
      detectPlatform(),
    )
    if (url.startsWith('geo:')) window.location.href = url
    else window.open(url, '_blank', 'noopener')
  }, [stop, destination])

  // Toggle completion for any stop in the focused day (reversible — `toggleCompleted`
  // flips both ways). Edit-gated. Progress + the current stop re-derive from
  // `data.completed`, so marking/un-marking recomputes everything immediately.
  const onToggleCompleteAt = useCallback(
    (index: number) => {
      if (!canEdit || index < 0) return
      save({ data: { ...trip.data, completed: toggleCompleted(trip.data.completed, dayIndex, index) } })
    },
    [canEdit, dayIndex, save, trip.data],
  )

  // Spawn the "throw" ghost from the focused card's current position + tilt, with
  // a snapshot of the outgoing stop so the clone re-renders identically while it
  // flies off. Locks `busyRef` and recenters the drag so the incoming card sits
  // square. Caller then changes focus + sets `enterFromRef`.
  const launchGhost = useCallback(
    (dir: 'left' | 'right') => {
      busyRef.current = true
      setGhost({
        dir,
        startX: x.get(),
        startRotate: rotate.get(),
        snap: {
          stop: stop!,
          heroUrl,
          story,
          notice,
          experience,
          facts,
          voiceId,
          stopNumber: stopIndex + 1,
          completed: focusedCompleted,
          distanceM: focusedCompleted ? null : distanceM,
          etaMin: focusedCompleted ? null : etaMin ?? staticEta,
          headingLabel: focusedCompleted ? null : headingLabel,
          activeTab,
        },
      })
      // Capture the peek's exact state at release so the incoming focused card
      // continues seamlessly from where the peek was (no jump), regardless of how
      // far you dragged. Left → the next (forward) peek; right → the prev peek.
      enterStartRef.current =
        dir === 'left'
          ? { scale: peekScale.get(), y: peekLift.get(), opacity: peekOpacity.get() }
          : { scale: 1, y: prevDrop.get(), opacity: prevOpacity.get() }
      x.set(0)
    },
    [stop, heroUrl, story, notice, experience, voiceId, stopIndex, focusedCompleted, distanceM, etaMin, staticEta, headingLabel, activeTab, rotate, x, peekScale, peekLift, peekOpacity, prevDrop, prevOpacity],
  )

  // The focused stop's card ✓ toggles that stop (complete ⇄ un-complete).
  // Un-completing just toggles. Completing also **advances focus to the next
  // not-completed stop in the same render** — so the focus never lingers on the
  // just-completed stop (which would flash the Completed section open) — and
  // flags a scroll so the new activity lands at the top. When it advances it also
  // throws the card up-and-left (the same motion as a left-swipe).
  const onComplete = useCallback(() => {
    if (busyRef.current) return
    if (focusedCompleted) {
      onToggleCompleteAt(stopIndex)
      return
    }
    const after = [...(data?.completed ?? []), `${dayIndex}-${stopIndex}`]
    const nextIdx = currentStopIndex(dayIndex, stopNames, after)
    // Only advance when completing the *current* stop, and only forward — never
    // yank focus to an earlier stop (which caused the "switches back" jump).
    const willAdvance = stopIndex === currentIndex && nextIdx > stopIndex
    if (willAdvance) {
      launchGhost('left')
      enterFromRef.current = 'below'
    }
    onToggleCompleteAt(stopIndex)
    if (willAdvance) {
      setFocusedStopIndex(nextIdx)
    }
  }, [focusedCompleted, onToggleCompleteAt, stopIndex, currentIndex, dayIndex, data?.completed, stopNames, launchGhost])

  // Swipe LEFT = done + next. If the focused stop is still open, this is exactly
  // the ✓ action (complete + advance + throw). If it's already done (you stepped
  // back onto it), don't un-complete — just advance with the same throw.
  const onSwipeNext = useCallback(() => {
    if (busyRef.current || isLeftNoop) return
    if (!focusedCompleted) {
      onComplete()
      return
    }
    launchGhost('left')
    enterFromRef.current = 'below'
    userPickedRef.current = true
    setActiveTab('story')
    setFocusedStopIndex(Math.min(stopIndex + 1, stops.length - 1))
  }, [isLeftNoop, focusedCompleted, onComplete, launchGhost, stopIndex, stops.length])

  // Swipe RIGHT = back — the inverse of swipe-left. Step focus to the previous
  // stop AND un-complete it, so it becomes the current stop again: progress
  // ("STOP n OF …") and the upcoming list rewind with you instead of staying
  // ahead. The card is thrown down-and-right while the previous drops in from
  // above. (A no-op un-complete is harmless when stepping onto a not-done stop.)
  const onSwipePrev = useCallback(() => {
    if (busyRef.current || isRightNoop) return
    const dest = stopIndex - 1
    launchGhost('right')
    enterFromRef.current = 'above'
    userPickedRef.current = true
    setActiveTab('story')
    if ((data?.completed ?? []).includes(`${dayIndex}-${dest}`)) {
      onToggleCompleteAt(dest)
    }
    setFocusedStopIndex(dest)
  }, [isRightNoop, launchGhost, stopIndex, dayIndex, data?.completed, onToggleCompleteAt])

  // Drag release: commit on distance OR a flick (velocity); otherwise spring back
  // to center. Direction comes from the drag offset; edges are guarded above.
  const onCardDragEnd = useCallback(
    (_e: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      const dir = swipeCommit(info.offset.x, info.velocity.x, { leftNoop: isLeftNoop, rightNoop: isRightNoop })
      if (dir === 'left') onSwipeNext()
      else if (dir === 'right') onSwipePrev()
      else animate(x, 0, reduce ? { duration: 0.12 } : SWIPE.spring)
    },
    [isLeftNoop, isRightNoop, onSwipeNext, onSwipePrev, x, reduce],
  )

  const onBannerOpen = useCallback(() => {
    clearTimer()
    setPhase('arrived')
  }, [clearTimer])

  const onBannerDismiss = useCallback(() => {
    clearTimer()
    dismissedRef.current = true
    setPhase('traveling')
  }, [clearTimer])

  // ── Day navigation (DayNav) ───────────────────────────────────────────────
  const onPrevDay = useCallback(() => setFocusedDay(d => Math.max(0, d - 1)), [])
  const onNextDay = useCallback(
    () => setFocusedDay(d => Math.min(dayCount - 1, d + 1)),
    [dayCount],
  )
  const onPickDay = useCallback(
    (i: number) => setFocusedDay(Math.min(Math.max(i, 0), Math.max(0, dayCount - 1))),
    [dayCount],
  )

  // Add Day: confirm → append ONE empty day at the END of the trip (immutably,
  // recomputing labels via applyTripBasics) → navigate to the Plan index.
  const [addOpen, setAddOpen] = useState(false)
  const nextDayDate = dayDate(trip, dayCount) // calendar date of the would-be new day
  const nextDayLabel = formatDayDate(nextDayDate)
  const onAddDay = useCallback(() => {
    if (!canEdit) return
    setAddOpen(true)
  }, [canEdit])
  const onConfirmAddDay = useCallback(() => {
    if (!canEdit) return
    const { config, data } = applyTripBasics(trip, {
      title: trip.title || (typeof trip.config?.title === 'string' ? trip.config.title : '') || '',
      subtitle: trip.subtitle ?? '',
      startDate: trip.config?.startDate || '',
      numDays: dayCount + 1,
    })
    save({ config, data })
    setAddOpen(false)
    navigate('/trip/' + trip.id)
  }, [canEdit, trip, dayCount, save, navigate])

  const dayLabelText = dayLabelOf(trip, dayIndex)
  // Completed stops in original itinerary order (drives both the progress line
  // and the Completed Stops section). Collapsing/expanding never reorders these.
  const completed = completedStops(dayIndex, stopNames, data?.completed)
  const completedIndices = completed.map(c => c.index)
  const completedNames = completed.map(c => c.name)
  // The disclosure toggle lives on the progress header's "n complete" line. It is
  // purely user-controlled — the focused card lives in its own stable hero slot
  // (below), so focusing/swiping back onto a completed stop never force-opens (or
  // re-opens) this summary.
  const completedPanelId = useId()
  const completedOpen = completedExpanded

  // Day-switch transition: slide/fade direction (+1 next, -1 prev). The ref holds
  // the previous day so the content can animate in from the correct side.
  const prevDayRef = useRef(dayIndex)
  const dayDirection = dayIndex > prevDayRef.current ? 1 : dayIndex < prevDayRef.current ? -1 : 0
  useEffect(() => { prevDayRef.current = dayIndex }, [dayIndex])
  // The full-day rows (done / current / upcoming), classified once for the list.
  const rows = dayStopRows(dayIndex, stops.length, data?.completed)
  const dayComplete = currentIndex < 0 && stops.length > 0

  // The shared day navigator + Add-Day confirm dialog — present in every browse
  // state (empty / all-complete / traveling) so the traveller can always move
  // off the current day. The full-screen Arrival state omits it by design.
  const dayNavEl = (
    <>
      <DayNav
        dayIndex={dayIndex}
        dayCount={dayCount}
        dayLabels={Array.from({ length: dayCount }, (_, i) => dayLabelOf(trip, i))}
        onPrev={onPrevDay}
        onNext={onNextDay}
        onPickDay={onPickDay}
        onAddDay={onAddDay}
        canEdit={canEdit}
      />
      <ConfirmDialog
        open={addOpen}
        title="Add a day to this travel?"
        body={nextDayLabel ? `This adds ${nextDayLabel} to the end of your travel.` : 'This adds a new empty day to the end of your travel.'}
        confirmLabel="Add day"
        onCancel={() => setAddOpen(false)}
        onConfirm={onConfirmAddDay}
      />
    </>
  )

  // ── States ────────────────────────────────────────────────────────────────

  // Empty day → editorial empty state.
  if (stops.length === 0) {
    return (
      <div className="px-5 md:px-8 py-6 md:py-8">
        <div className="mx-auto w-full max-w-md">
          {dayNavEl}
          <EmptyState
            bare
            icon="compass"
            title="No stops on this day yet"
            body={`Add places to ${dayLabelText} in Plan, and Guide will bring them to life as you go.`}
          />
        </div>
      </div>
    )
  }

  // Guard: with stops present, focus is always a real stop. (Defensive — keeps
  // the type-narrowing below honest if the list somehow desyncs.)
  if (!stop) {
    return (
      <div className="px-5 md:px-8 py-6 md:py-8">
        <div className="mx-auto w-full max-w-md">{dayNavEl}</div>
      </div>
    )
  }

  // Arrival state — full surface.
  if (phase === 'arrived') {
    const nextIndex = stops.findIndex((_, i) => i > stopIndex && !(data?.completed ?? []).includes(`${dayIndex}-${i}`))
    const nextStop = nextIndex >= 0 ? stops[nextIndex] : null
    const nextEtaCoords = nextStop ? stopCoords(nextStop) : null
    const nextEtaMin = sc && nextEtaCoords ? walkMinutes(sc, nextEtaCoords) : null
    const nextLabel = nextStop
      ? nextStop.name + (nextEtaMin != null ? ` · ${nextEtaMin} MIN` : '')
      : undefined

    // Mono telemetry under the arrival hero name, e.g. "LANDMARK · 38.62°N".
    const lat = sc?.lat
    const telemetry =
      stop.type || lat != null
        ? `${stop.type?.toUpperCase() ?? ''}${lat != null ? `${stop.type ? ' · ' : ''}${lat.toFixed(2)}°${lat >= 0 ? 'N' : 'S'}` : ''}`
        : undefined

    return (
      <div className="flex-1 min-h-0">
        <ArrivalView
          stop={stop}
          heroUrl={heroUrl}
          story={story}
          notice={notice}
          experience={experience}
          facts={facts}
          descriptionStatus={desc.status}
          onRetryDescription={desc.refetch}
          voiceId={voiceId}
          onComplete={onComplete}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          telemetry={telemetry}
          nextLabel={nextLabel}
        />
      </div>
    )
  }

  // Traveling (+ arriving banner overlaid) — now the full, browsable day list.
  // The focused stop renders the expanded card; every other stop is a quiet,
  // tappable row. A collapsed row's meta is a static walk estimate from the
  // preceding stop (no live geo per row — that's reserved for the focused stop).
  const rowMeta = (i: number): string => {
    const here = stopCoords(stops[i])
    const prev = i > 0 ? stopCoords(stops[i - 1]) : null
    if (!here || !prev) return ''
    return `${walkMinutes(prev, here)} MIN`
  }

  // The focused card is a Tinder-style draggable deck (see SWIPE / SwipeGhost):
  //  - Drag horizontally; the card tilts (`rotate`) with the finger, and the next
  //    stop (the peek card behind it) comes forward as you drag left.
  //  - Commit on distance or a flick → `onCardDragEnd` runs onSwipeNext/Prev,
  //    which throws the focused card off (ghost) and changes focus; the incoming
  //    card here settles to the front of the deck (`below`) or drops from above
  //    (`above`) per `enterFromRef`.
  //  - Under threshold → spring back to center.
  //  - Two `aria-hidden` hint washes (claret "Done · Next" on left drag, a neutral
  //    "Back" scrim on right) fade in with drag distance.
  const ef = enterFromRef.current
  const enterInitial = reduce
    ? ef === 'none'
      ? false
      : { opacity: 0 }
    : ef === 'below' || ef === 'above'
      ? // Continue from exactly where the peek was at release (seamless hand-off);
        // fall back to a sensible default if no capture exists.
        enterStartRef.current ??
        (ef === 'below'
          ? { opacity: 0.9, scale: SWIPE.peek.scale, y: SWIPE.peek.y }
          : { opacity: 0, scale: 1, y: SWIPE.prevPeek.fromY })
      : ef === 'fade'
        ? { opacity: 0 }
        : false
  const focusedCard = (
    <div ref={focusedCardRef} className="relative scroll-mt-20">
      {ghost && (
        <SwipeGhost
          ghost={ghost}
          reduce={reduce}
          onDone={() => {
            setGhost(null)
            busyRef.current = false
          }}
        />
      )}
      {/* Deck peeks behind the focused card — decorative + inert. The NEXT stop
          comes forward from below as you drag left; the PREVIOUS stop descends
          from the top and exponentially fades in as you drag right. */}
      {peekStop && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ zIndex: 2, scale: peekScale, y: peekLift, opacity: peekOpacity }}
        >
          <CurrentStopCard
            stop={peekStop}
            heroUrl={peekHeroUrl}
            distanceM={null}
            etaMin={null}
            headingLabel={null}
            story={peekStop.history ?? ''}
            notice={peekStop.notice ?? ''}
            facts={peekStop.facts ?? []}
            experience={peekStop.tips ?? ''}
            voiceId={voiceId}
            onDirections={() => {}}
            onComplete={() => {}}
            completed={false}
            canComplete={false}
            stopNumber={stopIndex + 2}
            activeTab="story"
            onTabChange={() => {}}
          />
        </motion.div>
      )}
      {prevStop && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ zIndex: 3, y: prevDrop, opacity: prevOpacity }}
        >
          <CurrentStopCard
            stop={prevStop}
            heroUrl={prevHeroUrl}
            distanceM={null}
            etaMin={null}
            headingLabel={null}
            story={prevStop.history ?? ''}
            notice={prevStop.notice ?? ''}
            facts={prevStop.facts ?? []}
            experience={prevStop.tips ?? ''}
            voiceId={voiceId}
            onDirections={() => {}}
            onComplete={() => {}}
            completed={prevCompleted}
            canComplete={false}
            stopNumber={stopIndex}
            activeTab="story"
            onTabChange={() => {}}
          />
        </motion.div>
      )}
      <motion.div
        drag={canEdit && !ghost && !mapLock ? 'x' : false}
        dragDirectionLock
        dragMomentum={false}
        onDragEnd={onCardDragEnd}
        style={{ x, rotate, touchAction: 'pan-y' }}
        className={'relative z-10 ' + (canEdit ? 'cursor-grab active:cursor-grabbing' : '')}
      >
        <motion.div
          key={stopIndex}
          initial={enterInitial}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduce ? { duration: SWIPE.reducedFadeSec } : { duration: SWIPE.enterSec, ease: SWIPE.enterEase, delay: SWIPE.enterDelaySec }}
        >
          <CurrentStopCard
            stop={stop}
            heroUrl={heroUrl}
            distanceM={focusedCompleted ? null : distanceM}
            etaMin={focusedCompleted ? null : etaMin ?? staticEta}
            headingLabel={focusedCompleted ? null : headingLabel}
            story={story}
            notice={notice}
            experience={experience}
            facts={facts}
            descriptionStatus={desc.status}
            onRetryDescription={desc.refetch}
            voiceId={voiceId}
            onDirections={onDirections}
            onComplete={onComplete}
            completed={focusedCompleted}
            canComplete={canEdit}
            stopNumber={stopIndex + 1}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            enableMinimap
            userPos={geo.pos}
            onMinimapInteracting={setMapLock}
          />
        </motion.div>

        {canEdit && (
          <>
            <motion.div
              aria-hidden="true"
              style={{ opacity: doneOpacity }}
              className="pointer-events-none absolute inset-0 grid place-items-center rounded-[18px] bg-sig-btn/85 text-white"
            >
              <div className="grid place-items-center gap-2">
                <span className="grid place-items-center w-14 h-14 rounded-full border-2 border-white/80">
                  <Check size={26} strokeWidth={2.5} aria-hidden="true" />
                </span>
                <span className="font-mono text-[11px] tracking-[0.16em] font-semibold">DONE · NEXT</span>
              </div>
            </motion.div>
            <motion.div
              aria-hidden="true"
              style={{ opacity: backOpacity }}
              className="pointer-events-none absolute inset-0 grid place-items-center rounded-[18px] bg-black/55 text-white backdrop-blur-[1px]"
            >
              <div className="grid place-items-center gap-2">
                <span className="grid place-items-center w-14 h-14 rounded-full border-2 border-white/80">
                  <Undo2 size={24} strokeWidth={2.5} aria-hidden="true" />
                </span>
                <span className="font-mono text-[11px] tracking-[0.16em] font-semibold">BACK</span>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  )

  return (
    <div className="px-5 md:px-8 py-6 md:py-8">
      <div className="mx-auto w-full max-w-md">
        {phase === 'arriving' && (
          <div className="mb-4">
            <ArrivingBanner name={stop.name} onOpen={onBannerOpen} onDismiss={onBannerDismiss} />
          </div>
        )}

        {dayNavEl}

        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={dayIndex}
          initial={{ opacity: 0, x: reduce ? 0 : dayDirection * 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: reduce ? 0 : dayDirection * -20 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
        <GuideProgress
          stopNumber={(currentIndex >= 0 ? currentIndex : stops.length - 1) + 1}
          stopCount={stops.length}
          completedCount={completedNames.length}
          completedNames={completedNames}
          completedIndices={completedIndices}
          completedExpanded={completedOpen}
          onToggleCompleted={completedNames.length > 0 ? () => setCompletedExpanded(e => !e) : undefined}
          completedPanelId={completedPanelId}
        />

        {dayComplete && (
          <p className="text-[12.5px] text-muted leading-relaxed -mt-1 mb-3.5">
            {dayLabelText} complete — every stop on this day is done. Reopen any below to revisit it, or switch days above.
          </p>
        )}

        <CompletedSection
          stops={stops}
          completed={completed}
          open={completedOpen}
          panelId={completedPanelId}
          rowMeta={rowMeta}
          onFocus={onFocusStop}
          onToggleComplete={onToggleCompleteAt}
          canComplete={canEdit}
        />

        {/* Stable hero slot — the focused stop's card always renders here, between
            the completed summary (above) and the upcoming list (below), whatever
            its status. One slot = one DOM subtree, so the swipe throw animates
            cleanly and stepping back never disturbs the summary disclosure. */}
        {focusedCard}

        <StopList
          stops={stops}
          rows={rows}
          focusedStopIndex={stopIndex}
          rowMeta={rowMeta}
          onFocus={onFocusStop}
        />
        </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/**
 * Restrained editorial empty / all-complete state. When `bare` it drops its own
 * page padding + centring wrapper (the caller already provides them, e.g. so the
 * DayNav can sit above it) and just renders the centred icon/title/body.
 */
function EmptyState({ icon, title, body, bare = false }: { icon: 'compass' | 'sparkles'; title: string; body: string; bare?: boolean }) {
  const Icon = icon === 'sparkles' ? Sparkles : Compass
  const inner = (
    <div className="text-center">
      <span
        aria-hidden="true"
        className="mx-auto grid place-items-center w-14 h-14 rounded-2xl border border-sig/25 bg-sig/[0.06] text-sig"
      >
        <Icon size={26} />
      </span>
      <h2 className="mt-5 font-serif text-3xl md:text-4xl text-ink tracking-tight">{title}</h2>
      <p className="mx-auto mt-3 max-w-sm text-[14px] md:text-[15px] text-muted leading-relaxed">{body}</p>
    </div>
  )
  if (bare) return <div className="py-10 md:py-14">{inner}</div>
  return (
    <div className="px-5 md:px-8 py-16 md:py-24">
      <div className="mx-auto w-full max-w-md">{inner}</div>
    </div>
  )
}
