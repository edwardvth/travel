import { MAX_REVIEW_CANDIDATES } from './constants'
import type { Candidate } from './types'

const finite = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) ? n : undefined
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/**
 * Parse a Google Places (New) `places:searchText` response into Candidate[],
 * in Google's returned order, capped to MAX_REVIEW_CANDIDATES. Pure; never throws.
 * `distanceM` is added later by scoreMatch (needs the stop coords).
 */
export function parseTextSearch(json: unknown): Candidate[] {
  if (typeof json !== 'object' || json === null) return []
  const places = (json as { places?: unknown }).places
  if (!Array.isArray(places)) return []
  const out: Candidate[] = []
  for (const p of places) {
    if (typeof p !== 'object' || p === null) continue
    const o = p as Record<string, unknown>
    const placeId = str(o.id)
    const name = str((o.displayName as { text?: unknown })?.text)
    if (!placeId || !name) continue
    const loc = o.location as { latitude?: unknown; longitude?: unknown } | undefined
    const address = str(o.formattedAddress)
    out.push({
      placeId,
      name,
      ...(address ? { address } : {}),
      lat: finite(loc?.latitude),
      lng: finite(loc?.longitude),
      types: strArr(o.types),
    })
    if (out.length >= MAX_REVIEW_CANDIDATES) break
  }
  return out
}
