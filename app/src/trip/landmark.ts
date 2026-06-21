/**
 * Landmark images via the free Wikipedia search + pageimages API.
 *
 * No API key, CORS-enabled with `origin=*`. We search Wikipedia for the place
 * (e.g. "St. Louis Missouri" → the Gateway Arch) and take the first matching
 * page's representative thumbnail. The returned URL is a public
 * `https://upload.wikimedia.org/...` image we can hotlink directly.
 *
 * The URL builder and parser are pure (unit-tested); `fetchLandmarkImage`
 * wraps them with a guarded `fetch` that never throws — any miss returns null
 * so callers render a tasteful placeholder rather than a broken image.
 */

/** Longest-edge thumbnail size requested from Wikipedia, in px. */
export const LANDMARK_THUMB_SIZE = 800

/**
 * Build the Wikipedia search+pageimages query URL for `query`. Uses
 * `generator=search` so a fuzzy place name still resolves to a real article,
 * and `prop=pageimages` to pull that article's lead thumbnail. CORS is opened
 * with `origin=*`. The query is URL-encoded.
 */
export function landmarkSearchUrl(query: string): string {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '1',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: String(LANDMARK_THUMB_SIZE),
    format: 'json',
    origin: '*',
  })
  return `https://en.wikipedia.org/w/api.php?${params.toString()}`
}

/**
 * Safely extract the first page's `thumbnail.source` from a Wikipedia
 * query response. `query.pages` is an object keyed by page id; we take the
 * first entry. Returns null on any miss or shape error (no pages, no
 * thumbnail, non-string source, garbage input).
 */
export function parseLandmarkImage(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null
  const query = (json as { query?: unknown }).query
  if (typeof query !== 'object' || query === null) return null
  const pages = (query as { pages?: unknown }).pages
  if (typeof pages !== 'object' || pages === null) return null

  const first = Object.values(pages as Record<string, unknown>)[0]
  if (typeof first !== 'object' || first === null) return null
  const thumbnail = (first as { thumbnail?: unknown }).thumbnail
  if (typeof thumbnail !== 'object' || thumbnail === null) return null
  const source = (thumbnail as { source?: unknown }).source
  if (typeof source !== 'string' || !source) return null
  return source
}

/**
 * Fetch a representative landmark image URL for `query`, or null. Trims and
 * guards an empty query. Any failure (network, non-OK status, bad JSON, no
 * thumbnail) resolves to null — never throws.
 */
export async function fetchLandmarkImage(query: string): Promise<string | null> {
  const q = query.trim()
  if (!q) return null
  try {
    const res = await fetch(landmarkSearchUrl(q))
    if (!res.ok) return null
    const json: unknown = await res.json()
    return parseLandmarkImage(json)
  } catch {
    return null
  }
}

/**
 * Try an ordered list of queries (most specific first) and return the first
 * image found, or null if every attempt misses. Each attempt uses the
 * never-throwing `fetchLandmarkImage`, so this never throws either. Empty /
 * whitespace queries are skipped. Lets a recognizable place fall back from
 * "Name, Destination" → "Name, City" → "Name" before showing a placeholder.
 */
export async function fetchFirstLandmarkImage(queries: string[]): Promise<string | null> {
  for (const query of queries) {
    if (!query || !query.trim()) continue
    const url = await fetchLandmarkImage(query)
    if (url) return url
  }
  return null
}
