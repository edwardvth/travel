// app/src/trip/guide/placePhoto.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { placePhotoProxyUrl, fetchPlacePhotoUrl } from './placePhoto'

describe('placePhotoProxyUrl', () => {
  it('points at the deployed place-photo function slug', () => {
    expect(placePhotoProxyUrl('https://x.supabase.co/')).toBe('https://x.supabase.co/functions/v1/place-photo')
  })
})

describe('fetchPlacePhotoUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns null (no fetch) for an empty / whitespace query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchPlacePhotoUrl('   ')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns an object URL when the proxy serves an image', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:photo' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      blob: async () => new Blob(),
    } as unknown as Response)
    expect(await fetchPlacePhotoUrl('Some Cafe, Paris')).toBe('blob:photo')
  })

  it('returns null when the proxy returns JSON { url: null } (dormant / no key)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      blob: async () => new Blob(),
    } as unknown as Response)
    expect(await fetchPlacePhotoUrl('Some Cafe, Paris')).toBeNull()
  })

  it('returns null on a non-OK status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
    } as unknown as Response)
    expect(await fetchPlacePhotoUrl('Anywhere')).toBeNull()
  })

  it('returns null when fetch throws (function not deployed / network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not deployed'))
    expect(await fetchPlacePhotoUrl('Anywhere')).toBeNull()
  })
})
