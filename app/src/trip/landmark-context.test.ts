import { describe, it, expect } from 'vitest'
import { destinationOf, stopLandmarkQuery, expandDestination, coverImageQueries } from './landmark-context'
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

describe('expandDestination', () => {
  it('expands known abbreviations to full Wikipedia-resolvable names', () => {
    expect(expandDestination('stl')).toBe('St. Louis')
    expect(expandDestination('sf')).toBe('San Francisco')
    expect(expandDestination('nyc')).toBe('New York City')
    expect(expandDestination('la')).toBe('Los Angeles')
    expect(expandDestination('dc')).toBe('Washington D.C.')
    expect(expandDestination('nola')).toBe('New Orleans')
    expect(expandDestination('philly')).toBe('Philadelphia')
    expect(expandDestination('vegas')).toBe('Las Vegas')
    expect(expandDestination('ldn')).toBe('London')
    expect(expandDestination('kc')).toBe('Kansas City')
    expect(expandDestination('atx')).toBe('Austin')
    expect(expandDestination('pdx')).toBe('Portland')
    expect(expandDestination('sd')).toBe('San Diego')
    expect(expandDestination('chi')).toBe('Chicago')
  })
  it('matches case-insensitively and trims', () => {
    expect(expandDestination('STL')).toBe('St. Louis')
    expect(expandDestination(' Stl ')).toBe('St. Louis')
    expect(expandDestination('SF')).toBe('San Francisco')
  })
  it('returns the input unchanged for unknown or multi-word inputs', () => {
    expect(expandDestination('Kyoto Spring 2026')).toBe('Kyoto Spring 2026')
    expect(expandDestination('Tokyo')).toBe('Tokyo')
    expect(expandDestination('')).toBe('')
  })
})

describe('coverImageQueries', () => {
  const mkTrip = (
    config: Partial<Trip['config']>,
    days: Trip['data']['days'],
    title = 'Row Title',
  ): Pick<Trip, 'title' | 'config' | 'data'> => ({
    title,
    config,
    data: { days, completed: [] },
  })

  it('lists the first up to 3 stop names, then the expanded destination', () => {
    const trip = mkTrip({ title: 'stl' }, [
      { title: 'Day 1', stops: [{ name: 'Gateway Arch' }, { name: 'Forest Park' }] },
      { title: 'Day 2', stops: [{ name: 'City Museum' }, { name: 'Busch Stadium' }] },
    ])
    expect(coverImageQueries(trip)).toEqual([
      'Gateway Arch',
      'Forest Park',
      'City Museum',
      'St. Louis',
    ])
  })

  it('falls through to the expanded destination for a stopless abbreviated trip', () => {
    const trip = mkTrip({ title: 'stl' }, [])
    expect(coverImageQueries(trip)).toEqual(['St. Louis'])
  })

  it('de-duplicates and drops empties (stop name equal to destination)', () => {
    const trip = mkTrip({ title: 'Tokyo' }, [
      { title: 'Day 1', stops: [{ name: 'Tokyo' }, { name: '   ' }] },
    ])
    expect(coverImageQueries(trip)).toEqual(['Tokyo'])
  })

  it('returns an empty list when there is no usable destination or stop', () => {
    const trip = mkTrip({}, [], '')
    expect(coverImageQueries(trip)).toEqual([])
  })
})
