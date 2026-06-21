import { callAI, textMessage } from './ai'
import { fetchWikiExtract } from './wiki'
import { stopLandmarkQuery } from './landmark-context'
import type { Stop } from '../types'

export interface StopDetailContent {
  history: string
  facts: string[]
  tips: string
  notice: string
}

/** Optional grounding passed into the enrich prompt (Group E layered chain). */
export interface EnrichGrounding {
  /** A plain-text Wikipedia intro extract for this place (free REST), if any. */
  source?: string
}

/**
 * Normalize a Wikipedia / AI plain-text extract for display or grounding:
 * collapse runs of spaces/tabs (but keep paragraph breaks), strip a couple of
 * common wiki artefacts (parenthetical pronunciation/listen markers), and trim.
 * Pure + unit-tested.
 */
export function cleanWikiText(text: string): string {
  const raw = (text || '').trim()
  if (!raw) return ''
  return raw
    // Drop parenthetical IPA / pronunciation / listen markers that read as noise.
    .replace(/\((?:[^()]*\b(?:pronunciation|pronounced|listen|IPA|i\/)[^()]*)\)/gi, '')
    // Collapse horizontal whitespace runs without flattening paragraph breaks.
    .replace(/[^\S\n]+/g, ' ')
    // Collapse 3+ newlines to a paragraph break.
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ *\n */g, '\n')
    .trim()
}

/**
 * Build a compact "what we already know" block from metadata already on the
 * stop — `type`, `address`, coords (`lat`/`lng` or nested `coords`), `note`, and
 * any cached `wikiTitle`. No external calls. Returns an empty string when the
 * stop carries nothing useful. Pure + unit-tested.
 */
export function buildStopContext(stop: Stop): string {
  const lines: string[] = []
  if (stop.type) lines.push(`Type: ${stop.type}`)
  if (stop.address) lines.push(`Address: ${stop.address}`)
  const lat = stop.lat ?? stop.coords?.lat
  const lng = stop.lng ?? stop.coords?.lng
  if (lat != null && lng != null) lines.push(`Coordinates: ${lat}, ${lng}`)
  if (stop.wikiTitle) lines.push(`Wikipedia article: ${stop.wikiTitle}`)
  if (stop.note) lines.push(`Traveller note: ${stop.note}`)
  return lines.join('\n')
}

/**
 * Build the enrich prompt for a stop. An expert tour-guide persona writing the
 * three Guide tabs — **Story** (why it matters), **Interesting Facts**
 * (trivia/dates/architecture, the `notice`/facts), and **Experience** (how to
 * experience it, the `tips`) — returned as strict JSON, plain text (no HTML).
 *
 * Group E grounding: when a Wikipedia `source` extract and/or stop metadata are
 * available they're folded in as **source material**, and the model is
 * explicitly instructed to use ONLY the provided facts plus well-established
 * public knowledge, to leave any unsupported section EMPTY, and to never invent
 * specifics (dates, names, numbers). The legacy coordinate guard is kept.
 *
 * The optional `destination` (the trip's city/locality, e.g. "St. Louis,
 * Missouri, United States") grounds the description to the right place and
 * disambiguates same-named landmarks.
 */
export function buildEnrichPrompt(
  stop: Stop,
  tripTitle: string,
  destination = '',
  grounding: EnrichGrounding = {},
): string {
  const placeRef = [stop.name, stop.address].filter(Boolean).join(', ') || stop.name
  const typeHint = stop.type ? ` (a ${stop.type})` : ''
  const cityHint = destination ? ` in ${destination}` : ''
  const tripHint = tripTitle ? ` It's a stop on a trip titled "${tripTitle}".` : ''
  const coordHint =
    stop.lat != null && stop.lng != null
      ? ` The exact location is GPS ${(+stop.lat).toFixed(5)}, ${(+stop.lng).toFixed(5)} — describe the specific place at these coordinates, not a similarly named place elsewhere.`
      : ''

  const source = (grounding.source || '').trim()
  const context = buildStopContext(stop)
  const sourceBlock = source
    ? `\n\nSOURCE MATERIAL (from Wikipedia — treat as authoritative facts):\n"""\n${source}\n"""`
    : ''
  const contextBlock = context ? `\n\nWHAT WE ALREADY KNOW ABOUT THIS STOP:\n${context}` : ''

  return `You are an expert, engaging tour guide. Write rich, accurate content for "${placeRef}"${typeHint}${cityHint}.${tripHint}${coordHint}${sourceBlock}${contextBlock}

Write three sections for this place:
- "history" = Story: why this place matters — its significance, character, and the story behind it (2-3 short plain-text paragraphs).
- "notice" = Interesting Facts: trivia, dates, architecture, or little-known details a curious traveller would enjoy.
- "tips" = Experience: how to actually experience it here — what to do, see, or look for in front of you.

GROUNDING RULES (critical — accuracy over completeness):
- Use ONLY the source material above plus well-established, widely-known public knowledge about this exact place.
- Do NOT invent specifics — no made-up dates, names, numbers, or events. If you are not sure, leave it out.
- If a section cannot be supported by the source or solid public knowledge, return it as an EMPTY string (or empty array for "facts"). An empty section is correct; a fabricated one is not.

CRITICAL: Respond with ONLY valid JSON starting with { and ending with }. No markdown, no code fences, no preamble.

{"history":"Story — why it matters, plain-text paragraphs separated by \\n\\n (or empty).","facts":["fact with numbers/dates","little-known detail"],"notice":"Interesting Facts — 1-2 sentences of trivia/dates/architecture (or empty).","tips":"Experience — 1-2 sentences on how to experience it (or empty)."}`
}

/** Coerce an unknown `facts` value into a clean string array (legacy guards against a bare string). */
export function coerceFacts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return []
    // A single string may itself be a list (split on common separators / lines).
    const parts = s.split(/\n+|\s*[|•]\s*/).map(p => p.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean)
    return parts.length > 1 ? parts : [s]
  }
  return []
}

/**
 * Parse the model's text into `{ history, facts[], tips }`. Robust to code
 * fences and preamble: strips ```json fences, slices the first `{` to the last
 * `}`, and JSON.parses. Falls back to treating the raw text as the history when
 * no JSON is present. Always returns the right shape (facts coerced to array).
 */
export function parseStopDetail(text: string): StopDetailContent {
  const fallback: StopDetailContent = { history: '', facts: [], tips: '', notice: '' }
  const raw = (text || '').trim()
  if (!raw) return fallback

  let candidate = raw.replace(/```json|```/g, '').trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    candidate = candidate.slice(start, end + 1)
    try {
      const info = JSON.parse(candidate) as Record<string, unknown>
      return {
        history: typeof info.history === 'string' ? info.history.trim() : '',
        facts: coerceFacts(info.facts),
        tips: typeof info.tips === 'string' ? info.tips.trim() : '',
        notice: typeof info.notice === 'string' ? info.notice.trim() : '',
      }
    } catch {
      /* fall through to plain-text handling */
    }
  }

  // No usable JSON — use the plain text as history so we never show blank.
  return { history: raw, facts: [], tips: '', notice: '' }
}

/**
 * Generate the three Guide tabs for a stop via a layered, Wikipedia-first chain
 * (Group E). Always returns the `{ history, facts[], notice, tips }` shape:
 *
 *  1. **Wikipedia extract** — `fetchWikiExtract(stopLandmarkQuery(name, dest))`
 *     for strong factual grounding (free REST, never throws → null).
 *  2. **Existing stop metadata** — folded into the prompt via `buildStopContext`
 *     (type/address/coords/note/cached wikiTitle). No new external calls.
 *  3. **AI synthesis** — the existing `ai-proxy` (`callAI`) is given the extract
 *     + metadata as source material and asked to write Story / Interesting Facts
 *     / Experience using ONLY provided facts + well-established public knowledge,
 *     leaving unsupported sections empty and never inventing specifics.
 *  4. **Fallback** — if the AI call fails but Wikipedia had content, use the
 *     cleaned extract as Story so it's never blank; otherwise return all-empty.
 *     We never hallucinate.
 */
export async function generateStopDetail(stop: Stop, tripTitle: string, destination = ''): Promise<StopDetailContent> {
  const empty: StopDetailContent = { history: '', facts: [], tips: '', notice: '' }

  // 1. Wikipedia grounding (Name + Destination), guarded — never throws.
  const source = (await fetchWikiExtract(stopLandmarkQuery(stop.name, destination))) ?? ''

  // 2 + 3. Metadata-folded, grounded AI synthesis via the existing ai-proxy.
  const prompt = buildEnrichPrompt(stop, tripTitle, destination, { source })
  try {
    const text = await callAI(textMessage(prompt), { maxTokens: 700 })
    return parseStopDetail(text)
  } catch {
    // 4. AI failed. If Wikipedia gave us facts, surface the cleaned extract as
    //    Story so the traveller still gets grounded content; else empty.
    const cleaned = cleanWikiText(source)
    return cleaned ? { ...empty, history: cleaned } : empty
  }
}
