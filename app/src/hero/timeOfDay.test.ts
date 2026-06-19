import { describe, expect, it } from 'vitest'
import { HERO_CONFIG } from './clips'
import { pickClips, resolveSeason, resolveTimeOfDay } from './timeOfDay'
import type { HeroVideoConfig, Season, TimeOfDay } from './types'

const W = HERO_CONFIG.windows

/** Build a Date at a fixed local hour (date part is arbitrary). */
const at = (hour: number) => new Date(2026, 5, 15, hour, 0, 0)

describe('resolveTimeOfDay', () => {
  it('buckets boundary hours correctly', () => {
    expect(resolveTimeOfDay(at(5), W)).toBe('morning')   // window start
    expect(resolveTimeOfDay(at(6), W)).toBe('morning')
    expect(resolveTimeOfDay(at(11), W)).toBe('afternoon') // morning end -> afternoon
    expect(resolveTimeOfDay(at(13), W)).toBe('afternoon')
    expect(resolveTimeOfDay(at(17), W)).toBe('evening')   // afternoon end -> evening
    expect(resolveTimeOfDay(at(18), W)).toBe('evening')
    expect(resolveTimeOfDay(at(20), W)).toBe('night')     // evening end -> night
    expect(resolveTimeOfDay(at(23), W)).toBe('night')
  })

  it('wraps the night window past midnight', () => {
    expect(resolveTimeOfDay(at(0), W)).toBe('night')
    expect(resolveTimeOfDay(at(2), W)).toBe('night')
    expect(resolveTimeOfDay(at(4), W)).toBe('night')
  })
})

describe('resolveSeason', () => {
  it('maps representative months to northern-hemisphere seasons', () => {
    expect(resolveSeason(new Date(2026, 0, 15))).toBe('winter')  // Jan
    expect(resolveSeason(new Date(2026, 1, 15))).toBe('winter')  // Feb
    expect(resolveSeason(new Date(2026, 3, 15))).toBe('spring')  // Apr
    expect(resolveSeason(new Date(2026, 6, 15))).toBe('summer')  // Jul
    expect(resolveSeason(new Date(2026, 9, 15))).toBe('autumn')  // Oct
    expect(resolveSeason(new Date(2026, 11, 15))).toBe('winter') // Dec
  })
})

describe('pickClips', () => {
  it('returns only clips eligible for both tod and season', () => {
    const result = pickClips(HERO_CONFIG, { tod: 'afternoon', season: 'winter' })
    expect(result.length).toBeGreaterThan(0)
    for (const clip of result) {
      expect(clip.timeOfDay).toContain('afternoon')
      expect(!clip.season || clip.season.includes('winter')).toBe(true)
    }
    // paris-alley and kyoto-street are both afternoon/all-season historic clips.
    const ids = result.map((c) => c.id)
    expect(ids).toContain('paris-alley')
    expect(ids).toContain('kyoto-street')
  })

  it('excludes a history id when alternatives remain', () => {
    const result = pickClips(
      HERO_CONFIG,
      { tod: 'afternoon', season: 'winter' },
      { history: ['paris-alley'] },
    )
    expect(result.map((c) => c.id)).not.toContain('paris-alley')
    expect(result.length).toBeGreaterThan(0)
  })

  it('ignores history when excluding would leave no clips', () => {
    // Only dubai-marina-night is eligible for night+spring; exclude it anyway.
    const eligibleIds = pickClips(HERO_CONFIG, { tod: 'night', season: 'spring' }).map((c) => c.id)
    const result = pickClips(
      HERO_CONFIG,
      { tod: 'night', season: 'spring' },
      { history: eligibleIds },
    )
    expect(result.length).toBe(eligibleIds.length)
    expect(result.length).toBeGreaterThan(0)
  })

  it('never returns empty when eligible clips exist', () => {
    const result = pickClips(HERO_CONFIG, { tod: 'morning', season: 'summer' })
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns empty when no clip matches the context', () => {
    const emptyConfig: HeroVideoConfig = { ...HERO_CONFIG, clips: [] }
    expect(pickClips(emptyConfig, { tod: 'morning', season: 'summer' })).toEqual([])
  })

  it('yields at least one clip for every (tod x season) combination', () => {
    const TODS: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night']
    const SEASONS: Season[] = ['winter', 'spring', 'summer', 'autumn']
    for (const tod of TODS) {
      for (const season of SEASONS) {
        const result = pickClips(HERO_CONFIG, { tod, season })
        expect(result.length, `${tod} x ${season} has no clips`).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('produces a deterministic order with a stubbed rng', () => {
    // Descending sequence -> Efraimidis-Spirakis keys preserve input order.
    const seq = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]
    let i = 0
    const rng = () => seq[i++ % seq.length]

    const a = pickClips(HERO_CONFIG, { tod: 'afternoon', season: 'summer' }, { rng })
    i = 0
    const b = pickClips(HERO_CONFIG, { tod: 'afternoon', season: 'summer' }, { rng })

    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
    expect(a.length).toBeGreaterThan(1)
  })
})
