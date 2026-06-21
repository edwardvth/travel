import { describe, it, expect } from 'vitest'
import { isArrived, ARRIVE_RADIUS_M, LEAVE_RADIUS_M } from './arrival'

const stop = { lat: 38.6247, lng: -90.1848 } // Old Courthouse

describe('isArrived', () => {
  it('is true within the arrive radius', () => {
    expect(isArrived({ lat: 38.6247, lng: -90.1848 }, stop, false)).toBe(true)
  })
  it('is false far away', () => {
    expect(isArrived({ lat: 38.65, lng: -90.20 }, stop, false)).toBe(false)
  })
  it('hysteresis: stays arrived between arrive and leave radius', () => {
    // ~50m away (between 40m arrive and 80m leave) while already arrived
    const near = { lat: 38.6247 + 0.00045, lng: -90.1848 }
    expect(isArrived(near, stop, true)).toBe(true)   // was arrived → stays
    expect(isArrived(near, stop, false)).toBe(false) // wasn't → not yet
  })
  it('returns false when stop has no coords', () => {
    expect(isArrived({ lat: 38.6, lng: -90.2 }, { lat: undefined, lng: undefined }, false)).toBe(false)
  })
})

// ARRIVE/LEAVE radius sanity (referenced so they stay exported)
describe('radii', () => {
  it('leave radius exceeds arrive radius', () => {
    expect(LEAVE_RADIUS_M).toBeGreaterThan(ARRIVE_RADIUS_M)
  })
})
