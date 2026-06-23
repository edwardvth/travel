import { callAI, textMessage } from './ai'
import type { Stop, StopKind } from '../types'
import { normalizeDuration, ensureDurations } from './duration'

export interface SuggestContext {
  tripTitle?: string
  /** Optional locality hint (e.g. a city / area) to anchor the search. */
  near?: string
  /** Bias the search toward a category (do = sights, eat = food, stay = lodging). */
  kind?: StopKind
  /** Optional free-text traveller context (group, pace, diet) folded into the prompt. */
  travelerContext?: string
}

/** A trailing line that folds traveller context into a prompt, or '' when absent. */
function travelerLine(ctx: SuggestContext): string {
  const t = ctx.travelerContext?.trim()
  return t ? `\n\nTraveller context — tailor the pace, food picks and choices to this group: ${t}` : ''
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
  return `You are a knowledgeable travel expert. Suggest 6 excellent, real, notable places that match: "${query}"${locationCtx}.${biasLine}${travelerLine(ctx)}

Use real places that genuinely exist, with accurate coordinates when you are confident. Prefer to omit lat/lng (leave them out) rather than invent inaccurate coordinates.

Respond with ONLY a JSON array — no markdown, no code fences, no preamble:
[{"name":"...","type":"e.g. Museum / Restaurant / Park","address":"street, city","lat":0.0,"lng":0.0,"note":"1 short sentence on why it fits / what's special"}]`
}

/**
 * Build the "suggest a whole day" prompt — a COMPLETE, realistic day (a full
 * morning→evening arc with real meal stops, filled by duration rather than a
 * stop quota), each stop carrying a time-of-day and a duration. Restores the
 * density of the legacy travel-guide.ai planner in Voyager's single-prompt
 * architecture. Same JSON shape as `buildSuggestPrompt` (plus time/duration/
 * mealAnchor) so `parseSuggestions` is reused.
 */
export function buildSuggestDayPrompt(ctx: SuggestContext): string {
  const where = [ctx.near, ctx.tripTitle].filter(Boolean).join(' — ')
  const locationCtx = where ? ` in the destination for this trip: "${where}"` : ''
  return `You are an expert local trip planner. Plan ONE complete, realistic day${locationCtx} — a full morning-to-evening itinerary the way a great local would actually spend the day, not a short list of attractions.

Fill the whole day. Schedule from the morning (around 8–9am) through the evening (dinner, and usually something after — a bar, viewpoint, show or stroll), and keep adding worthwhile stops until the day is genuinely full. Use each stop's duration plus realistic travel time between places to judge when the day is complete — do NOT stop at an arbitrary number of places. A dense city (Paris, Tokyo, Rome) will naturally fill with more stops; a slower place fills with fewer. Include the real meal stops at the right times:
- a morning coffee or breakfast (around 8–9:30am)
- a morning highlight
- lunch (around 12–1:30pm)
- one or two afternoon stops
- an optional afternoon break or coffee
- dinner (around 7–8:30pm)
- an optional evening pick

The itinerary should feel walkable: consecutive stops should generally stay within the same district or adjacent districts unless there's a compelling reason to travel farther. Cluster nearby places and avoid backtracking. Alternate activity types when possible — avoid repetitive sequences of similar attractions (for example museum after museum) unless a place is genuinely exceptional; the day should feel varied and intentionally paced. Favour genuinely notable, characterful places — a mix of marquee sights and insider spots — over generic tourist traps. Order the stops as someone would actually visit them. For each stop give a realistic time-of-day and how long to spend, and tag the three main meals with "mealAnchor".${travelerLine(ctx)}

Use real places that genuinely exist, with accurate coordinates when you are confident. Prefer to omit lat/lng (leave them out) rather than invent inaccurate coordinates.

Respond with ONLY a JSON array — no markdown, no code fences, no preamble:
[{"name":"...","type":"e.g. Cafe / Museum / Restaurant / Park","address":"street, city","lat":0.0,"lng":0.0,"time":"9:00 AM","duration":"45 min","mealAnchor":"breakfast","note":"1 short sentence on why it's worth it / what to do here"}]`
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

/**
 * Suggest a complete, scheduled day (a full morning→evening itinerary),
 * durations guaranteed. Runs on Claude Opus 4.7 — day generation is the
 * heaviest reasoning task (completeness, geography, variety, scheduling) and
 * fires only on an explicit "Suggest a day" click, so the higher cost is
 * bounded. The 4000-token ceiling prevents a fuller day from truncating
 * mid-JSON; it is not a prompt to be verbose. (Enrichment + suggestPlaces stay
 * on the default Sonnet 4.6.)
 */
export async function suggestDay(ctx: SuggestContext): Promise<Stop[]> {
  const text = await callAI(textMessage(buildSuggestDayPrompt(ctx)), {
    model: 'claude-opus-4-7',
    maxTokens: 4000,
  })
  return ensureDurations(parseSuggestions(text))
}
