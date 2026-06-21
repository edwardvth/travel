import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import type { Stop, TripData } from '../types'
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

import { walkMinutes, haversineKm, stopCoords } from './walk'
import { coverPhoto } from './photo'
import { destinationOf } from './landmark-context'
import { generateStopDetail } from './enrich'
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

  const onFocusStop = useCallback((i: number) => {
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

  // ── Enrichment on demand for the focused stop ─────────────────────────────
  const needsEnrich = !!stop && !stop.history
  const enrichingRef = useRef<string | null>(null)
  const [enriching, setEnriching] = useState(false)

  useEffect(() => {
    if (!stop || !needsEnrich || !canEdit) return
    if (enrichingRef.current === stopKey) return
    enrichingRef.current = stopKey
    let cancelled = false
    setEnriching(true)
    void (async () => {
      try {
        const detail = await generateStopDetail(stop, trip.title, destination)
        if (cancelled) return
        // Re-clone from the freshest cache and patch this stop immutably.
        const fresh = trip.data
        const next: TripData = {
          ...fresh,
          days: fresh.days.map((d, i) =>
            i === dayIndex
              ? {
                  ...d,
                  stops: d.stops.map((s, j) =>
                    j === stopIndex
                      ? { ...s, history: detail.history, facts: detail.facts, tips: detail.tips, notice: detail.notice }
                      : s,
                  ),
                }
              : d,
          ),
        }
        save({ data: next })
      } catch {
        /* leave the stop un-enriched; the tabs show their empty state */
      } finally {
        if (!cancelled) setEnriching(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopKey, needsEnrich, canEdit])

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

  // ── Content mapped to tabs ────────────────────────────────────────────────
  const story = stop?.history ?? ''
  const notice = stop?.notice ?? ''
  const experience = stop?.tips ?? ''

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

  // The focused stop's card ✓ toggles that stop (complete ⇄ un-complete).
  const onComplete = useCallback(() => {
    onToggleCompleteAt(stopIndex)
  }, [onToggleCompleteAt, stopIndex])

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
        dayLabels={trip.config?.dayLabels}
        onPrev={onPrevDay}
        onNext={onNextDay}
        onPickDay={onPickDay}
        onAddDay={onAddDay}
        canEdit={canEdit}
      />
      <ConfirmDialog
        open={addOpen}
        title="Add a day to this trip?"
        body={nextDayLabel ? `This adds ${nextDayLabel} to the end of your trip.` : 'This adds a new empty day to the end of your trip.'}
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

  const focusedCard =
    enriching && !stop.history ? (
      <CardSkeleton />
    ) : (
      <CurrentStopCard
        stop={stop}
        heroUrl={heroUrl}
        distanceM={focusedCompleted ? null : distanceM}
        etaMin={focusedCompleted ? null : etaMin ?? staticEta}
        headingLabel={focusedCompleted ? null : headingLabel}
        story={story}
        notice={notice}
        experience={experience}
        voiceId={voiceId}
        onDirections={onDirections}
        onComplete={onComplete}
        completed={focusedCompleted}
        canComplete={canEdit}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
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

        <GuideProgress
          stopNumber={(currentIndex >= 0 ? currentIndex : stops.length - 1) + 1}
          stopCount={stops.length}
          completedCount={completedNames.length}
          completedNames={completedNames}
          completedIndices={completedIndices}
        />

        {dayComplete && (
          <p className="text-[12.5px] text-muted leading-relaxed -mt-1 mb-3.5">
            {dayLabelText} complete — every stop on this day is done. Reopen any below to revisit it, or switch days above.
          </p>
        )}

        <CompletedSection
          stops={stops}
          completed={completed}
          expanded={completedExpanded}
          onToggle={() => setCompletedExpanded(e => !e)}
          focusedStopIndex={stopIndex}
          focusedCard={focusedCard}
          rowMeta={rowMeta}
          onFocus={onFocusStop}
          onToggleComplete={onToggleCompleteAt}
          canComplete={canEdit}
        />

        <StopList
          stops={stops}
          rows={rows}
          focusedStopIndex={stopIndex}
          rowMeta={rowMeta}
          focusedCard={focusedCard}
          onFocus={onFocusStop}
        />
      </div>
    </div>
  )
}

/** A tasteful skeleton for the current-stop card while enrichment loads. */
function CardSkeleton() {
  return (
    <div className="rounded-[18px] overflow-hidden bg-raised border border-hair animate-pulse">
      <div className="h-[160px] bg-skeleton" />
      <div className="px-[17px] pt-4 pb-[15px] space-y-3">
        <div className="h-8 w-2/3 rounded-md bg-skeleton" />
        <div className="h-3 w-1/3 rounded-md bg-skeleton" />
        <div className="h-10 w-full rounded-[12px] bg-skeleton mt-4" />
        <div className="h-24 w-full rounded-md bg-skeleton" />
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
