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

/** Display label for a day index — config.dayLabels, then dayTitles, then "Day N". */
export function dayLabel(trip: Trip | null | undefined, day: number): string {
  const cfg = trip?.config
  return cfg?.dayLabels?.[day] || cfg?.dayTitles?.[day] || `Day ${day + 1}`
}

/**
 * The calendar date for a day index as a local `YYYY-MM-DD` string:
 * `config.startDate` (an ISO `YYYY-MM-DD`) advanced by `dayIndex` days.
 * Returns null when there's no valid start date. Pure + unit-tested.
 */
export function dayDate(trip: Trip | null | undefined, dayIndex: number): string | null {
  const start = trip?.config?.startDate
  if (!start) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(start)
  if (!m) return null
  // Build the date in local time so we never cross a day boundary via UTC.
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + dayIndex)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Friendly rendering of a `YYYY-MM-DD` date for the day glance, e.g. "Tue · Jul 2".
 * Returns null for a null/invalid input so callers can skip the line entirely.
 */
export function formatDayDate(date: string | null): string | null {
  if (!date) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return null
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
  const monthDay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${weekday} · ${monthDay}`
}
