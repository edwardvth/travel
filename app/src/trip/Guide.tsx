import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import type { Stop, TripData } from '../types'
import { useAuth } from '../auth/useAuth'
import { useAccountSettings } from '../data/useAccountSettings'
import { useLandmarkImage } from '../data/useLandmarkImage'

import { GuideProgress } from './guide/GuideProgress'
import { CurrentStopCard } from './guide/CurrentStopCard'
import { UpcomingRow } from './guide/UpcomingRow'
import { ArrivingBanner } from './guide/ArrivingBanner'
import { ArrivalView } from './guide/ArrivalView'
import type { StoryTab } from './guide/StoryTabs'

import { useGeolocation, bearing, compassLabel } from './guide/geo'
import { isArrived } from './guide/arrival'
import { activeDayIndex, currentStopIndex, stopHeroQuery } from './guide/guide-helpers'
import { directionsUrl, detectPlatform } from './guide/maps'
import { resolveVoiceId } from './guide/voices'

import { walkMinutes, haversineKm, stopCoords } from './walk'
import { coverPhoto } from './photo'
import { destinationOf } from './landmark-context'
import { generateStopDetail } from './enrich'
import { toggleCompleted } from './itinerary-helpers'
import { dayLabel as dayLabelOf } from './helpers'
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
  const { user } = useAuth()
  const { settings } = useAccountSettings(user?.id)
  const voiceId = resolveVoiceId(settings.voiceId)

  const data = trip.data
  const days = data?.days ?? []
  const destination = destinationOf(trip)

  // ── Active day: today-in-range, else the planner's selected day ───────────
  const dayIndex = useMemo(
    () => activeDayIndex(trip.config?.startDate, days.length, activeDay, todayYmd()),
    [trip.config?.startDate, days.length, activeDay],
  )
  const day = days[dayIndex]
  const stops = day?.stops ?? []
  const stopNames = useMemo(() => stops.map(s => s.name), [stops])

  // ── Current stop = first not-completed in the active day ──────────────────
  const stopIndex = currentStopIndex(dayIndex, stopNames, data?.completed)
  const stop: Stop | undefined = stopIndex >= 0 ? stops[stopIndex] : undefined
  const sc = stop ? stopCoords(stop) : null

  // ── Live telemetry (geolocation while Guide is open) ──────────────────────
  const geo = useGeolocation(true)
  const live = geo.pos != null && sc != null
  const distanceM = live ? haversineKm(geo.pos!, sc!) * 1000 : null
  const etaMin = live ? walkMinutes(geo.pos!, sc!) : null
  const headingLabel = live ? compassLabel(bearing(geo.pos!, sc!)) : null

  // Degraded distance: static walk from the previous stop when geo is unavailable.
  const prevCoords = stopIndex > 0 ? stopCoords(stops[stopIndex - 1]) : null
  const staticEta = !live && prevCoords && sc ? walkMinutes(prevCoords, sc) : null

  // ── Tab state (held here; passed to the card / arrival view) ──────────────
  const [activeTab, setActiveTab] = useState<StoryTab>('story')

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

  // ── Hero photo: stored cover → on-demand Wikipedia → striped placeholder ──
  const stored = stop ? coverPhoto(stop) : undefined
  const heroQuery = stop && !stored ? stopHeroQuery(stop.name, destination) : undefined
  const { url: landmarkUrl } = useLandmarkImage(heroQuery)
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

  const onComplete = useCallback(() => {
    if (!canEdit || stopIndex < 0) return
    save({ data: { ...trip.data, completed: toggleCompleted(trip.data.completed, dayIndex, stopIndex) } })
    // Resetting per-stop arrival state happens via the stopKey effect once the
    // new current stop is re-derived.
  }, [canEdit, stopIndex, dayIndex, save, trip.data])

  const onBannerOpen = useCallback(() => {
    clearTimer()
    setPhase('arrived')
  }, [clearTimer])

  const onBannerDismiss = useCallback(() => {
    clearTimer()
    dismissedRef.current = true
    setPhase('traveling')
  }, [clearTimer])

  const dayLabelText = dayLabelOf(trip, dayIndex)
  const completedNames = stops
    .filter((_, i) => (data?.completed ?? []).includes(`${dayIndex}-${i}`))
    .map(s => s.name)

  // ── States ────────────────────────────────────────────────────────────────

  // Empty day → editorial empty state.
  if (stops.length === 0) {
    return (
      <EmptyState
        icon="compass"
        title="No stops on this day yet"
        body={`Add places to ${dayLabelText} in Plan, and Guide will bring them to life as you go.`}
      />
    )
  }

  // All complete → restrained "day complete" + nudge.
  if (stopIndex < 0 || !stop) {
    return (
      <EmptyState
        icon="sparkles"
        title={`${dayLabelText} complete`}
        body="You've reached every stop on this day. Beautifully done — when you're ready, switch days in Plan to keep exploring."
      />
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

  // Traveling (+ arriving banner overlaid).
  const nextStop = stopIndex + 1 < stops.length ? stops[stopIndex + 1] : null
  const nextStopCoords = nextStop ? stopCoords(nextStop) : null
  const nextStopEta = sc && nextStopCoords ? walkMinutes(sc, nextStopCoords) : null

  return (
    <div className="px-5 md:px-8 py-6 md:py-8">
      <div className="mx-auto w-full max-w-md">
        {phase === 'arriving' && (
          <div className="mb-4">
            <ArrivingBanner name={stop.name} onOpen={onBannerOpen} onDismiss={onBannerDismiss} />
          </div>
        )}

        <GuideProgress
          stopNumber={stopIndex + 1}
          stopCount={stops.length}
          dayLabel={dayLabelText}
          completedCount={completedNames.length}
          completedNames={completedNames}
        />

        {enriching && !stop.history ? (
          <CardSkeleton />
        ) : (
          <CurrentStopCard
            stop={stop}
            heroUrl={heroUrl}
            distanceM={distanceM}
            etaMin={etaMin ?? staticEta}
            headingLabel={headingLabel}
            story={story}
            notice={notice}
            experience={experience}
            voiceId={voiceId}
            onDirections={onDirections}
            onComplete={onComplete}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )}

        {nextStop && (
          <div className="mt-4 pt-1 border-t border-hair">
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted pt-3 pb-0.5">UP NEXT</p>
            <UpcomingRow
              index={stopIndex + 2}
              name={nextStop.name}
              meta={nextStopEta != null ? `${nextStopEta} MIN` : ''}
            />
          </div>
        )}
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

/** Restrained editorial empty / all-complete state. */
function EmptyState({ icon, title, body }: { icon: 'compass' | 'sparkles'; title: string; body: string }) {
  const Icon = icon === 'sparkles' ? Sparkles : Compass
  return (
    <div className="px-5 md:px-8 py-16 md:py-24">
      <div className="mx-auto w-full max-w-md text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid place-items-center w-14 h-14 rounded-2xl border border-sig/25 bg-sig/[0.06] text-sig"
        >
          <Icon size={26} />
        </span>
        <h2 className="mt-5 font-serif text-3xl md:text-4xl text-ink tracking-tight">{title}</h2>
        <p className="mx-auto mt-3 max-w-sm text-[14px] md:text-[15px] text-muted leading-relaxed">{body}</p>
      </div>
    </div>
  )
}
