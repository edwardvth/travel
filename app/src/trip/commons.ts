/**
 * Wikimedia Commons hero-image fallback via the free MediaWiki File-namespace
 * search.
 *
 * No API key, CORS-enabled with `origin=*`. Where Wikipedia *pageimages* only
 * resolves notable landmarks/museums (places that have an article), the Commons
 * File-namespace search (`gsrnamespace=6`) finds free media for a far wider set
 * of places — including commercial spots (cafés, shops) that aren't on
 * Wikipedia. We take the first matching file's `imageinfo` thumbnail.
 *
 * The URL builder and parser are pure (unit-tested); `fetchCommonsImage` wraps
 * them with a guarded `fetch` that never throws — any miss returns null so the
 * hero resolver advances to the next layer (Google Places) or the placeholder.
 * Mirrors `landmark.ts` / `wiki.ts` defensive style.
 */

/** Longest-edge thumbnail size requested from Commons, in px. */
export const COMMONS_THUMB_SIZE = 800

/**
 * Build the Commons File-namespace search URL for `query`. Uses
 * `generator=search` with `gsrnamespace=6` (the File namespace) so the result
 * pages are media files, and `prop=imageinfo&iiprop=url&iiurlwidth` to pull a
 * scaled thumbnail URL. CORS is opened with `origin=*`. The query is
 * URL-encoded.
 */
export function commonsImageUrl(query: string): string {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '1',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: String(COMMONS_THUMB_SIZE),
    format: 'json',
    origin: '*',
  })
  return `https://en.wikipedia.org/w/api.php?${params.toString()}`
}

/**
 * Safely extract the first page's `imageinfo[0].thumburl` (preferred — the
 * scaled thumbnail) or `url` (the full-size original, as a fallback) from a
 * Commons query response. `query.pages` is an object keyed by page id; we take
 * the first entry. Returns null on any miss or shape error (no pages, no
 * imageinfo, non-string url, garbage input). Mirrors `parseLandmarkImage`.
 */
export function parseCommonsImage(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null
  const query = (json as { query?: unknown }).query
  if (typeof query !== 'object' || query === null) return null
  const pages = (query as { pages?: unknown }).pages
  if (typeof pages !== 'object' || pages === null) return null

  const first = Object.values(pages as Record<string, unknown>)[0]
  if (typeof first !== 'object' || first === null) return null
  const imageinfo = (first as { imageinfo?: unknown }).imageinfo
  if (!Array.isArray(imageinfo) || imageinfo.length === 0) return null
  const info = imageinfo[0]
  if (typeof info !== 'object' || info === null) return null

  const thumburl = (info as { thumburl?: unknown }).thumburl
  if (typeof thumburl === 'string' && thumburl) return thumburl
  const url = (info as { url?: unknown }).url
  if (typeof url === 'string' && url) return url
  return null
}

/**
 * Fetch a Commons file thumbnail URL for `query`, or null. Trims and guards an
 * empty query. Any failure (network, non-OK status, bad JSON, no imageinfo)
 * resolves to null — never throws. An optional `AbortSignal` lets callers
 * cancel in-flight requests.
 */
export async function fetchCommonsImage(query: string, signal?: AbortSignal): Promise<string | null> {
  const q = query.trim()
  if (!q) return null
  try {
    const res = await fetch(commonsImageUrl(q), signal ? { signal } : undefined)
    if (!res.ok) return null
    const json: unknown = await res.json()
    return parseCommonsImage(json)
  } catch {
    return null
  }
}

/**
 * Try an ordered list of queries (most specific first) and return the first
 * Commons image found, or null if every attempt misses. Each attempt uses the
 * never-throwing `fetchCommonsImage`, so this never throws either. Empty /
 * whitespace queries are skipped. Mirrors `fetchFirstLandmarkImage` so the hero
 * resolver can run the SAME ordered query list through this layer.
 */
export async function fetchFirstCommonsImage(queries: string[], signal?: AbortSignal): Promise<string | null> {
  for (const query of queries) {
    if (!query || !query.trim()) continue
    const url = await fetchCommonsImage(query, signal)
    if (url) return url
  }
  return null
}
