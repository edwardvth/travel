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

/**
 * Display label for a day index. When the trip has a start date this is the
 * weekday + date ("Fri, Jul 4") so people can see which day of the week it is;
 * otherwise it falls back to the stored config label / "Day N".
 */
export function dayLabel(trip: Trip | null | undefined, day: number): string {
  const dated = weekdayDateLabel(dayDate(trip, day))
  if (dated) return dated
  const cfg = trip?.config
  return cfg?.dayLabels?.[day] || cfg?.dayTitles?.[day] || `Day ${day + 1}`
}

/** "Fri, Jul 4" from a `YYYY-MM-DD` date (weekday + month/day), or null. Pure. */
export function weekdayDateLabel(date: string | null): string | null {
  if (!date) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return null
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
  const monthDay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${weekday}, ${monthDay}`
}

/**
 * True when a day's `title` is an auto-generated label (empty, "Day N", or the
 * legacy "Jun 22 · Day 1" date-title) rather than a user-chosen custom name — so
 * the UI can show just the date for it, and a custom title gets the date appended.
 * Pure.
 */
export function isAutoDayTitle(title: string | undefined | null): boolean {
  const t = (title ?? '').trim()
  if (!t) return true
  if (/^Day \d+$/i.test(t)) return true
  if (/ · Day \d+$/.test(t)) return true
  return false
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

/** A day's anchor coords: the first stop with finite lat/lng, else null. Pure. */
export function dayAnchorCoords(
  trip: Trip | null | undefined,
  day: number,
): { lat: number; lng: number } | null {
  const stops = trip?.data?.days?.[day]?.stops ?? []
  for (const stop of stops) {
    const lat = stop.lat ?? stop.coords?.lat
    const lng = stop.lng ?? stop.coords?.lng
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng }
    }
  }
  return null
}
