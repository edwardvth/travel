import type { Stop } from '../types'

/**
 * Parse an AI-supplied duration value into whole minutes, or `undefined`.
 * Accepts `"90 min"`, `"45m"`, `"1h"`, `"1h 30m"`, `"1 hour 30 min"`, `"1.5h"`,
 * `"2 hours"`, a bare `"60"` / `60`. Garbage or non-positive → `undefined`.
 * Pure + unit-tested.
 */
export function normalizeDuration(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined
  }
  if (typeof value !== 'string') return undefined
  const s = value.trim().toLowerCase()
  if (!s) return undefined
  let total = 0
  let matched = false
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/)
  if (h) { total += Math.round(parseFloat(h[1]) * 60); matched = true }
  const m = s.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/)
  if (m) { total += parseInt(m[1], 10); matched = true }
  if (matched) return total > 0 ? total : undefined
  const n = s.match(/^(\d+(?:\.\d+)?)$/)
  if (n) { const v = Math.round(parseFloat(n[1])); return v > 0 ? v : undefined }
  return undefined
}

/**
 * A sensible default visit length (minutes) for a stop with no duration,
 * mirroring legacy travel-guide.ai's lookup table. Keyed off `type` + `name`
 * (meal/landmark cues), then `kind`, else 60. Pure + unit-tested.
 */
export function defaultDurationMinutes(stop: Pick<Stop, 'kind' | 'type' | 'name'>): number {
  const hay = `${stop.type ?? ''} ${stop.name ?? ''}`.toLowerCase()
  if (/breakfast|coffee|caf[eé]|bakery|patisserie|tea ?room|tea salon/.test(hay)) return 45
  if (/lunch|brunch/.test(hay)) return 75
  if (/dinner|restaurant|bistro|brasserie|trattoria|dining|supper/.test(hay)) return 90
  if (/museum|gallery|exhibit/.test(hay)) return 90
  if (/theatre|theater|concert|opera|show/.test(hay)) return 150
  if (/park|garden|botanical/.test(hay)) return 60
  if (/walk|stroll|promenade|trail/.test(hay)) return 30
  if (stop.kind === 'eat') return 75
  return 60
}

/** Fill `duration` (immutably) for any stop missing one. Pure + unit-tested. */
export function ensureDurations(stops: Stop[]): Stop[] {
  return stops.map(s => (s.duration === undefined ? { ...s, duration: defaultDurationMinutes(s) } : s))
}
