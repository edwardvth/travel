/**
 * Shared stop-time helpers. A stop's `time` is a human display string
 * ("7:30 PM"); these convert it to/from the 24h "HH:MM" an `<input type="time">`
 * wants, and nudge it by a number of minutes (clamped within the day). Pure +
 * unit-tested. (Moved here from StopDetail so the Plan list row, the detail
 * editor, and the inline TimeEditor all share one source.)
 */

/**
 * Convert a stored display time ("9:00 AM") into a 24h "HH:MM" value for an
 * `<input type="time">`. Returns '' when unparseable.
 */
export function toInputTime(time: string | undefined): string {
  if (!time) return ''
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i)
  if (!m) return ''
  let h = Number(m[1])
  const min = m[2]
  const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${min}`
}

/** Convert an `<input type="time">` "HH:MM" back into a "h:MM AM/PM" display string. */
export function fromInputTime(value: string): string | undefined {
  const m = value.match(/^(\d{2}):(\d{2})$/)
  if (!m) return undefined
  let h = Number(m[1])
  const min = m[2]
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${min} ${ap}`
}

/**
 * Nudge a display time by `deltaMin` minutes, returning the new display string.
 * Clamps within the same day (00:00 … 23:59) so a late-evening +15 never rolls
 * past midnight into the next day. Returns the input unchanged if it can't be
 * parsed (so a malformed time is never silently lost). Pure + unit-tested.
 */
export function nudgeTime(time: string | undefined, deltaMin: number): string | undefined {
  const hhmm = toInputTime(time)
  if (!hhmm) return time
  const [h, m] = hhmm.split(':').map(Number)
  const clamped = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + deltaMin))
  const nh = String(Math.floor(clamped / 60)).padStart(2, '0')
  const nm = String(clamped % 60).padStart(2, '0')
  return fromInputTime(`${nh}:${nm}`)
}
