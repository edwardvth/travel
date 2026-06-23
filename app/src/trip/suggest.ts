import { callAI, textMessage } from './ai'
import type { Stop, StopKind } from '../types'
import { normalizeDuration } from './duration'

export interface SuggestContext {
  tripTitle?: string
  /** Optional locality hint (e.g. a city / area) to anchor the search. */
  near?: string
  /** Bias the search toward a category (do = sights, eat = food, stay = lodging). */
  kind?: StopKind
}

/** A short phrase describing the kind of place to bias the suggest prompt. */
function kindBias(kind: StopKind | undefined): string {
  if (kind === 'eat') return 'Focus on places to eat and drink — restaurants, cafés, bars and food spots.'
  if (kind === 'stay') return 'Focus on places to stay — hotels, ryokans, guesthouses and other lodging.'
  if (kind === 'do') return 'Focus on things to do — sights, attractions, museums, parks and experiences.'
  return ''
}

/**
 * Build the place-search prompt. Mirrors the legacy Trip.html `runSuggest`
 * intent: a travel-expert persona returning ~5-6 real, notable places that
 * match the user's query, anchored to the trip's destination, as a strict JSON
 * array with name/type/address/lat/lng and a short note. We keep the legacy
 * guards: "use real places with accurate coordinates" and "prefer omitting
 * coordinates over guessing".
 */
export function buildSuggestPrompt(query: string, ctx: SuggestContext): string {
  const where = [ctx.near, ctx.tripTitle].filter(Boolean).join(' — ')
  const locationCtx = where
    ? ` in the destination for this trip: "${where}"`
    : ''
  const bias = kindBias(ctx.kind)
  const biasLine = bias ? `\n\n${bias}` : ''
  return `You are a knowledgeable travel expert. Suggest 5 excellent, real, notable places that match: "${query}"${locationCtx}.${biasLine}

Use real places that genuinely exist, with accurate coordinates when you are confident. Prefer to omit lat/lng (leave them out) rather than invent inaccurate coordinates.

Respond with ONLY a JSON array — no markdown, no code fences, no preamble:
[{"name":"...","type":"e.g. Museum / Restaurant / Park","address":"street, city","lat":0.0,"lng":0.0,"note":"1 short sentence on why it fits / what's special"}]`
}

/**
 * Build the "suggest a whole day" prompt. Generates a small, coherent set of
 * stops (~3-5) for one day in the trip's destination, in a sensible order, in
 * the same JSON shape as `buildSuggestPrompt` so we can reuse `parseSuggestions`.
 */
export function buildSuggestDayPrompt(ctx: SuggestContext): string {
  const where = [ctx.near, ctx.tripTitle].filter(Boolean).join(' — ')
  const locationCtx = where ? ` in the destination for this trip: "${where}"` : ''
  return `You are a thoughtful travel planner. Plan a single, coherent day of 4 real, notable stops${locationCtx} — a sensible mix (e.g. a morning sight, a lunch spot, an afternoon highlight, an evening pick), in the order someone would visit them. Keep it geographically realistic so the day flows.

Use real places that genuinely exist, with accurate coordinates when you are confident. Prefer to omit lat/lng (leave them out) rather than invent inaccurate coordinates.

Respond with ONLY a JSON array — no markdown, no code fences, no preamble:
[{"name":"...","type":"e.g. Museum / Restaurant / Park","address":"street, city","lat":0.0,"lng":0.0,"note":"1 short sentence on why it's worth the visit"}]`
}

/** A finite number, or undefined. Used to gate lat/lng/coords. */
function finite(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n !== 0 ? n : undefined
}

function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const s = value.trim()
  return s || undefined
}

/**
 * Map one raw AI object to a `Stop`. Only sets lat/lng when both are finite
 * (and non-zero — the prompt's placeholder is 0.0); sets `coords` to match.
 */
function toStop(raw: Record<string, unknown>): Stop | null {
  const name = str(raw.name)
  if (!name) return null
  const stop: Stop = { name }
  const type = str(raw.type)
  if (type) stop.type = type
  const address = str(raw.address)
  if (address) stop.address = address
  const note = str(raw.note) ?? str(raw.why) ?? str(raw.description)
  if (note) stop.note = note

  const time = str(raw.time)
  if (time) stop.time = time
  const duration = normalizeDuration(raw.duration)
  if (duration !== undefined) stop.duration = duration
  const meal = str(raw.mealAnchor)
  if (meal === 'breakfast' || meal === 'lunch' || meal === 'dinner') stop.mealAnchor = meal

  const lat = finite(raw.lat)
  const lng = finite(raw.lng)
  if (lat !== undefined && lng !== undefined) {
    stop.lat = lat
    stop.lng = lng
    stop.coords = { lat, lng }
  }
  return stop
}

/**
 * Parse the model's text into `Stop[]`. Robust to code fences and preamble:
 * strips ```json fences, tries a direct JSON.parse, then falls back to slicing
 * the first `[` to the last `]` (mirrors legacy `extractJsonArray`). Garbage in
 * → `[]` out. Pure + unit-tested.
 */
export function parseSuggestions(text: string): Stop[] {
  const raw = (text || '').trim()
  if (!raw) return []
  const cleaned = raw.replace(/```json|```/g, '').trim()

  const tryArray = (candidate: string): Record<string, unknown>[] | null => {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) return parsed as Record<string, unknown>[]
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { results?: unknown }).results)) {
        return (parsed as { results: Record<string, unknown>[] }).results
      }
    } catch {
      /* fall through */
    }
    return null
  }

  let arr = tryArray(cleaned)
  if (!arr) {
    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start >= 0 && end > start) arr = tryArray(cleaned.slice(start, end + 1))
  }
  if (!arr) return []

  return arr
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(toStop)
    .filter((s): s is Stop => s !== null)
}

/** Suggest ~5 real places matching `query` in the trip's destination. */
export async function suggestPlaces(query: string, ctx: SuggestContext): Promise<Stop[]> {
  const q = query.trim()
  if (!q) return []
  const text = await callAI(textMessage(buildSuggestPrompt(q, ctx)), { maxTokens: 1500 })
  return parseSuggestions(text)
}

/** Suggest a small, coherent set of stops for an empty day. */
export async function suggestDay(ctx: SuggestContext): Promise<Stop[]> {
  const text = await callAI(textMessage(buildSuggestDayPrompt(ctx)), { maxTokens: 1500 })
  return parseSuggestions(text)
}
