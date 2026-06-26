import { describe, it, expect } from 'vitest'
import {
  MAX_REVIEW_CANDIDATES, EXACT_DISTANCE_M, NEAR_DISTANCE_M,
  AMBIGUITY_PENALTY, AUTO_ATTACH_THRESHOLD, GOOGLE_MAX_CONCURRENCY, SCAN_PAGE_SIZE,
} from './constants'

describe('placeId backfill constants', () => {
  it('are coherent, tunable numbers', () => {
    expect(MAX_REVIEW_CANDIDATES).toBe(3)
    expect(EXACT_DISTANCE_M).toBeLessThan(NEAR_DISTANCE_M) // exact band is tighter
    expect(AUTO_ATTACH_THRESHOLD).toBeGreaterThan(0)
    expect(AMBIGUITY_PENALTY).toBeGreaterThan(0)
    expect(GOOGLE_MAX_CONCURRENCY).toBeGreaterThanOrEqual(5)
    expect(GOOGLE_MAX_CONCURRENCY).toBeLessThanOrEqual(10)
    expect(SCAN_PAGE_SIZE).toBeGreaterThan(0)
  })
})
