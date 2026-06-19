import type { HeroClip, HeroVideoConfig, Season, TimeOfDay } from './types'

const TODS: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night']

/**
 * Bucket a Date's local hour into a TimeOfDay using the config windows.
 * A window [start, end] is start-inclusive, end-exclusive. The "night"
 * window wraps past midnight (e.g. [20, 5] covers 20:00–04:59).
 */
export function resolveTimeOfDay(date: Date, windows: HeroVideoConfig['windows']): TimeOfDay {
  const hour = date.getHours()
  for (const tod of TODS) {
    const [start, end] = windows[tod]
    const inWindow = start <= end
      ? hour >= start && hour < end       // normal window
      : hour >= start || hour < end       // wraps past midnight
    if (inWindow) return tod
  }
  // Fallback: hours not covered by any window default to night.
  return 'night'
}

/** Northern-hemisphere season by month (0-indexed via Date#getMonth). */
export function resolveSeason(date: Date): Season {
  const month = date.getMonth() // 0 = Jan
  if (month === 11 || month <= 1) return 'winter' // Dec, Jan, Feb
  if (month <= 4) return 'spring'                  // Mar, Apr, May
  if (month <= 7) return 'summer'                  // Jun, Jul, Aug
  return 'autumn'                                  // Sep, Oct, Nov
}

interface PickContext {
  tod: TimeOfDay
  season: Season
}

interface PickOptions {
  history?: string[]      // recently-shown clip ids to de-prioritize
  rng?: () => number      // injectable RNG for deterministic tests
}

/** True if a clip is eligible for both the given time-of-day and season. */
function isEligible(clip: HeroClip, ctx: PickContext): boolean {
  const todOk = clip.timeOfDay.includes(ctx.tod)
  const seasonOk = !clip.season || clip.season.includes(ctx.season)
  return todOk && seasonOk
}

/**
 * Weighted shuffle (Efraimidis–Spirakis): each item gets a key of
 * rng()^(1/weight); sorting descending yields a weight-biased random order.
 */
function weightedShuffle(clips: HeroClip[], rng: () => number): HeroClip[] {
  return clips
    .map((clip) => {
      const weight = clip.weight && clip.weight > 0 ? clip.weight : 1
      const key = Math.pow(rng(), 1 / weight)
      return { clip, key }
    })
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.clip)
}

/**
 * Pick the clips eligible for both `tod` and `season`, weighted-shuffled.
 * Clips whose ids appear in `history` are excluded when doing so still
 * leaves at least one clip; otherwise history is ignored (never returns
 * empty when any eligible clip exists).
 */
export function pickClips(
  config: HeroVideoConfig,
  ctx: PickContext,
  opts: PickOptions = {},
): HeroClip[] {
  const rng = opts.rng ?? Math.random
  const history = opts.history ?? []

  const eligible = config.clips.filter((clip) => isEligible(clip, ctx))
  if (eligible.length === 0) return []

  const filtered = eligible.filter((clip) => !history.includes(clip.id))
  const pool = filtered.length > 0 ? filtered : eligible

  return weightedShuffle(pool, rng)
}

/**
 * Pick from ALL clips (ignoring time-of-day/season), weighted-shuffled.
 * Recently-shown ids in `history` are excluded when doing so still leaves at
 * least one clip — so the same clip never shows again too soon. Used when the
 * hero rotates the whole library at random.
 */
export function pickAny(config: HeroVideoConfig, opts: PickOptions = {}): HeroClip[] {
  const rng = opts.rng ?? Math.random
  const history = opts.history ?? []
  if (config.clips.length === 0) return []

  const filtered = config.clips.filter((clip) => !history.includes(clip.id))
  const pool = filtered.length > 0 ? filtered : config.clips

  return weightedShuffle(pool, rng)
}
