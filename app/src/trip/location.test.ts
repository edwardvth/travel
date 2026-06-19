import { describe, it, expect } from 'vitest'
import { placeFromSuggestion, applyLocation } from './location'
import type { Stop } from '../types'

const stop = (over: Partial<Stop> = {}): Stop => ({ name: 'Place', ...over })

describe('placeFromSuggestion', () => {
  it('keeps just the name for a bare typed place', () => {
    expect(placeFromSuggestion({ name: 'Some Café' })).toEqual({ name: 'Some Café' })
  })

  it('carries type and address when present', () => {
    expect(
      placeFromSuggestion({ name: 'Tate', type: 'Gallery', address: 'Bankside, London' }),
    ).toEqual({ name: 'Tate', type: 'Gallery', address: 'Bankside, London' })
  })

  it('carries finite coordinates and mirrors them into coords', () => {
    expect(placeFromSuggestion({ name: 'X', lat: 51.5, lng: -0.1 })).toEqual({
      name: 'X',
      lat: 51.5,
      lng: -0.1,
      coords: { lat: 51.5, lng: -0.1 },
    })
  })

  it('reads coords when flat lat/lng are absent', () => {
    expect(placeFromSuggestion({ name: 'X', coords: { lat: 1, lng: 2 } })).toMatchObject({
      lat: 1,
      lng: 2,
      coords: { lat: 1, lng: 2 },
    })
  })

  it('omits placeholder/zero/non-finite coordinates', () => {
    expect(placeFromSuggestion({ name: 'X', lat: 0, lng: 0 })).toEqual({ name: 'X' })
    expect(placeFromSuggestion({ name: 'X', lat: 51.5, lng: 0 })).toEqual({ name: 'X' })
  })

  it('trims and drops blank strings', () => {
    expect(placeFromSuggestion({ name: 'X', type: '  ', address: '' })).toEqual({ name: 'X' })
  })
})

describe('applyLocation', () => {
  it('replaces location fields and mirrors coords', () => {
    const next = applyLocation(stop({ name: 'Old', lat: 1, lng: 1 }), {
      name: 'New',
      type: 'Museum',
      address: '1 New St',
      lat: 51.5,
      lng: -0.1,
      coords: { lat: 51.5, lng: -0.1 },
    })
    expect(next).toMatchObject({
      name: 'New',
      type: 'Museum',
      address: '1 New St',
      lat: 51.5,
      lng: -0.1,
      coords: { lat: 51.5, lng: -0.1 },
    })
  })

  it('is immutable — original untouched, new object returned', () => {
    const s = stop({ name: 'Old', lat: 1, lng: 1 })
    const next = applyLocation(s, { name: 'New' })
    expect(next).not.toBe(s)
    expect(s.name).toBe('Old')
    expect(s.lat).toBe(1)
  })

  it('preserves user-owned fields across a location change', () => {
    const s = stop({
      name: 'Old',
      photos: ['data:img/a', 'data:img/b'],
      note: 'my note',
      booking: { status: 'booked', time: '7 PM' },
      kind: 'eat',
      time: '6:00 PM',
      duration: 90,
    })
    const next = applyLocation(s, { name: 'New', lat: 2, lng: 3 })
    expect(next.photos).toEqual(['data:img/a', 'data:img/b'])
    expect(next.note).toBe('my note')
    expect(next.booking).toEqual({ status: 'booked', time: '7 PM' })
    expect(next.kind).toBe('eat')
    expect(next.time).toBe('6:00 PM')
    expect(next.duration).toBe(90)
  })

  it('clears place-derived enrichment that described the old place', () => {
    const s = stop({
      name: 'Old',
      wikiTitle: 'Old_Place',
      facts: ['old fact'],
      history: 'old history',
      tips: 'old tip',
      image: 'http://old.jpg',
    })
    const next = applyLocation(s, { name: 'New' })
    expect(next.wikiTitle).toBeUndefined()
    expect(next.facts).toBeUndefined()
    expect(next.history).toBeUndefined()
    expect(next.tips).toBeUndefined()
    expect(next.image).toBeUndefined()
  })

  it('drops stale coordinates when the new place has none', () => {
    const next = applyLocation(stop({ name: 'Old', lat: 1, lng: 1, coords: { lat: 1, lng: 1 } }), {
      name: 'New',
    })
    expect(next.lat).toBeUndefined()
    expect(next.lng).toBeUndefined()
    expect(next.coords).toBeUndefined()
  })

  it('clears type/address when the new place omits them', () => {
    const next = applyLocation(stop({ name: 'Old', type: 'Bar', address: 'old addr' }), {
      name: 'New',
    })
    expect(next.type).toBeUndefined()
    expect(next.address).toBeUndefined()
  })
})
