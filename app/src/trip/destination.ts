import { callAI, textMessage } from './ai'
import type { Stop } from '../types'

/** Stops we can infer a destination from — just the locating fields. */
type LocatingStop = Pick<Stop, 'name' | 'address' | 'lat' | 'lng' | 'coords'>

const NON_ANSWERS = new Set(['unknown', 'none', 'n/a', 'na', 'null'])

/**
 * Infer a trip's destination from its stops — for legacy trips that predate the
 * `config.destination` field (their cover/landmark lookups otherwise search by a
 * fuzzy title like "stl" and mis-resolve). The stops' names, addresses and
 * coordinates pin the real city even when the trip name is an abbreviation.
 *
 * Asks the model for one clean label; on ANY failure (the founder/credits AI
 * gate throws, network, or an empty/garbage parse) it falls back to parsing the
 * stops' `address` fields. Never throws — returns null when nothing is usable.
 */
export async function inferDestination(stops: LocatingStop[], tripTitle: string): Promise<string | null> {
  const lines = (stops ?? []).slice(0, 8).map(stopDigestLine).filter(Boolean)
  if (lines.length === 0) return destinationFromStops(stops)
  try {
    const text = await callAI(textMessage(buildDestinationPrompt(lines, tripTitle)), { maxTokens: 60 })
    const parsed = parseDestinationLabel(text)
    if (parsed) return parsed
  } catch {
    /* AI gate (403/429) / network — fall through to the deterministic fallback */
  }
  return destinationFromStops(stops)
}

/** One "- Name — address (lat, lng)" digest line for a stop, or '' if unusable. */
function stopDigestLine(stop: LocatingStop): string {
  const name = (stop.name ?? '').trim()
  if (!name) return ''
  const bits = [name]
  const addr = (stop.address ?? '').trim()
  if (addr) bits.push(addr)
  const lat = stop.lat ?? stop.coords?.lat
  const lng = stop.lng ?? stop.coords?.lng
  if (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  ) {
    bits.push(`(${lat.toFixed(4)}, ${lng.toFixed(4)})`)
  }
  return `- ${bits.join(' — ')}`
}

/** The destination-classifier prompt. A plain-text reply keeps the parse trivial. */
export function buildDestinationPrompt(stopLines: string[], tripTitle: string): string {
  return `You are a geography classifier. Given the stops on a travel itinerary, identify the single real-world destination (city) they are in.

Stops:
${stopLines.join('\n')}

Rules:
- Use the stop names, addresses and coordinates to pin the actual city. The trip is titled "${tripTitle}" — it may be an abbreviation or nickname, so use it only as a weak hint, never as the answer.
- Reply with ONE clean destination label like "City, State/Region, Country" (e.g. "St. Louis, Missouri, United States"). Omit the state/region if it doesn't apply.
- If the stops are in different cities or you cannot tell, reply with exactly: unknown

Respond with ONLY the destination label (or "unknown") — no quotes, no preamble.`
}

/**
 * Parse the model's reply into a clean destination label, or null. Tolerates a
 * fenced/JSON reply defensively, strips wrapping quotes / a "Destination:" prefix
 * / a trailing period, and rejects non-answers and over-long paragraphs. Pure.
 */
export function parseDestinationLabel(text: string): string | null {
  let s = (text || '').replace(/```json|```/g, '').trim()
  if (!s) return null
  // Defensive: a JSON string or { "destination": "..." } reply.
  if (s.startsWith('{') || s.startsWith('[') || s.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(s)
      if (typeof parsed === 'string') s = parsed
      else if (parsed && typeof parsed === 'object' && typeof (parsed as { destination?: unknown }).destination === 'string') {
        s = (parsed as { destination: string }).destination
      }
    } catch {
      /* not JSON — take the text as-is */
    }
  }
  s = (s.split('\n').map(l => l.trim()).find(Boolean) ?? '').replace(/^destination\s*:\s*/i, '').trim()
  // Peel wrapping quotes and a trailing period (in any order) until stable, so
  // `"Tokyo, Japan".` and `Tokyo, Japan.` and `"Tokyo, Japan"` all land clean.
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(/^["'`]+/, '').replace(/["'`]+$/, '').replace(/\.+$/, '').trim()
  }
  if (!s || s.length > 80) return null
  if (NON_ANSWERS.has(s.toLowerCase())) return null
  return s
}

/**
 * Deterministic fallback: derive a destination from the stops' `address` fields
 * (shaped "street, city[, ST]" — see `suggest.ts` `toStop`). Drops the street
 * segment, tallies the locality tail, and returns the most common one (a single
 * outlier never wins). Null when no stop has a usable address. Pure.
 */
export function destinationFromStops(stops: Pick<Stop, 'address'>[]): string | null {
  const tally = new Map<string, { label: string; n: number }>()
  for (const stop of stops ?? []) {
    const addr = (stop.address ?? '').trim()
    if (!addr) continue
    const parts = addr.split(',').map(p => p.trim()).filter(Boolean)
    if (parts.length === 0) continue
    const locality = (parts.length >= 2 ? parts.slice(1) : parts).join(', ')
    if (!locality) continue
    const key = locality.toLowerCase()
    const cur = tally.get(key)
    if (cur) cur.n += 1
    else tally.set(key, { label: locality, n: 1 })
  }
  let best: { label: string; n: number } | null = null
  for (const v of tally.values()) if (!best || v.n > best.n) best = v
  return best?.label ?? null
}
