import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  commonsImageUrl,
  parseCommonsImage,
  fetchCommonsImage,
  fetchFirstCommonsImage,
} from './commons'

describe('commonsImageUrl', () => {
  it('builds a CORS-enabled Commons File-namespace search URL', () => {
    const url = commonsImageUrl('Cafe de Flore Paris')
    expect(url).toContain('https://en.wikipedia.org/w/api.php?')
    expect(url).toContain('action=query')
    expect(url).toContain('generator=search')
    expect(url).toContain('gsrnamespace=6')
    expect(url).toContain('gsrlimit=1')
    expect(url).toContain('prop=imageinfo')
    expect(url).toContain('iiprop=url')
    expect(url).toContain('iiurlwidth=800')
    expect(url).toContain('format=json')
    // CORS opener (URLSearchParams encodes * as %2A — both forms accepted).
    expect(url).toMatch(/origin=(\*|%2A)/)
  })

  it('URL-encodes the query (spaces, punctuation)', () => {
    const url = commonsImageUrl('Paris, France')
    expect(url).toContain('gsrsearch=Paris%2C+France')
    expect(url).not.toContain('gsrsearch=Paris, France')
  })
})

describe('parseCommonsImage', () => {
  it('extracts the first page imageinfo thumburl when present', () => {
    const json = {
      query: {
        pages: {
          '999': {
            pageid: 999,
            title: 'File:Cafe de Flore.jpg',
            imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/flore_800.jpg', url: 'https://upload.wikimedia.org/flore.jpg' }],
          },
        },
      },
    }
    expect(parseCommonsImage(json)).toBe('https://upload.wikimedia.org/thumb/flore_800.jpg')
  })

  it('falls back to the full url when there is no thumburl', () => {
    const json = {
      query: { pages: { '1': { imageinfo: [{ url: 'https://upload.wikimedia.org/full.jpg' }] } } },
    }
    expect(parseCommonsImage(json)).toBe('https://upload.wikimedia.org/full.jpg')
  })

  it('returns null when imageinfo is missing or empty', () => {
    expect(parseCommonsImage({ query: { pages: { '1': { title: 'File:X.jpg' } } } })).toBeNull()
    expect(parseCommonsImage({ query: { pages: { '1': { imageinfo: [] } } } })).toBeNull()
  })

  it('returns null for empty pages', () => {
    expect(parseCommonsImage({ query: { pages: {} } })).toBeNull()
  })

  it('returns null when query/pages are missing (no-match response)', () => {
    expect(parseCommonsImage({ batchcomplete: '' })).toBeNull()
    expect(parseCommonsImage({ query: {} })).toBeNull()
  })

  it('returns null for garbage / wrong-shaped input', () => {
    expect(parseCommonsImage(null)).toBeNull()
    expect(parseCommonsImage(undefined)).toBeNull()
    expect(parseCommonsImage('nope')).toBeNull()
    expect(parseCommonsImage(42)).toBeNull()
    expect(parseCommonsImage({ query: { pages: { '1': { imageinfo: [{ thumburl: 42 }] } } } })).toBeNull()
    expect(parseCommonsImage({ query: { pages: { '1': { imageinfo: 'nope' } } } })).toBeNull()
  })
})

describe('fetchCommonsImage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns null (no fetch) for an empty / whitespace query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchCommonsImage('   ')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the thumbnail url on a good response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        query: { pages: { '1': { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/cafe.jpg' }] } } },
      }),
    } as Response)
    expect(await fetchCommonsImage('Cafe Central Vienna')).toBe('https://upload.wikimedia.org/cafe.jpg')
  })

  it('returns null on a non-OK status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await fetchCommonsImage('Anywhere')).toBeNull()
  })

  it('returns null when fetch throws (network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    expect(await fetchCommonsImage('Anywhere')).toBeNull()
  })

  it('returns null when JSON has no imageinfo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ query: { pages: { '1': { title: 'File:X.jpg' } } } }),
    } as Response)
    expect(await fetchCommonsImage('Obscure place')).toBeNull()
  })
})

describe('fetchFirstCommonsImage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the first query that resolves an image and stops early', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ query: { pages: { '1': { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/a.jpg' }] } } } }),
    } as Response)
    const url = await fetchFirstCommonsImage(['Cafe, Paris', 'Cafe'])
    expect(url).toBe('https://upload.wikimedia.org/a.jpg')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('returns null when every query misses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ query: { pages: { '1': { title: 'none' } } } }),
    } as Response)
    expect(await fetchFirstCommonsImage(['A', 'B', 'C'])).toBeNull()
  })

  it('skips empty queries and returns null for an empty list (no fetch)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchFirstCommonsImage([])).toBeNull()
    expect(await fetchFirstCommonsImage(['', '   '])).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never throws even if a fetch rejects mid-list', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: { pages: { '1': { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/ok.jpg' }] } } } }),
      } as Response)
    expect(await fetchFirstCommonsImage(['First', 'Second'])).toBe('https://upload.wikimedia.org/ok.jpg')
  })
})
