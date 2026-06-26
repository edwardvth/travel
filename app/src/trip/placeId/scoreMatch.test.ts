import { describe, it, expect } from 'vitest'
import { scoreMatch } from './scoreMatch'
import type { Candidate } from './types'
import { AUTO_ATTACH_THRESHOLD } from './constants'

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  placeId: 'p1', name: 'Gateway Arch', lat: 38.6247, lng: -90.1848, types: ['park'], ...over,
})
const stop = { name: 'Gateway Arch', lat: 38.6247, lng: -90.1848 }

describe('scoreMatch', () => {
  it('returns not-confident on empty candidates', () => {
    expect(scoreMatch(stop, [])).toMatchObject({ confident: false })
  })

  it('confident: exact name + within EXACT_DISTANCE_M', () => {
    const r = scoreMatch(stop, [cand()])
    expect(r.confident).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(AUTO_ATTACH_THRESHOLD)
    expect(r.distanceM).toBeLessThan(5)
  })

  it('reviews coordless stops even on exact name (−coords penalty)', () => {
    const r = scoreMatch({ name: 'Gateway Arch' }, [cand()])
    expect(r.confident).toBe(false)
    expect(r.distanceM).toBeUndefined()
  })

  it('reviews when a near runner-up makes it ambiguous', () => {
    const runnerUp = cand({ placeId: 'p2', name: 'Gateway Arch', lat: 38.6249, lng: -90.1850 })
    const r = scoreMatch(stop, [cand(), runnerUp])
    expect(r.confident).toBe(false) // ambiguity penalty drops it below threshold
  })

  it('reviews a far candidate (distance negative)', () => {
    const far = cand({ lat: 40.0, lng: -90.0 }) // ~270km away
    const r = scoreMatch(stop, [far])
    expect(r.confident).toBe(false)
  })

  it('a far, differently-named runner-up does NOT trigger ambiguity', () => {
    const other = cand({ placeId: 'p2', name: 'Union Station', lat: 40.0, lng: -90.0 })
    const r = scoreMatch(stop, [cand(), other])
    expect(r.confident).toBe(true)
  })
})
