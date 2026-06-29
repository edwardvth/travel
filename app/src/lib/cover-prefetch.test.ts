import { describe, it, expect, vi, beforeEach } from 'vitest'
import { warmCover, peekCover, __resetCoverCacheForTest, __setResolverForTest } from './cover-prefetch'

beforeEach(() => { __resetCoverCacheForTest() })

describe('cover-prefetch', () => {
  it('peekCover is undefined before any warm (cache-only, never fetches)', () => {
    expect(peekCover('Kyoto, Japan')).toBeUndefined()
  })

  it('warmCover resolves once and peekCover returns the URL', async () => {
    const resolver = vi.fn().mockResolvedValue('https://img/kyoto.jpg')
    __setResolverForTest(resolver)
    await warmCover('Kyoto, Japan')
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(peekCover('Kyoto, Japan')).toBe('https://img/kyoto.jpg')
  })

  it('warming the same destination twice resolves only once', async () => {
    const resolver = vi.fn().mockResolvedValue('https://img/kyoto.jpg')
    __setResolverForTest(resolver)
    await warmCover('Kyoto, Japan')
    await warmCover('Kyoto, Japan')
    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('a miss caches null and never throws', async () => {
    __setResolverForTest(vi.fn().mockResolvedValue(null))
    await warmCover('Atlantis')
    expect(peekCover('Atlantis')).toBeNull()
  })

  it('a thrown resolver is swallowed (best-effort)', async () => {
    __setResolverForTest(vi.fn().mockRejectedValue(new Error('network')))
    await expect(warmCover('Kyoto, Japan')).resolves.toBeUndefined()
    expect(peekCover('Kyoto, Japan')).toBeNull()
  })

  it('keys are normalized (trim + case-insensitive)', async () => {
    __setResolverForTest(vi.fn().mockResolvedValue('https://img/kyoto.jpg'))
    await warmCover('  Kyoto, Japan ')
    expect(peekCover('kyoto, japan')).toBe('https://img/kyoto.jpg')
  })
})
