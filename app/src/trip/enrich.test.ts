import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseStopDetail,
  coerceFacts,
  buildEnrichPrompt,
  buildStopContext,
  cleanWikiText,
  generateStopDetail,
} from './enrich'
import type { Stop } from '../types'

vi.mock('./ai', async () => {
  const actual = await vi.importActual<typeof import('./ai')>('./ai')
  return { ...actual, callAI: vi.fn() }
})
vi.mock('./wiki', () => ({ fetchWikiExtract: vi.fn() }))

import { callAI } from './ai'
import { fetchWikiExtract } from './wiki'

const callAIMock = vi.mocked(callAI)
const fetchWikiExtractMock = vi.mocked(fetchWikiExtract)

describe('coerceFacts', () => {
  it('passes through a clean array', () => {
    expect(coerceFacts(['a', 'b'])).toEqual(['a', 'b'])
  })
  it('trims and drops empties in an array', () => {
    expect(coerceFacts(['  a  ', '', 'b', 3])).toEqual(['a', 'b', '3'])
  })
  it('wraps a single sentence string into one fact', () => {
    expect(coerceFacts('Just one fact.')).toEqual(['Just one fact.'])
  })
  it('splits a multi-line / bulleted string into multiple facts', () => {
    expect(coerceFacts('- one\n- two\n- three')).toEqual(['one', 'two', 'three'])
  })
  it('returns [] for non-string / non-array', () => {
    expect(coerceFacts(undefined)).toEqual([])
    expect(coerceFacts(null)).toEqual([])
    expect(coerceFacts(42)).toEqual([])
  })
})

describe('parseStopDetail', () => {
  it('parses clean JSON', () => {
    const out = parseStopDetail('{"history":"Founded 1850.","facts":["A","B"],"tips":"Go early."}')
    expect(out).toEqual({ history: 'Founded 1850.', facts: ['A', 'B'], tips: 'Go early.', notice: '', goodFor: '' })
  })

  it('strips code fences and preamble', () => {
    const text = 'Sure! Here you go:\n```json\n{"history":"H","facts":["f1"],"tips":"t"}\n```'
    expect(parseStopDetail(text)).toEqual({ history: 'H', facts: ['f1'], tips: 't', notice: '', goodFor: '' })
  })

  it('coerces a string facts field to an array', () => {
    const out = parseStopDetail('{"history":"H","facts":"only one fact","tips":"t"}')
    expect(out.facts).toEqual(['only one fact'])
  })

  it('handles missing fields without throwing', () => {
    const out = parseStopDetail('{"history":"H"}')
    expect(out).toEqual({ history: 'H', facts: [], tips: '', notice: '', goodFor: '' })
  })

  it('falls back to plain text as history when there is no JSON', () => {
    const out = parseStopDetail('Just a plain paragraph about the place.')
    expect(out).toEqual({ history: 'Just a plain paragraph about the place.', facts: [], tips: '', notice: '', goodFor: '' })
  })

  it('returns an empty shape for empty input', () => {
    expect(parseStopDetail('')).toEqual({ history: '', facts: [], tips: '', notice: '', goodFor: '' })
  })
})

describe('buildEnrichPrompt', () => {
  const base: Stop = { name: 'The Tower' }

  it('includes the place name and asks for strict JSON', () => {
    const p = buildEnrichPrompt(base, 'London Trip')
    expect(p).toContain('The Tower')
    expect(p).toContain('London Trip')
    expect(p).toContain('ONLY valid JSON')
    expect(p).toContain('"facts"')
  })

  it('adds a coordinate guard when lat/lng are present', () => {
    const p = buildEnrichPrompt({ ...base, lat: 51.5081, lng: -0.0759 }, 'London Trip')
    expect(p).toContain('51.50810')
    expect(p).toContain('-0.07590')
    expect(p).toMatch(/not a similarly named place/)
  })

  it('omits the coordinate guard when there are no coords', () => {
    const p = buildEnrichPrompt(base, 'London Trip')
    expect(p).not.toMatch(/GPS/)
  })

  it('prompt includes the destination/city for disambiguation', () => {
    const p = buildEnrichPrompt(
      { name: 'Old Courthouse', lat: 38.6, lng: -90.2 } as never,
      'stl',
      'St. Louis, Missouri, United States',
    )
    expect(p).toContain('St. Louis, Missouri, United States')
    expect(p).toContain('facts')
  })

  it('asks for the three tab sections by their semantics', () => {
    const p = buildEnrichPrompt(base, 'London Trip')
    expect(p).toMatch(/Story/i)
    expect(p).toMatch(/why it matters/i)
    expect(p).toMatch(/Interesting Facts/i)
    expect(p).toMatch(/Experience/i)
  })

  it('forbids inventing specifics and demands empty sections when unsupported', () => {
    const p = buildEnrichPrompt(base, 'London Trip')
    expect(p).toMatch(/do NOT invent/i)
    expect(p).toMatch(/empty/i)
  })

  it('folds the Wikipedia source extract into the prompt as grounding', () => {
    const p = buildEnrichPrompt(base, 'London Trip', '', {
      source: 'The Tower of London is a historic castle founded in 1066.',
    })
    expect(p).toContain('The Tower of London is a historic castle founded in 1066.')
    expect(p).toMatch(/source/i)
  })

  it('folds existing stop metadata into the prompt context', () => {
    const stop: Stop = {
      name: 'The Tower',
      type: 'castle',
      address: '1 Tower Hill',
      note: 'Built by William the Conqueror',
      wikiTitle: 'Tower of London',
    }
    const p = buildEnrichPrompt(stop, 'London Trip', 'London', {})
    expect(p).toContain('castle')
    expect(p).toContain('1 Tower Hill')
    expect(p).toContain('Built by William the Conqueror')
    expect(p).toContain('Tower of London')
  })
})

describe('buildStopContext', () => {
  it('summarizes type/address/coords/note/wikiTitle that are present', () => {
    const ctx = buildStopContext({
      name: 'Old Courthouse',
      type: 'museum',
      address: '11 N 4th St',
      lat: 38.6,
      lng: -90.2,
      note: 'Dred Scott case',
      wikiTitle: 'Old Courthouse (St. Louis)',
    })
    expect(ctx).toContain('museum')
    expect(ctx).toContain('11 N 4th St')
    expect(ctx).toContain('38.6')
    expect(ctx).toContain('-90.2')
    expect(ctx).toContain('Dred Scott case')
    expect(ctx).toContain('Old Courthouse (St. Louis)')
  })

  it('reads coords from the nested coords object too', () => {
    const ctx = buildStopContext({ name: 'X', coords: { lat: 1.5, lng: 2.5 } })
    expect(ctx).toContain('1.5')
    expect(ctx).toContain('2.5')
  })

  it('returns an empty string when nothing useful is on the stop', () => {
    expect(buildStopContext({ name: 'X' })).toBe('')
  })
})

describe('cleanWikiText', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanWikiText('  The   place\n\nis nice.  ')).toBe('The place\n\nis nice.')
  })
  it('strips wiki artefacts like pronunciation/listen markers', () => {
    expect(cleanWikiText('The Louvre (French pronunciation: ​[luvʁ]) is a museum.')).not.toContain('pronunciation')
  })
  it('returns empty for empty/garbage', () => {
    expect(cleanWikiText('')).toBe('')
    expect(cleanWikiText('   ')).toBe('')
  })
})

describe('generateStopDetail (layered chain)', () => {
  const stop: Stop = { name: 'The Tower', type: 'castle' }

  beforeEach(() => {
    callAIMock.mockReset()
    fetchWikiExtractMock.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the Wikipedia extract first (Name + Destination) and grounds the AI prompt', async () => {
    fetchWikiExtractMock.mockResolvedValue('The Tower of London is a castle founded in 1066.')
    callAIMock.mockResolvedValue('{"history":"It guarded the city.","facts":["Founded 1066."],"notice":"","tips":""}')

    const out = await generateStopDetail(stop, 'London Trip', 'London')

    expect(fetchWikiExtractMock).toHaveBeenCalledWith('The Tower, London')
    const prompt = callAIMock.mock.calls[0][0][0].content
    expect(prompt).toContain('The Tower of London is a castle founded in 1066.')
    expect(prompt).toMatch(/do NOT invent/i)
    expect(out.history).toBe('It guarded the city.')
    expect(out.facts).toEqual(['Founded 1066.'])
  })

  it('still calls the AI (ungrounded) when Wikipedia has nothing', async () => {
    fetchWikiExtractMock.mockResolvedValue(null)
    callAIMock.mockResolvedValue('{"history":"H","facts":[],"notice":"","tips":""}')

    const out = await generateStopDetail(stop, 'London Trip', 'London')
    expect(callAIMock).toHaveBeenCalled()
    expect(out.history).toBe('H')
  })

  it('falls back to the cleaned Wikipedia extract as Story when the AI call fails', async () => {
    fetchWikiExtractMock.mockResolvedValue('The Tower of London is a   castle.')
    callAIMock.mockRejectedValue(new Error('AI down'))

    const out = await generateStopDetail(stop, 'London Trip', 'London')
    expect(out.history).toBe('The Tower of London is a castle.')
    expect(out.facts).toEqual([])
    expect(out.notice).toBe('')
    expect(out.tips).toBe('')
  })

  it('returns all-empty (never hallucinates) when both Wikipedia and AI fail', async () => {
    fetchWikiExtractMock.mockResolvedValue(null)
    callAIMock.mockRejectedValue(new Error('AI down'))

    const out = await generateStopDetail(stop, 'London Trip', 'London')
    expect(out).toEqual({ history: '', facts: [], tips: '', notice: '', goodFor: '' })
  })
})

describe('parseStopDetail notice', () => {
  it('parses the new notice field', () => {
    const text = '{"history":"h","facts":["f"],"tips":"t","notice":"Look up at the dome."}'
    expect(parseStopDetail(text).notice).toBe('Look up at the dome.')
  })

  it('defaults notice to empty when absent', () => {
    expect(parseStopDetail('{"history":"h"}').notice).toBe('')
  })
})

describe('parseStopDetail goodFor', () => {
  it('emits goodFor when present', () => {
    const out = parseStopDetail('{"history":"h","facts":[],"tips":"t","goodFor":"Foodies"}')
    expect(out.goodFor).toBe('Foodies')
  })
  it('omits goodFor (empty string) when absent', () => {
    const out = parseStopDetail('{"history":"h"}')
    expect(out.goodFor).toBe('')
  })
})

describe('buildEnrichPrompt goodFor', () => {
  it('asks for a goodFor tag in the JSON schema', () => {
    const p = buildEnrichPrompt({ name: 'Louvre' } as Stop, 'Paris Trip')
    expect(p).toContain('"goodFor"')
  })
})
