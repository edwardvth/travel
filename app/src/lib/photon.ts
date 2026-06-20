/**
 * Destination autocomplete via Photon (komoot) — an OSM-backed geocoder.
 *
 * No API key, CORS-enabled, purpose-built for typeahead, matching Voyager's
 * free/no-client-key ethos. We query Photon for place-level results
 * (cities/towns/regions/countries) and assemble a clean human label like
 * "St. Louis, Missouri, United States".
 *
 * The URL builder and parser are pure (unit-tested); `fetchPhotonPlaces`
 * wraps them with a guarded `fetch` that never throws — any miss returns `[]`
 * so the caller renders no suggestions rather than an error. Mirrors the
 * structure of `trip/landmark.ts`.
 */

/** OSM place classes we keep — drops POIs, streets, addresses, etc. */
const PLACE_VALUES = new Set([
  'city', 'town', 'village', 'hamlet', 'state', 'region', 'county', 'country',
])

/**
 * Build the Photon autocomplete URL for `query`. Caps results at 6 and asks for
 * English labels. The query is URL-encoded.
 */
export function photonSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query, limit: '6', lang: 'en' })
  return `https://photon.komoot.io/api?${params.toString()}`
}

/** A single Photon GeoJSON feature's `properties`, loosely typed. */
interface PhotonProps {
  type?: unknown
  osm_value?: unknown
  name?: unknown
  city?: unknown
  state?: unknown
  county?: unknown
  region?: unknown
  country?: unknown
}

/** Whether a feature is a place-level result (city/town/region/country/…). */
function isPlace(props: PhotonProps): boolean {
  const candidates = [props.osm_value, props.type]
  return candidates.some(v => typeof v === 'string' && PLACE_VALUES.has(v))
}

/** Coerce a property to a trimmed string, or '' for anything non-string/empty. */
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Assemble a clean "<name>, <state/region>, <country>" label from a feature's
 * properties, dropping any missing parts. The middle part prefers
 * state → region → county. Returns '' when there's no usable name.
 */
function labelOf(props: PhotonProps): string {
  const name = str(props.name) || str(props.city)
  if (!name) return ''
  const mid = str(props.state) || str(props.region) || str(props.county)
  const country = str(props.country)
  return [name, mid, country].filter(Boolean).join(', ')
}

/**
 * Parse a Photon GeoJSON response into a de-duplicated list of clean place
 * labels. Keeps only place-level features, assembles each label, and de-dupes
 * case-insensitively (preserving first-seen casing/order). Returns `[]` on any
 * miss or shape error — never throws.
 */
export function parsePhotonPlaces(json: unknown): string[] {
  if (typeof json !== 'object' || json === null) return []
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features)) return []

  const labels: string[] = []
  const seen = new Set<string>()
  for (const feature of features) {
    if (typeof feature !== 'object' || feature === null) continue
    const props = (feature as { properties?: unknown }).properties
    if (typeof props !== 'object' || props === null) continue
    const p = props as PhotonProps
    if (!isPlace(p)) continue
    const label = labelOf(p)
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    labels.push(label)
  }
  return labels
}

/**
 * Fetch place suggestions for `query`, or `[]`. Trims and guards an empty
 * query. An optional `signal` lets the caller abort an in-flight request. Any
 * failure (network, non-OK status, bad JSON, garbage) resolves to `[]` — never
 * throws. (An aborted fetch rejects, which is swallowed here as a miss.)
 */
export async function fetchPhotonPlaces(query: string, signal?: AbortSignal): Promise<string[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const res = await fetch(photonSearchUrl(q), { signal })
    if (!res.ok) return []
    const json: unknown = await res.json()
    return parsePhotonPlaces(json)
  } catch {
    return []
  }
}
