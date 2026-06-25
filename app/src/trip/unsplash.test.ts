import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))

import { fetchUnsplashCover } from './unsplash'

beforeEach(() => invoke.mockReset())

describe('fetchUnsplashCover', () => {
  it('returns the url from the function payload', async () => {
    invoke.mockResolvedValue({ data: { url: 'https://images.unsplash.com/x?w=1600' }, error: null })
    expect(await fetchUnsplashCover('Chicago')).toBe('https://images.unsplash.com/x?w=1600')
    expect(invoke).toHaveBeenCalledWith('unsplash-photo', { body: { query: 'Chicago' } })
  })

  it('returns null on a function error', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') })
    expect(await fetchUnsplashCover('Chicago')).toBeNull()
  })

  it('returns null when the payload has no url (no key / no results)', async () => {
    invoke.mockResolvedValue({ data: { url: null }, error: null })
    expect(await fetchUnsplashCover('Chicago')).toBeNull()
  })

  it('skips the call entirely for an empty query', async () => {
    expect(await fetchUnsplashCover('   ')).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })
})
