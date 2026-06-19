import { callAI, textMessage } from './ai'
import type { Stop } from '../types'

export interface StopDetailContent {
  history: string
  facts: string[]
  tips: string
}

/**
 * Build the enrich prompt for a stop. Mirrors the legacy `enrichStopContent`
 * prompt in Trip.html: an expert tour-guide persona writing a short history,
 * a few interesting facts, and practical visitor tips for a specific place,
 * returned as strict JSON. We ask for plain text (no HTML) so the React UI can
 * render it cleanly, and keep the legacy "use these exact coordinates, not a
 * similarly-named place elsewhere" guard when we have a location.
 */
export function buildEnrichPrompt(stop: Stop, tripTitle: string): string {
  const placeRef = [stop.name, stop.address].filter(Boolean).join(', ') || stop.name
  const typeHint = stop.type ? ` (a ${stop.type})` : ''
  const tripHint = tripTitle ? ` It's a stop on a trip titled "${tripTitle}".` : ''
  const coordHint =
    stop.lat != null && stop.lng != null
      ? ` The exact location is GPS ${(+stop.lat).toFixed(5)}, ${(+stop.lng).toFixed(5)} — describe the specific place at these coordinates, not a similarly named place elsewhere.`
      : ''

  return `You are an expert, engaging tour guide. Write rich, accurate content for "${placeRef}"${typeHint}.${tripHint}${coordHint}

Cover: a short history (origins, key events, why it matters), a few genuinely interesting facts, and practical tips for visiting (what to see, when to go, what to order or ask for).

CRITICAL: Respond with ONLY valid JSON starting with { and ending with }. No markdown, no code fences, no preamble.

{"history":"2-3 short paragraphs of plain-text history. Separate paragraphs with \\n\\n.","facts":["Specific fact with numbers or dates","Surprising or little-known detail","Famous person or event connection"],"tips":"1-3 sentences of practical visitor tips."}`
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
  const fallback: StopDetailContent = { history: '', facts: [], tips: '' }
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
      }
    } catch {
      /* fall through to plain-text handling */
    }
  }

  // No usable JSON — use the plain text as history so we never show blank.
  return { history: raw, facts: [], tips: '' }
}

/**
 * Generate history / facts / tips for a stop via the shared ai-proxy.
 * Mirrors the legacy enrich flow; returns a normalized `{ history, facts[], tips }`.
 */
export async function generateStopDetail(stop: Stop, tripTitle: string): Promise<StopDetailContent> {
  const prompt = buildEnrichPrompt(stop, tripTitle)
  const text = await callAI(textMessage(prompt), { maxTokens: 700 })
  return parseStopDetail(text)
}
