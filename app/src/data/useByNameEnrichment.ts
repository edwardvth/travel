import { useEffect, useRef } from 'react'
import { generateStopDetail } from '../trip/enrich'
import { destinationOf } from '../trip/landmark-context'
import type { Stop, Trip, TripData } from '../types'

/**
 * Generate + store a description for a BY-NAME stop (no Google `placeId`). The
 * shared library only serves placeId stops, so placeId-less stops (typed by name
 * or AI-suggested) keep their own copy — generated once on view via the client
 * `generateStopDetail` and saved onto the stop. placeId stops are skipped (they
 * use `useStopDescription`/the library). Edit-gated; runs once per stop.
 */
export function useByNameEnrichment(
  stop: Stop | undefined,
  trip: Trip,
  save: (partial: { data: TripData }) => void,
  canEdit: boolean,
  dayIndex: number,
  stopIndex: number,
): void {
  const doneRef = useRef<string | null>(null)
  const needs = !!stop && !stop.placeId && !stop.history
  const key = `${dayIndex}-${stopIndex}`
  useEffect(() => {
    if (!stop || !needs || !canEdit) return
    if (doneRef.current === key) return
    doneRef.current = key
    let cancelled = false
    void (async () => {
      try {
        const detail = await generateStopDetail(stop, trip.title, destinationOf(trip))
        if (cancelled) return
        const fresh = trip.data
        const next: TripData = {
          ...fresh,
          days: fresh.days.map((d, i) => i === dayIndex ? {
            ...d,
            stops: d.stops.map((s, j) => j === stopIndex ? { ...s, history: detail.history, facts: detail.facts, tips: detail.tips, notice: detail.notice } : s),
          } : d),
        }
        save({ data: next })
      } catch { /* leave empty; tabs show their empty state */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needs, canEdit])
}
