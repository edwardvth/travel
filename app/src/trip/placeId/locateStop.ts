import type { Trip } from '../../types'

/**
 * Re-locate the placeId-less stop a review row points at. Prefers the exact
 * (dayIndex, stopIndex) when its name still matches and it's untagged; else
 * searches that day, then the whole trip, for an UNTAGGED stop with that exact
 * name. Returns null if none found (→ the row is marked stale). Pure.
 */
export function locateStop(
  trip: Trip, dayIndex: number, stopIndex: number, stopName: string,
): { dayIndex: number; stopIndex: number } | null {
  const days = trip.data?.days ?? []
  const untagged = (name: string, placeId?: string) => name === stopName && !placeId

  const atIndex = days[dayIndex]?.stops?.[stopIndex]
  if (atIndex && untagged(atIndex.name, atIndex.placeId)) return { dayIndex, stopIndex }

  const sameDay = days[dayIndex]?.stops ?? []
  for (let s = 0; s < sameDay.length; s++) {
    if (untagged(sameDay[s].name, sameDay[s].placeId)) return { dayIndex, stopIndex: s }
  }
  for (let d = 0; d < days.length; d++) {
    const stops = days[d].stops ?? []
    for (let s = 0; s < stops.length; s++) {
      if (untagged(stops[s].name, stops[s].placeId)) return { dayIndex: d, stopIndex: s }
    }
  }
  return null
}
