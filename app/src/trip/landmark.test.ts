import { describe, it, expect, vi, afterEach } from 'vitest'
import { landmarkSearchUrl, parseLandmarkImage, fetchLandmarkImage, fetchFirstLandmarkImage } from './landmark'

describe('landmarkSearchUrl', () => {
  it('builds a CORS-enabled Wikipedia search+pageimages URL', () => {
    const url = landmarkSearchUrl('St. Louis Missouri')
    expect(url).toContain('https://en.wikipedia.org/w/api.php?')
    expect(url).toContain('action=query')
    expect(url).toContain('generator=search')
    expect(url).toContain('prop=pageimages')
    expect(url).toContain('piprop=thumbnail')
    expect(url).toContain('pithumbsize=800')
    expect(url).toContain('format=json')
    // CORS opener (URLSearchParams encodes * as %2A — both forms accepted by the API).
    expect(url).toMatch(/origin=(\*|%2A)/)
  })

  it('URL-encodes the query (spaces, punctuation)', () => {
    const url = landmarkSearchUrl('Paris, France')
    expect(url).toContain('gsrsearch=Paris%2C+France')
    expect(url).not.toContain('gsrsearch=Paris, France')
  })
})

describe('parseLandmarkImage', () => {
  it('extracts the first page thumbnail source when present', () => {
    const json = {
      query: {
        pages: {
          '12345': {
            pageid: 12345,
            title: 'Gateway Arch',
            thumbnail: { source: 'https://upload.wikimedia.org/arch.jpg', width: 800, height: 600 },
          },
        },
      },
    }
    expect(parseLandmarkImage(json)).toBe('https://upload.wikimedia.org/arch.jpg')
  })

  it('returns null when the page has no thumbnail', () => {
    const json = { query: { pages: { '1': { pageid: 1, title: 'Nowhere' } } } }
    expect(parseLandmarkImage(json)).toBeNull()
  })

  it('returns null for empty pages', () => {
    expect(parseLandmarkImage({ query: { pages: {} } })).toBeNull()
  })

  it('returns null when query/pages are missing (no-match response)', () => {
    expect(parseLandmarkImage({ batchcomplete: '' })).toBeNull()
    expect(parseLandmarkImage({ query: {} })).toBeNull()
  })

  it('returns null for garbage / wrong-shaped input', () => {
    expect(parseLandmarkImage(null)).toBeNull()
    expect(parseLandmarkImage(undefined)).toBeNull()
    expect(parseLandmarkImage('nope')).toBeNull()
    expect(parseLandmarkImage(42)).toBeNull()
    expect(parseLandmarkImage({ query: { pages: { '1': { thumbnail: {} } } } })).toBeNull()
    expect(parseLandmarkImage({ query: { pages: { '1': { thumbnail: { source: 42 } } } } })).toBeNull()
  })
})

describe('fetchLandmarkImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null (no fetch) for an empty / whitespace query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchLandmarkImage('   ')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the thumbnail source on a good response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        query: { pages: { '1': { thumbnail: { source: 'https://upload.wikimedia.org/eiffel.jpg' } } } },
      }),
    } as Response)
    expect(await fetchLandmarkImage('Paris France')).toBe('https://upload.wikimedia.org/eiffel.jpg')
  })

  it('returns null on a non-OK status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await fetchLandmarkImage('Anywhere')).toBeNull()
  })

  it('returns null when fetch throws (network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    expect(await fetchLandmarkImage('Anywhere')).toBeNull()
  })

  it('returns null when JSON has no thumbnail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ query: { pages: { '1': { title: 'X' } } } }),
    } as Response)
    expect(await fetchLandmarkImage('Obscure place')).toBeNull()
  })
})

describe('fetchFirstLandmarkImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A mock that returns an image only for queries listed in `hits`. Returns the spy. */
  const mockHits = (hits: Record<string, string>) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const match = Object.entries(hits).find(([q]) => url.includes(encodeURIComponent(q).replace(/%20/g, '+')))
      if (match) {
        return {
          ok: true,
          json: async () => ({ query: { pages: { '1': { thumbnail: { source: match[1] } } } } }),
        } as Response
      }
      return { ok: true, json: async () => ({ query: { pages: { '1': { title: 'none' } } } }) } as Response
    })

  it('returns the first query that resolves an image (most specific first)', async () => {
    const fetchSpy = mockHits({ 'Gateway Arch, St. Louis': 'https://upload.wikimedia.org/arch.jpg' })
    const url = await fetchFirstLandmarkImage(['Gateway Arch, St. Louis', 'Gateway Arch'])
    expect(url).toBe('https://upload.wikimedia.org/arch.jpg')
    // First query hit — second never attempted.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('falls through to a later query when earlier ones miss', async () => {
    mockHits({ 'Old Courthouse': 'https://upload.wikimedia.org/court.jpg' })
    const url = await fetchFirstLandmarkImage([
      'Old Courthouse, St. Louis, Missouri, United States',
      'Old Courthouse, St. Louis',
      'Old Courthouse',
    ])
    expect(url).toBe('https://upload.wikimedia.org/court.jpg')
  })

  it('returns null when every query misses', async () => {
    mockHits({})
    expect(await fetchFirstLandmarkImage(['A', 'B', 'C'])).toBeNull()
  })

  it('skips empty / whitespace queries and returns null for an empty list', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchFirstLandmarkImage([])).toBeNull()
    expect(await fetchFirstLandmarkImage(['', '   '])).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never throws even if a fetch rejects mid-list', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: { pages: { '1': { thumbnail: { source: 'https://upload.wikimedia.org/ok.jpg' } } } } }),
      } as Response)
    expect(await fetchFirstLandmarkImage(['First', 'Second'])).toBe('https://upload.wikimedia.org/ok.jpg')
  })
})
