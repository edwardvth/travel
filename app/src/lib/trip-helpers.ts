import type { Trip, TripConfig, TripData } from '../types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PROFANITY = /(fuck|shit|bitch|cunt|nigg|faggot|whore|slut|porn|rape|asshole|retard|kike|chink|wetback|beaner|tranny|twat|jizz|dildo|blowjob|handjob|hitler)/i

export function tripStart(t: Trip): string { return t.config?.startDate || '9999-12-31' }

export function tripEnd(t: Trip): string {
  const sd = t.config?.startDate
  if (!sd) return '9999-12-31'
  const n = t.config?.numDays || t.data?.days?.length || 1
  const d = new Date(sd + 'T12:00:00')
  d.setDate(d.getDate() + Math.max(0, n - 1))
  return d.toISOString().slice(0, 10)
}

export function isPastTrip(t: Trip): boolean {
  return tripEnd(t) < new Date().toISOString().slice(0, 10)
}

export function byTripDate(a: Trip, b: Trip): number {
  const d = tripStart(a).localeCompare(tripStart(b))
  return d !== 0 ? d : (b.updated_at || '').localeCompare(a.updated_at || '')
}

export function sanitizeSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_-]/g, '')
}
export function isValidSlug(s: string): boolean { return /^[a-z0-9-]+$/i.test(s) }
export function hasProfanity(...vals: string[]): boolean { return vals.some(v => PROFANITY.test(v)) }

export interface NewTripInput { slug: string; title: string; subtitle: string; start: string; end: string }
export interface NewTripPayload { id: string; title: string; subtitle: string; config: TripConfig; data: TripData }

export function buildNewTripPayload(input: NewTripInput): NewTripPayload {
  const { slug, title, subtitle, start, end } = input
  let numDays = 4
  const dayLabels: string[] = []
  const dayTitles: string[] = []
  if (start && end) {
    const [sy, smo, sd] = start.split('-').map(Number)
    const [ey, emo, ed] = end.split('-').map(Number)
    numDays = Math.max(1, Math.round((+new Date(ey, emo - 1, ed) - +new Date(sy, smo - 1, sd)) / 86_400_000) + 1)
    for (let i = 0; i < numDays; i++) {
      const dt = new Date(sy, smo - 1, sd + i)
      const lbl = MONTHS[dt.getMonth()] + ' ' + dt.getDate()
      dayLabels.push(lbl); dayTitles.push(lbl + ' · Day ' + (i + 1))
    }
  } else {
    for (let i = 0; i < numDays; i++) { dayLabels.push('Day ' + (i + 1)); dayTitles.push('Day ' + (i + 1)) }
  }
  const days = dayLabels.map((_, i) => ({ title: dayTitles[i], note: '', stops: [] }))
  return {
    id: slug, title, subtitle,
    config: { title, subtitle, numDays, dayLabels, dayTitles, startDate: start || '' },
    data: { days, completed: [], hotel: null, savedAt: new Date().toISOString() },
  }
}

export function formatDateRange(t: Trip): string {
  const labels = t.config?.dayLabels || []
  const n = t.config?.numDays || t.data?.days?.length || 0
  return labels.length >= 2 ? `${labels[0]} – ${labels[labels.length - 1]}` : `${n} days`
}
