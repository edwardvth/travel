import { describe, it, expect } from 'vitest'
import { destinationOf, stopLandmarkQuery, coverImageQueries, cityOf, heroQueries } from './landmark-context'
import type { Trip } from '../types'

const mk = (config: Partial<Trip['config']>, title = 'Row Title'): Pick<Trip, 'title' | 'config'> => ({
  title,
  config,
})

describe('destinationOf', () => {
  it('prefers config.destination over everything else', () => {
    expect(destinationOf(mk({ destination: 'St. Louis, Missouri, United States', title: 'STL Trip' }, 'stl')))
      .toBe('St. Louis, Missouri, United States')
  })
  it('falls back to config.title when destination is empty/missing', () => {
    expect(destinationOf(mk({ title: 'Kyoto Spring 2026' }, 'kyoto'))).toBe('Kyoto Spring 2026')
    expect(destinationOf(mk({ destination: '   ', title: 'Kyoto Spring 2026' }, 'kyoto'))).toBe('Kyoto Spring 2026')
  })
  it('falls back to the row title when destination and config.title are empty/missing', () => {
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

describe('cityOf', () => {
  it('returns the leading segment of a multi-part destination', () => {
    expect(cityOf('St. Louis, Missouri, United States')).toBe('St. Louis')
  })
  it('returns empty when the destination has no comma (already city-only)', () => {
    expect(cityOf('Tokyo')).toBe('')
  })
  it('returns empty for an empty destination', () => {
    expect(cityOf('')).toBe('')
    expect(cityOf('   ')).toBe('')
  })
})

describe('heroQueries', () => {
  it('orders Name+Destination, Name+City, then bare Name (de-duped)', () => {
    expect(heroQueries('Old Courthouse', 'St. Louis, Missouri, United States')).toEqual([
      'Old Courthouse, St. Louis, Missouri, United States',
      'Old Courthouse, St. Louis',
      'Old Courthouse',
    ])
  })
  it('drops the duplicate City query when the destination is already city-only', () => {
    expect(heroQueries('Gateway Arch', 'St. Louis')).toEqual([
      'Gateway Arch, St. Louis',
      'Gateway Arch',
    ])
  })
  it('is just the bare name when there is no destination', () => {
    expect(heroQueries('Gateway Arch', '')).toEqual(['Gateway Arch'])
  })
  it('returns an empty list for an empty stop name', () => {
    expect(heroQueries('   ', 'St. Louis')).toEqual([])
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

  it('lists the first up to 3 stop names, then the destination', () => {
    const trip = mkTrip({ destination: 'St. Louis, Missouri, United States' }, [
      { title: 'Day 1', stops: [{ name: 'Gateway Arch' }, { name: 'Forest Park' }] },
      { title: 'Day 2', stops: [{ name: 'City Museum' }, { name: 'Busch Stadium' }] },
    ])
    expect(coverImageQueries(trip)).toEqual([
      'Gateway Arch',
      'Forest Park',
      'City Museum',
      'St. Louis, Missouri, United States',
    ])
  })

  it('falls through to the destination for a stopless trip (no abbreviation mapping)', () => {
    const trip = mkTrip({ destination: 'St. Louis, Missouri, United States' }, [])
    expect(coverImageQueries(trip)).toEqual(['St. Louis, Missouri, United States'])
  })

  it('uses the destination verbatim — short shorthands are no longer expanded', () => {
    const trip = mkTrip({ title: 'stl' }, [])
    expect(coverImageQueries(trip)).toEqual(['stl'])
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
