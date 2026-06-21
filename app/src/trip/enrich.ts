import { callAI, textMessage } from './ai'
import type { Stop } from '../types'

export interface StopDetailContent {
  history: string
  facts: string[]
  tips: string
  notice: string
}

/**
 * Build the enrich prompt for a stop. Mirrors the legacy `enrichStopContent`
 * prompt in Trip.html: an expert tour-guide persona writing a short history,
 * a few interesting facts, and practical visitor tips for a specific place,
 * returned as strict JSON. We ask for plain text (no HTML) so the React UI can
 * render it cleanly, and keep the legacy "use these exact coordinates, not a
 * similarly-named place elsewhere" guard when we have a location. The optional
 * `destination` (the trip's city/locality, e.g. "St. Louis, Missouri, United
 * States") grounds the description to the right place and disambiguates
 * same-named landmarks.
 */
export function buildEnrichPrompt(stop: Stop, tripTitle: string, destination = ''): string {
  const placeRef = [stop.name, stop.address].filter(Boolean).join(', ') || stop.name
  const typeHint = stop.type ? ` (a ${stop.type})` : ''
  const cityHint = destination ? ` in ${destination}` : ''
  const tripHint = tripTitle ? ` It's a stop on a trip titled "${tripTitle}".` : ''
  const coordHint =
    stop.lat != null && stop.lng != null
      ? ` The exact location is GPS ${(+stop.lat).toFixed(5)}, ${(+stop.lng).toFixed(5)} — describe the specific place at these coordinates, not a similarly named place elsewhere.`
      : ''

  return `You are an expert, engaging tour guide. Write rich, accurate content for "${placeRef}"${typeHint}${cityHint}.${tripHint}${coordHint}

Cover: a short history (why it matters), a few interesting facts, one "notice" note (what travelers often miss or should look for right in front of them), and practical tips (what to do here).

CRITICAL: Respond with ONLY valid JSON starting with { and ending with }. No markdown, no code fences, no preamble.

{"history":"2-3 short plain-text paragraphs separated by \\n\\n.","facts":["fact with numbers/dates","little-known detail","person/event connection"],"notice":"1-2 sentences: what to look for / what travelers miss.","tips":"1-2 sentences: what to do here."}`
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
 * Generate history / facts / tips for a stop via the shared ai-proxy.
 * Mirrors the legacy enrich flow; returns a normalized `{ history, facts[], tips }`.
 */
export async function generateStopDetail(stop: Stop, tripTitle: string, destination = ''): Promise<StopDetailContent> {
  const prompt = buildEnrichPrompt(stop, tripTitle, destination)
  const text = await callAI(textMessage(prompt), { maxTokens: 700 })
  return parseStopDetail(text)
}
