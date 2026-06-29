import { describe, it, expect } from 'vitest'
import { deriveAutocompleteStatus, resolveContinue } from './pill-resolution'

const MIN = 3

describe('deriveAutocompleteStatus', () => {
  it('is idle below the minimum query length', () => {
    expect(
      deriveAutocompleteStatus({ trimmedLength: 2, minQuery: MIN, settled: true, loading: false, predictionCount: 5 }),
    ).toBe('idle')
  })

  it('is loading while the debounce has not caught up (stale-query guard)', () => {
    // e.g. typed "iaefjof" but `places` still reflect the older "Kyoto" query.
    expect(
      deriveAutocompleteStatus({ trimmedLength: 7, minQuery: MIN, settled: false, loading: false, predictionCount: 5 }),
    ).toBe('loading')
  })

  it('is loading while a fetch is in flight', () => {
    expect(
      deriveAutocompleteStatus({ trimmedLength: 5, minQuery: MIN, settled: true, loading: true, predictionCount: 0 }),
    ).toBe('loading')
  })

  it('is ready when settled, not loading, and predictions exist', () => {
    expect(
      deriveAutocompleteStatus({ trimmedLength: 5, minQuery: MIN, settled: true, loading: false, predictionCount: 3 }),
    ).toBe('ready')
  })

  it('is empty when settled and not loading but no predictions matched', () => {
    expect(
      deriveAutocompleteStatus({ trimmedLength: 7, minQuery: MIN, settled: true, loading: false, predictionCount: 0 }),
    ).toBe('empty')
  })
})

describe('resolveContinue', () => {
  const places = ['Kyoto, Japan', 'Kyoto Station', 'Kyotango']

  it('advances with the TOP result when nothing is highlighted (Enter after predictions)', () => {
    expect(resolveContinue('ready', -1, places)).toEqual({ kind: 'advance', label: 'Kyoto, Japan' })
  })

  it('advances with the HIGHLIGHTED result when one is active', () => {
    expect(resolveContinue('ready', 2, places)).toEqual({ kind: 'advance', label: 'Kyotango' })
  })

  it('falls back to the top result when the active index is out of range', () => {
    expect(resolveContinue('ready', 9, places)).toEqual({ kind: 'advance', label: 'Kyoto, Japan' })
  })

  it('waits (no advance) while still loading — Enter pressed too early', () => {
    expect(resolveContinue('loading', -1, [])).toEqual({ kind: 'wait' })
  })

  it('is invalid (no advance) when the query resolved to no places — nonsense like "iaefjof"', () => {
    expect(resolveContinue('empty', -1, [])).toEqual({ kind: 'invalid' })
  })

  it('is invalid (no advance) when the query is too short', () => {
    expect(resolveContinue('idle', -1, [])).toEqual({ kind: 'invalid' })
  })

  it('never advances on raw text: ready status with zero predictions cannot advance', () => {
    // Defensive: 'ready' implies predictions exist, but guard the empty array too.
    expect(resolveContinue('ready', -1, [])).toEqual({ kind: 'invalid' })
  })
})
