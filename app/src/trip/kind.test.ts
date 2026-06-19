import { describe, it, expect } from 'vitest'
import { stopKind, kindLabel } from './icons'

describe('stopKind', () => {
  it('honours an explicit kind over any inference', () => {
    expect(stopKind({ name: 'Hilton Hotel', kind: 'do' })).toBe('do')
    expect(stopKind({ name: 'A museum', kind: 'eat' })).toBe('eat')
    expect(stopKind({ name: 'A park', kind: 'stay' })).toBe('stay')
  })

  it('infers "eat" from restaurant/food/cafe/bar/dining/izakaya/coffee types', () => {
    expect(stopKind({ name: 'Le Comptoir', type: 'Restaurant' })).toBe('eat')
    expect(stopKind({ name: 'Blue Bottle', type: 'Cafe' })).toBe('eat')
    expect(stopKind({ name: 'Sky Bar', type: 'Bar' })).toBe('eat')
    expect(stopKind({ name: 'Some Izakaya', type: '' })).toBe('eat')
    expect(stopKind({ name: 'Morning Coffee', type: '' })).toBe('eat')
    expect(stopKind({ name: 'X', type: 'Fine Dining' })).toBe('eat')
  })

  it('infers "stay" from hotel/hostel/ryokan/lodging/airbnb/stay types', () => {
    expect(stopKind({ name: 'Park Hyatt', type: 'Hotel' })).toBe('stay')
    expect(stopKind({ name: 'Backpackers', type: 'Hostel' })).toBe('stay')
    expect(stopKind({ name: 'Tawaraya', type: 'Ryokan' })).toBe('stay')
    expect(stopKind({ name: 'Cozy Airbnb', type: '' })).toBe('stay')
    expect(stopKind({ name: 'Riverside Lodging', type: '' })).toBe('stay')
  })

  it('defaults to "do" for sights and anything unmatched', () => {
    expect(stopKind({ name: 'The Louvre', type: 'Museum' })).toBe('do')
    expect(stopKind({ name: 'Central Park', type: 'Park' })).toBe('do')
    expect(stopKind({ name: 'Mystery Place' })).toBe('do')
    expect(stopKind({ name: '' })).toBe('do')
  })

  it('prefers stay over eat when both could match (stay checked first)', () => {
    // A hotel with a bar should still read as a place to stay.
    expect(stopKind({ name: 'Hotel Bar', type: '' })).toBe('stay')
  })
})

describe('kindLabel', () => {
  it('maps each kind to its user-facing label', () => {
    expect(kindLabel('do')).toBe('Do')
    expect(kindLabel('eat')).toBe('Eat')
    expect(kindLabel('stay')).toBe('Stay')
  })
})
