import { describe, it, expect } from 'vitest'
import { parseDestinationLabel, destinationFromStops } from './destination'

describe('parseDestinationLabel', () => {
  it('passes through a clean label', () => {
    expect(parseDestinationLabel('St. Louis, Missouri, United States')).toBe('St. Louis, Missouri, United States')
  })
  it('strips code fences and a { destination } JSON reply', () => {
    expect(parseDestinationLabel('```json\n{"destination":"Chicago, Illinois, United States"}\n```'))
      .toBe('Chicago, Illinois, United States')
  })
  it('accepts a bare JSON string', () => {
    expect(parseDestinationLabel('"Yerevan, Armenia"')).toBe('Yerevan, Armenia')
  })
  it('strips a Destination: prefix, wrapping quotes and a trailing period', () => {
    expect(parseDestinationLabel('Destination: "Tokyo, Japan".')).toBe('Tokyo, Japan')
  })
  it('takes the first non-empty line', () => {
    expect(parseDestinationLabel('\n  Paris, France  \n(some trailing note)')).toBe('Paris, France')
  })
  it('rejects non-answers and empties', () => {
    expect(parseDestinationLabel('unknown')).toBeNull()
    expect(parseDestinationLabel('N/A')).toBeNull()
    expect(parseDestinationLabel('   ')).toBeNull()
    expect(parseDestinationLabel('')).toBeNull()
  })
  it('rejects an over-long paragraph', () => {
    expect(parseDestinationLabel('x'.repeat(120))).toBeNull()
  })
})

describe('destinationFromStops', () => {
  it('drops the street segment and returns the city/state tail', () => {
    expect(destinationFromStops([{ address: '11 N 4th St, St. Louis, MO' }])).toBe('St. Louis, MO')
  })
  it('returns the most common locality — a single outlier never wins', () => {
    expect(destinationFromStops([
      { address: '1 A St, St. Louis, MO' },
      { address: '2 B St, St. Louis, MO' },
      { address: '3 C St, Chicago, IL' },
    ])).toBe('St. Louis, MO')
  })
  it('takes a single-segment address whole', () => {
    expect(destinationFromStops([{ address: 'Yerevan' }])).toBe('Yerevan')
  })
  it('returns null when no stop has a usable address', () => {
    expect(destinationFromStops([{}, { address: '   ' }])).toBeNull()
  })
})
