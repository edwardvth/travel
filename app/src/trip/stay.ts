import type { Hotel } from '../types'

/**
 * Friendly rendering of a stay's `checkIn`/`checkOut` ISO date (`YYYY-MM-DD`,
 * possibly with a time suffix) as e.g. "Jul 2, 2026". Parsed in local time so we
 * never cross a day boundary via UTC. Returns null for null/empty/invalid input
 * so callers can skip the line entirely. Pure + unit-tested.
 */
export function formatStayDate(date: string | undefined | null): string | null {
  if (!date) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** True when the stay carries at least one check-in/check-out date. */
export function hasStayDates(hotel: Pick<Hotel, 'checkIn' | 'checkOut'> | null): boolean {
  return !!hotel && (!!hotel.checkIn || !!hotel.checkOut)
}
