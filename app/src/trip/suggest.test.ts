import { describe, it, expect } from 'vitest'
import { parseSuggestions, buildSuggestPrompt, buildSuggestDayPrompt } from './suggest'
import { ensureDurations } from './duration'

describe('parseSuggestions', () => {
  it('parses a clean JSON array into Stops', () => {
    const text =
      '[{"name":"The Louvre","type":"Museum","address":"Rue de Rivoli, Paris","lat":48.8606,"lng":2.3376,"note":"World-famous art."}]'
    expect(parseSuggestions(text)).toEqual([
      {
        name: 'The Louvre',
        type: 'Museum',
        address: 'Rue de Rivoli, Paris',
        note: 'World-famous art.',
        lat: 48.8606,
        lng: 2.3376,
        coords: { lat: 48.8606, lng: 2.3376 },
      },
    ])
  })

  it('strips code fences and preamble', () => {
    const text =
      'Sure, here are some ideas:\n```json\n[{"name":"Park Güell","type":"Park"}]\n```'
    expect(parseSuggestions(text)).toEqual([{ name: 'Park Güell', type: 'Park' }])
  })

  it('omits lat/lng/coords when coordinates are missing', () => {
    const out = parseSuggestions('[{"name":"Hidden Cafe","type":"Cafe"}]')
    expect(out).toEqual([{ name: 'Hidden Cafe', type: 'Cafe' }])
    expect(out[0].lat).toBeUndefined()
    expect(out[0].coords).toBeUndefined()
  })

  it('omits lat/lng when only one coordinate is present', () => {
    const out = parseSuggestions('[{"name":"A","lat":51.5}]')
    expect(out[0].lat).toBeUndefined()
    expect(out[0].lng).toBeUndefined()
    expect(out[0].coords).toBeUndefined()
  })

  it('omits placeholder 0.0 coordinates', () => {
    const out = parseSuggestions('[{"name":"A","lat":0.0,"lng":0.0}]')
    expect(out[0].lat).toBeUndefined()
    expect(out[0].coords).toBeUndefined()
  })

  it('coerces string coordinates and skips non-finite ones', () => {
    const out = parseSuggestions('[{"name":"A","lat":"48.85","lng":"2.29"},{"name":"B","lat":"x","lng":"2"}]')
    expect(out[0].coords).toEqual({ lat: 48.85, lng: 2.29 })
    expect(out[1].lat).toBeUndefined()
  })

  it('drops entries with no name and keeps valid ones', () => {
    const out = parseSuggestions('[{"type":"Park"},{"name":"Real Place"}]')
    expect(out).toEqual([{ name: 'Real Place' }])
  })

  it('reads note from why/description fallbacks', () => {
    expect(parseSuggestions('[{"name":"A","why":"because"}]')[0].note).toBe('because')
    expect(parseSuggestions('[{"name":"B","description":"desc"}]')[0].note).toBe('desc')
  })

  it('unwraps a { results: [...] } object', () => {
    expect(parseSuggestions('{"results":[{"name":"X"}]}')).toEqual([{ name: 'X' }])
  })

  it('returns [] for garbage / empty / non-array', () => {
    expect(parseSuggestions('not json at all')).toEqual([])
    expect(parseSuggestions('')).toEqual([])
    expect(parseSuggestions('{"name":"single object, not array"}')).toEqual([])
    expect(parseSuggestions('[ {broken json ')).toEqual([])
  })
})

describe('buildSuggestPrompt', () => {
  it('includes the query, destination context and asks for a JSON array', () => {
    const p = buildSuggestPrompt('rooftop bars', { tripTitle: 'Lisbon Long Weekend' })
    expect(p).toContain('rooftop bars')
    expect(p).toContain('Lisbon Long Weekend')
    expect(p).toContain('JSON array')
    expect(p).toContain('"lat"')
    expect(p).toMatch(/real places/i)
  })

  it('works without any context', () => {
    const p = buildSuggestPrompt('museums', {})
    expect(p).toContain('museums')
    expect(p).toContain('JSON array')
  })

  it('biases the prompt toward eating places when kind is "eat"', () => {
    const p = buildSuggestPrompt('something good', { kind: 'eat' })
    expect(p).toMatch(/places to eat/i)
    expect(p).toMatch(/restaurants/i)
  })

  it('biases the prompt toward lodging when kind is "stay"', () => {
    const p = buildSuggestPrompt('somewhere central', { kind: 'stay' })
    expect(p).toMatch(/places to stay/i)
    expect(p).toMatch(/hotels|lodging/i)
  })

  it('biases the prompt toward sights/activities when kind is "do"', () => {
    const p = buildSuggestPrompt('what to see', { kind: 'do' })
    expect(p).toMatch(/things to do|sights|attractions/i)
  })

  it('adds no category bias line when kind is omitted', () => {
    const p = buildSuggestPrompt('anything', {})
    expect(p).not.toMatch(/Focus on/)
  })
})

describe('buildSuggestDayPrompt', () => {
  it('asks for a coherent day of real stops as a JSON array', () => {
    const p = buildSuggestDayPrompt({ tripTitle: 'Rome' })
    expect(p).toContain('Rome')
    expect(p).toMatch(/JSON array/)
    expect(p).toMatch(/real/i)
  })
})

describe('parseSuggestions — time + duration + mealAnchor (suggest-day parity)', () => {
  it('captures time (string), duration (minutes), and a valid mealAnchor', () => {
    const stops = parseSuggestions('[{"name":"Cafe","time":"9:00 AM","duration":"45 min","mealAnchor":"breakfast"}]')
    expect(stops[0]).toMatchObject({ name: 'Cafe', time: '9:00 AM', duration: 45, mealAnchor: 'breakfast' })
  })
  it('omits time/duration when unparseable, and drops an out-of-enum mealAnchor', () => {
    const stops = parseSuggestions('[{"name":"X","duration":"soon","mealAnchor":"snack"}]')
    expect(stops[0].time).toBeUndefined()
    expect(stops[0].duration).toBeUndefined()
    expect(stops[0].mealAnchor).toBeUndefined()
  })
})

describe('buildSuggestDayPrompt — complete-day parity', () => {
  it('frames a full-day window (completeness, NOT a stop count) with meals, time, duration, mealAnchor', () => {
    const p = buildSuggestDayPrompt({ tripTitle: 'Rome', near: 'Rome, Italy' })
    expect(p).toMatch(/complete|full/i)
    expect(p.toLowerCase()).toMatch(/fill the whole day|until the day is genuinely full|arbitrary number/)
    expect(p).not.toMatch(/\b6.?10\b/)
    expect(p.toLowerCase()).toContain('breakfast')
    expect(p.toLowerCase()).toContain('lunch')
    expect(p.toLowerCase()).toContain('dinner')
    expect(p.toLowerCase()).toMatch(/walkable|same district|adjacent district/)
    expect(p.toLowerCase()).toMatch(/alternate|repetitive|varied/)
    expect(p).toContain('"time"')
    expect(p).toContain('"duration"')
    expect(p).toContain('"mealAnchor"')
    expect(p).toContain('Rome, Italy')
  })
  it('folds traveler context when supplied, omits it otherwise', () => {
    expect(buildSuggestDayPrompt({ travelerContext: 'vegetarian, slow pace' })).toContain('vegetarian, slow pace')
    expect(buildSuggestDayPrompt({})).not.toMatch(/Traveller context/i)
  })
})

describe('buildSuggestPrompt — 6 results', () => {
  it('asks for 6 places', () => {
    expect(buildSuggestPrompt('coffee', {})).toMatch(/\b6\b/)
  })
})

describe('suggestDay duration guarantee (via ensureDurations)', () => {
  it('every stop has a duration after ensureDurations', () => {
    const filled = ensureDurations(parseSuggestions('[{"name":"Cafe","type":"Cafe"},{"name":"X","duration":"90 min"}]'))
    expect(filled.every(s => typeof s.duration === 'number')).toBe(true)
    expect(filled[0].duration).toBe(45)
    expect(filled[1].duration).toBe(90)
  })
})
