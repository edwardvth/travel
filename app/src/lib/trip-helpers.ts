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

/**
 * Derive a URL/PK slug from a trip title. Lowercases, trims, collapses runs of
 * whitespace + punctuation into single dashes, strips anything outside
 * `[a-z0-9-]`, and trims/collapses leftover dashes. A title with no usable
 * ASCII (e.g. "京都") yields an empty result, so we fall back to a short random
 * token — the id must always be a valid, non-empty slug. (Collisions are then
 * resolved by retry-with-suffix at insert time.)
 */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // whitespace + punctuation runs → single dash
    .replace(/-+/g, '-') // collapse dash runs
    .replace(/^-|-$/g, '') // trim leading/trailing dashes
  return slug || `trip-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Secret keys that must never be persisted into a trip's `config`. Legacy trips
 * carried per-trip API keys (`anthropicKey`, old `aiKey`); the AI key now lives
 * server-side in the `ai-proxy` edge function. See Task 4 in the new-trip spec.
 */
const SECRET_CONFIG_KEYS = ['anthropicKey', 'aiKey'] as const

/**
 * Return a shallow clone of `config` with the secret-key denylist removed,
 * preserving every other key. No-op (still cloned) when no secret is present.
 * Applied on every persist so the client can never write a secret into the
 * public-readable `trips` table. Pure + unit-tested.
 */
export function sanitizeConfig(config: TripConfig): TripConfig {
  const clean = { ...config }
  for (const key of SECRET_CONFIG_KEYS) delete clean[key]
  return clean
}

export interface NewTripInput { slug: string; title: string; subtitle: string; start: string; end: string; destination?: string; notes?: string }
export interface NewTripPayload { id: string; title: string; subtitle: string; config: TripConfig; data: TripData }

export function buildNewTripPayload(input: NewTripInput): NewTripPayload {
  const { slug, title, subtitle, start, end, destination, notes } = input
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
  // Build config additively — omit destination/notes when empty (matches the
  // not-writing-empty-keys pattern), then scrub any secret keys before persist.
  const config: TripConfig = { title, subtitle, numDays, dayLabels, dayTitles, startDate: start || '' }
  if (destination && destination.trim()) config.destination = destination.trim()
  if (notes && notes.trim()) config.notes = notes.trim()
  return {
    id: slug, title, subtitle,
    config: sanitizeConfig(config),
    data: { days, completed: [], hotel: null, savedAt: new Date().toISOString() },
  }
}

export function formatDateRange(t: Trip): string {
  const labels = t.config?.dayLabels || []
  const n = t.config?.numDays || t.data?.days?.length || 0
  return labels.length >= 2 ? `${labels[0]} – ${labels[labels.length - 1]}` : `${n} days`
}
