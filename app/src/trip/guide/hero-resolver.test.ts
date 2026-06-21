// app/src/trip/guide/hero-resolver.test.ts
import { describe, it, expect, vi } from 'vitest'
import { resolveHeroImage, type HeroResolverDeps } from './hero-resolver'

/** Build injectable deps with per-layer canned results, tracking call order. */
function deps(
  over: Partial<Record<keyof HeroResolverDeps, string | null>>,
): { d: HeroResolverDeps; calls: string[] } {
  const calls: string[] = []
  const d: HeroResolverDeps = {
    pageimages: vi.fn(async () => { calls.push('pageimages'); return over.pageimages ?? null }),
    commons: vi.fn(async () => { calls.push('commons'); return over.commons ?? null }),
    places: vi.fn(async () => { calls.push('places'); return over.places ?? null }),
  }
  return { d, calls }
}

const Q = ['Name, Dest', 'Name, City', 'Name']

describe('resolveHeroImage chain order', () => {
  it('returns pageimages and never advances when it hits', async () => {
    const { d, calls } = deps({ pageimages: 'wiki.jpg', commons: 'c.jpg', places: 'p.jpg' })
    expect(await resolveHeroImage(Q, 'Name, Dest', d)).toBe('wiki.jpg')
    expect(calls).toEqual(['pageimages'])
  })

  it('falls through to Commons when pageimages misses', async () => {
    const { d, calls } = deps({ pageimages: null, commons: 'c.jpg', places: 'p.jpg' })
    expect(await resolveHeroImage(Q, 'Name, Dest', d)).toBe('c.jpg')
    expect(calls).toEqual(['pageimages', 'commons'])
  })

  it('falls through to Google Places when both free layers miss', async () => {
    const { d, calls } = deps({ pageimages: null, commons: null, places: 'p.jpg' })
    expect(await resolveHeroImage(Q, 'Name, Dest', d)).toBe('p.jpg')
    expect(calls).toEqual(['pageimages', 'commons', 'places'])
  })

  it('returns null (placeholder) when every layer misses', async () => {
    const { d, calls } = deps({ pageimages: null, commons: null, places: null })
    expect(await resolveHeroImage(Q, 'Name, Dest', d)).toBeNull()
    expect(calls).toEqual(['pageimages', 'commons', 'places'])
  })

  it('is graceful when the Places layer no-ops (key absent -> null)', async () => {
    // Places returning null (dormant function) must not throw and must yield null.
    const { d } = deps({ pageimages: null, commons: null, places: null })
    await expect(resolveHeroImage(Q, 'Name, Dest', d)).resolves.toBeNull()
  })

  it('skips the Places layer when its query is empty', async () => {
    const { d, calls } = deps({ pageimages: null, commons: null, places: 'p.jpg' })
    expect(await resolveHeroImage(Q, '   ', d)).toBeNull()
    expect(calls).toEqual(['pageimages', 'commons'])
  })

  it('returns null without calling any layer for an empty query set', async () => {
    const { d, calls } = deps({ places: 'p.jpg' })
    expect(await resolveHeroImage([], '', d)).toBeNull()
    expect(calls).toEqual([])
  })
})
