import { describe, it, expect } from 'vitest'
import { parseStopDetail, coerceFacts, buildEnrichPrompt } from './enrich'
import type { Stop } from '../types'

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
    expect(out).toEqual({ history: 'Founded 1850.', facts: ['A', 'B'], tips: 'Go early.', notice: '' })
  })

  it('strips code fences and preamble', () => {
    const text = 'Sure! Here you go:\n```json\n{"history":"H","facts":["f1"],"tips":"t"}\n```'
    expect(parseStopDetail(text)).toEqual({ history: 'H', facts: ['f1'], tips: 't', notice: '' })
  })

  it('coerces a string facts field to an array', () => {
    const out = parseStopDetail('{"history":"H","facts":"only one fact","tips":"t"}')
    expect(out.facts).toEqual(['only one fact'])
  })

  it('handles missing fields without throwing', () => {
    const out = parseStopDetail('{"history":"H"}')
    expect(out).toEqual({ history: 'H', facts: [], tips: '', notice: '' })
  })

  it('falls back to plain text as history when there is no JSON', () => {
    const out = parseStopDetail('Just a plain paragraph about the place.')
    expect(out).toEqual({ history: 'Just a plain paragraph about the place.', facts: [], tips: '', notice: '' })
  })

  it('returns an empty shape for empty input', () => {
    expect(parseStopDetail('')).toEqual({ history: '', facts: [], tips: '', notice: '' })
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
    expect(p).toContain('notice')
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
