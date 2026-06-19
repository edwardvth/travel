import { describe, it, expect } from 'vitest'
import { destinationOf, stopLandmarkQuery } from './landmark-context'
import type { Trip } from '../types'

const mk = (config: Partial<Trip['config']>, title = 'Row Title'): Pick<Trip, 'title' | 'config'> => ({
  title,
  config,
})

describe('destinationOf', () => {
  it('prefers config.title', () => {
    expect(destinationOf(mk({ title: 'Kyoto Spring 2026' }, 'kyoto'))).toBe('Kyoto Spring 2026')
  })
  it('falls back to the row title when config.title is empty/missing', () => {
    expect(destinationOf(mk({}, 'stl'))).toBe('stl')
    expect(destinationOf(mk({ title: '   ' }, 'stl'))).toBe('stl')
  })
  it('returns empty string when nothing usable', () => {
    expect(destinationOf(mk({}, ''))).toBe('')
  })
})

describe('stopLandmarkQuery', () => {
  it('joins stop name and destination', () => {
    expect(stopLandmarkQuery('Gateway Arch', 'St. Louis')).toBe('Gateway Arch, St. Louis')
  })
  it('uses just the name when there is no destination', () => {
    expect(stopLandmarkQuery('Gateway Arch', '')).toBe('Gateway Arch')
  })
  it('returns empty string for an empty stop name', () => {
    expect(stopLandmarkQuery('   ', 'St. Louis')).toBe('')
  })
})
