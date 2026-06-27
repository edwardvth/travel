import { describe, it, expect } from 'vitest'
import { resolveCommitLabel } from './destination-commit'

describe('resolveCommitLabel', () => {
  it('uses an explicitly chosen suggestion verbatim', () => {
    expect(resolveCommitLabel({ chosen: 'Kyoto, Japan', raw: 'kyo', suggestions: ['Kyoto, Japan'] }))
      .toBe('Kyoto, Japan')
  })
  it('falls back to the top suggestion when none chosen', () => {
    expect(resolveCommitLabel({ chosen: null, raw: 'Kyoto', suggestions: ['Kyoto, Japan', 'Kyoto Prefecture, Japan'] }))
      .toBe('Kyoto, Japan')
  })
  it('uses raw text only when there are no suggestions', () => {
    expect(resolveCommitLabel({ chosen: null, raw: 'Atlantis', suggestions: [] }))
      .toBe('Atlantis')
  })
  it('trims raw text', () => {
    expect(resolveCommitLabel({ chosen: null, raw: '  Atlantis  ', suggestions: [] }))
      .toBe('Atlantis')
  })
  it('returns "" when nothing usable', () => {
    expect(resolveCommitLabel({ chosen: null, raw: '   ', suggestions: [] })).toBe('')
  })
})
