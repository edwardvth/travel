import type { Day, Trip, TripConfig, TripData } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface DayLabelSet {
  numDays: number
  dayLabels: string[]
  dayTitles: string[]
}

/**
 * Recompute day count + labels/titles from a start date, mirroring Trip.html's
 * saveAllSettings/previewDayTabs label logic:
 *   - With a start date: label = "Mon D", title = "Mon D · Day N".
 *   - Without a start date: label = title = "Day N".
 * `numDays` is clamped to >= 1.
 */
export function computeDayLabels(startDate: string | undefined, numDays: number): DayLabelSet {
  const n = Math.max(1, Math.floor(numDays) || 1)
  const dayLabels: string[] = []
  const dayTitles: string[] = []
  const date = (startDate || '').trim()
  for (let i = 0; i < n; i++) {
    if (date) {
      const [y, mo, d] = date.split('-').map(Number)
      const dt = new Date(y, mo - 1, d + i)
      const label = MONTHS[dt.getMonth()] + ' ' + dt.getDate()
      dayLabels.push(label)
      dayTitles.push(label + ' · Day ' + (i + 1))
    } else {
      dayLabels.push('Day ' + (i + 1))
      dayTitles.push('Day ' + (i + 1))
    }
  }
  return { numDays: n, dayLabels, dayTitles }
}

/** Inclusive day count between two ISO dates (YYYY-MM-DD); clamped to >= 1. */
export function daysBetween(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 1
  const [sy, smo, sd] = startDate.split('-').map(Number)
  const [ey, emo, ed] = endDate.split('-').map(Number)
  const diff = (+new Date(ey, emo - 1, ed) - +new Date(sy, smo - 1, sd)) / 86_400_000
  return Math.max(1, Math.round(diff) + 1)
}

/** The ISO end date (YYYY-MM-DD) for a start date + inclusive day count. */
export function endDateFor(startDate: string, numDays: number): string {
  if (!startDate) return ''
  const [y, mo, d] = startDate.split('-').map(Number)
  const dt = new Date(y, mo - 1, d + Math.max(0, (Math.max(1, numDays) - 1)))
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${m}-${day}`
}

/**
 * Resync `data.days` to a new day count, preserving existing days (title/note/stops)
 * and applying recomputed titles. Adding days appends empty `{ title, note:'', stops:[] }`;
 * removing days drops trailing days. Mirrors Trip.html saveAllSettings:
 *   while (days.length < n) push empty; days.length = n; apply dayTitles.
 */
export function resyncDays(oldDays: readonly Day[] | undefined, labels: DayLabelSet): Day[] {
  const { numDays, dayTitles } = labels
  const src = oldDays ?? []
  const out: Day[] = []
  for (let i = 0; i < numDays; i++) {
    const existing = src[i]
    if (existing) {
      // Keep existing stops/note; refresh the title to the recomputed one.
      out.push({ ...existing, title: dayTitles[i] || existing.title })
    } else {
      out.push({ title: dayTitles[i] || 'Day ' + (i + 1), note: '', stops: [] })
    }
  }
  return out
}

/** True if any day being dropped (index >= newCount) contains at least one stop. */
export function droppingDaysWithStops(oldDays: readonly Day[] | undefined, newCount: number): boolean {
  const src = oldDays ?? []
  for (let i = Math.max(0, newCount); i < src.length; i++) {
    if ((src[i]?.stops?.length ?? 0) > 0) return true
  }
  return false
}

/**
 * Build the next `{ config, data }` for a trip-basics edit (title/subtitle/startDate),
 * recomputing day labels/titles and resyncing `data.days`. Pure + immutable.
 */
export function applyTripBasics(
  trip: Trip,
  next: { title: string; subtitle: string; startDate: string; numDays: number },
): { config: TripConfig; data: TripData } {
  const labels = computeDayLabels(next.startDate, next.numDays)
  const config: TripConfig = {
    ...trip.config,
    title: next.title,
    subtitle: next.subtitle,
    startDate: next.startDate,
    numDays: labels.numDays,
    dayLabels: labels.dayLabels,
    dayTitles: labels.dayTitles,
  }
  const data: TripData = {
    ...trip.data,
    days: resyncDays(trip.data?.days, labels),
  }
  return { config, data }
}

export interface ImportedTrip {
  config: TripConfig
  data: TripData
  title: string
  subtitle: string | null
}

/**
 * Validate + normalize an imported JSON blob into a savable shape. Accepts both
 * the new export shape (`{ config, data }`) and the legacy save shape
 * (`{ days, completed, hotel }` at the top level — Trip.html getSaveData()).
 * Throws a friendly Error when there are no usable days.
 */
export function parseImportedTrip(raw: unknown, fallback: Trip): ImportedTrip {
  if (!raw || typeof raw !== 'object') throw new Error('That file isn’t a valid trip export.')
  const obj = raw as Record<string, unknown>

  // Locate the data payload: prefer `data`, fall back to a legacy top-level shape.
  const dataObj = (obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>
  const days = dataObj.days
  if (!Array.isArray(days) || days.length < 1) {
    throw new Error('No days found in that file.')
  }

  const cleanDays: Day[] = days.map((d, i) => {
    const dd = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
    return {
      title: typeof dd.title === 'string' ? dd.title : 'Day ' + (i + 1),
      note: typeof dd.note === 'string' ? dd.note : '',
      stops: Array.isArray(dd.stops) ? (dd.stops as Day['stops']) : [],
    }
  })

  const completed = Array.isArray(dataObj.completed) ? (dataObj.completed as string[]) : []
  const hotel = dataObj.hotel ?? null

  const cfgObj = (obj.config && typeof obj.config === 'object' ? obj.config : {}) as Record<string, unknown>
  const labels = computeDayLabels(
    typeof cfgObj.startDate === 'string' ? cfgObj.startDate : fallback.config?.startDate,
    cleanDays.length,
  )

  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title
      : typeof cfgObj.title === 'string' && cfgObj.title.trim()
        ? cfgObj.title
        : fallback.title
  const subtitle =
    typeof obj.subtitle === 'string'
      ? obj.subtitle
      : typeof cfgObj.subtitle === 'string'
        ? cfgObj.subtitle
        : fallback.subtitle

  const config: TripConfig = {
    ...fallback.config,
    ...cfgObj,
    title,
    subtitle: subtitle ?? undefined,
    numDays: labels.numDays,
    dayLabels: Array.isArray(cfgObj.dayLabels) ? (cfgObj.dayLabels as string[]) : labels.dayLabels,
    dayTitles: Array.isArray(cfgObj.dayTitles) ? (cfgObj.dayTitles as string[]) : labels.dayTitles,
  }

  const data: TripData = {
    days: cleanDays,
    completed,
    hotel,
    savedAt: new Date().toISOString(),
  }

  return { config, data, title, subtitle }
}

/** Empty out a trip's data for the current day count (Reset). Pure + immutable. */
export function resetTripData(trip: Trip): TripData {
  const days = (trip.data?.days ?? []).map(d => ({ title: d.title, note: d.note || '', stops: [] }))
  return { days, completed: [], hotel: null, savedAt: new Date().toISOString() }
}
