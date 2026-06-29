// app/src/trip/stop-hours.ts
//
// Render Google `regularOpeningHours.weekdayDescriptions` (7 strings like
// "Monday: 9:30 AM – 11:45 PM") into one compact chip label. Pure + tested.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Strip the leading "Weekday: " and normalize the dash/whitespace of the range. */
function rangeOf(line: string): string {
  const after = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line
  return after
    .replace(/\s*[–—-]\s*/g, '–') // any dash w/ spaces -> tight en-dash
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Compact label for a stop's opening hours.
 * - empty/undefined -> ''
 * - all 7 days identical -> "Daily <range>"
 * - varies + ISO `date` (YYYY-MM-DD) -> that weekday only, e.g. "Fri 9:00 AM–9:00 PM"
 * - varies + no date -> '' (hide rather than mislead)
 */
export function stopHoursLabel(hours: string[] | undefined, date?: string): string {
  if (!hours || hours.length === 0) return ''
  const ranges = hours.map(rangeOf)
  const allSame = ranges.every((r) => r === ranges[0])
  if (allSame) return `Daily ${ranges[0]}`

  if (!date) return ''
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const wantedFull = WEEKDAYS[d.getDay()]
  const idx = hours.findIndex((line) => line.trimStart().toLowerCase().startsWith(wantedFull.toLowerCase()))
  if (idx < 0) return ''
  return `${wantedFull.slice(0, 3)} ${ranges[idx]}`
}
