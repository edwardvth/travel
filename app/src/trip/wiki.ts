/**
 * Wikipedia plain-text intro extracts via the free MediaWiki query API.
 *
 * No API key, CORS-enabled with `origin=*`. We search Wikipedia for a place
 * (always "Name, Destination" so same-named landmarks disambiguate) and pull
 * the first matching article's lead-section extract as plain text. This is used
 * as strong factual *grounding* for AI synthesis — never shown raw without the
 * AI's tab-shaped rewrite, and never invented.
 *
 * The URL builder and parser are pure (unit-tested); `fetchWikiExtract` wraps
 * them with a guarded `fetch` that never throws — any miss returns null so the
 * enrichment chain degrades gracefully.
 */

/** Number of intro sentences requested from Wikipedia. */
export const WIKI_EXTRACT_SENTENCES = 6

/**
 * Build the Wikipedia query URL for a plain-text intro `extract`. Uses
 * `generator=search` so a fuzzy place name still resolves to a real article,
 * `prop=extracts` with `exintro`/`explaintext` for the lead section as plain
 * text, and `exsentences` to cap length. CORS is opened with `origin=*`. The
 * query is URL-encoded.
 */
export function wikiExtractUrl(query: string): string {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '1',
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    exsentences: String(WIKI_EXTRACT_SENTENCES),
    format: 'json',
    origin: '*',
  })
  return `https://en.wikipedia.org/w/api.php?${params.toString()}`
}

/**
 * Safely extract the first page's `extract` string from a Wikipedia query
 * response. `query.pages` is an object keyed by page id; we take the first
 * entry. Returns the trimmed extract, or null on any miss or shape error (no
 * pages, no extract, empty/non-string extract, garbage input). Mirrors
 * `parseLandmarkImage`'s defensive shape-checking.
 */
export function parseWikiExtract(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null
  const query = (json as { query?: unknown }).query
  if (typeof query !== 'object' || query === null) return null
  const pages = (query as { pages?: unknown }).pages
  if (typeof pages !== 'object' || pages === null) return null

  const first = Object.values(pages as Record<string, unknown>)[0]
  if (typeof first !== 'object' || first === null) return null
  const extract = (first as { extract?: unknown }).extract
  if (typeof extract !== 'string') return null
  const trimmed = extract.trim()
  return trimmed ? trimmed : null
}

/**
 * Fetch a plain-text Wikipedia intro extract for `query`, or null. Trims and
 * guards an empty query. Any failure (network, non-OK status, bad JSON, no
 * extract) resolves to null — never throws. An optional `AbortSignal` lets
 * callers cancel in-flight requests.
 */
export async function fetchWikiExtract(query: string, signal?: AbortSignal): Promise<string | null> {
  const q = query.trim()
  if (!q) return null
  try {
    const res = await fetch(wikiExtractUrl(q), signal ? { signal } : undefined)
    if (!res.ok) return null
    const json: unknown = await res.json()
    return parseWikiExtract(json)
  } catch {
    return null
  }
}
