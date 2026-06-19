import type { Trip } from '../types'

/** Key used in `data.completed` for a done stop, e.g. "0-2" (dayIndex-stopIndex). */
export function completedKey(day: number, stop: number): string {
  return `${day}-${stop}`
}

/** True when the given day/stop is marked done in the `completed` array. */
export function isCompleted(completed: string[] | undefined, day: number, stop: number): boolean {
  return !!completed && completed.includes(completedKey(day, stop))
}

/** Number of days in the trip (from data.days, falling back to config). */
export function dayCount(trip: Trip | null | undefined): number {
  if (!trip) return 0
  return trip.data?.days?.length || trip.config?.numDays || 0
}

/** The stops for a given day index (empty array if out of range). */
export function dayStops(trip: Trip | null | undefined, day: number) {
  return trip?.data?.days?.[day]?.stops ?? []
}

/** Number of stops in a given day. */
export function stopCount(trip: Trip | null | undefined, day: number): number {
  return dayStops(trip, day).length
}
