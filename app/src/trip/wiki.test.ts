import { describe, it, expect, vi, afterEach } from 'vitest'
import { wikiExtractUrl, parseWikiExtract, fetchWikiExtract } from './wiki'

describe('wikiExtractUrl', () => {
  it('builds a CORS-enabled Wikipedia search+extracts URL', () => {
    const url = wikiExtractUrl('Gateway Arch, St. Louis')
    expect(url).toContain('https://en.wikipedia.org/w/api.php?')
    expect(url).toContain('action=query')
    expect(url).toContain('generator=search')
    expect(url).toContain('prop=extracts')
    expect(url).toContain('exintro=1')
    expect(url).toContain('explaintext=1')
    expect(url).toContain('exsentences=6')
    expect(url).toContain('format=json')
    // CORS opener (URLSearchParams encodes * as %2A — both forms accepted by the API).
    expect(url).toMatch(/origin=(\*|%2A)/)
  })

  it('URL-encodes the query (spaces, punctuation)', () => {
    const url = wikiExtractUrl('Paris, France')
    expect(url).toContain('gsrsearch=Paris%2C+France')
    expect(url).not.toContain('gsrsearch=Paris, France')
  })
})

describe('parseWikiExtract', () => {
  it('extracts and trims the first page extract when present', () => {
    const json = {
      query: {
        pages: {
          '12345': {
            pageid: 12345,
            title: 'Gateway Arch',
            extract: '  The Gateway Arch is a 630-foot monument in St. Louis.  ',
          },
        },
      },
    }
    expect(parseWikiExtract(json)).toBe('The Gateway Arch is a 630-foot monument in St. Louis.')
  })

  it('returns null when the page has no extract', () => {
    const json = { query: { pages: { '1': { pageid: 1, title: 'Nowhere' } } } }
    expect(parseWikiExtract(json)).toBeNull()
  })

  it('returns null for an empty / whitespace extract', () => {
    expect(parseWikiExtract({ query: { pages: { '1': { extract: '   ' } } } })).toBeNull()
    expect(parseWikiExtract({ query: { pages: { '1': { extract: '' } } } })).toBeNull()
  })

  it('returns null for empty pages', () => {
    expect(parseWikiExtract({ query: { pages: {} } })).toBeNull()
  })

  it('returns null when query/pages are missing (no-match response)', () => {
    expect(parseWikiExtract({ batchcomplete: '' })).toBeNull()
    expect(parseWikiExtract({ query: {} })).toBeNull()
  })

  it('returns null for garbage / wrong-shaped input', () => {
    expect(parseWikiExtract(null)).toBeNull()
    expect(parseWikiExtract(undefined)).toBeNull()
    expect(parseWikiExtract('nope')).toBeNull()
    expect(parseWikiExtract(42)).toBeNull()
    expect(parseWikiExtract({ query: { pages: { '1': { extract: 42 } } } })).toBeNull()
  })
})

describe('fetchWikiExtract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null (no fetch) for an empty / whitespace query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchWikiExtract('   ')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the trimmed extract on a good response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        query: { pages: { '1': { extract: 'The Eiffel Tower is a tower in Paris.' } } },
      }),
    } as Response)
    expect(await fetchWikiExtract('Eiffel Tower, Paris')).toBe('The Eiffel Tower is a tower in Paris.')
  })

  it('returns null on a non-OK status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await fetchWikiExtract('Anywhere')).toBeNull()
  })

  it('returns null when fetch throws (network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    expect(await fetchWikiExtract('Anywhere')).toBeNull()
  })

  it('returns null when JSON has no extract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ query: { pages: { '1': { title: 'X' } } } }),
    } as Response)
    expect(await fetchWikiExtract('Obscure place')).toBeNull()
  })

  it('passes an abort signal through to fetch when provided', async () => {
    const controller = new AbortController()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ query: { pages: { '1': { extract: 'X.' } } } }),
    } as Response)
    await fetchWikiExtract('Somewhere', controller.signal)
    expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal })
  })
})
