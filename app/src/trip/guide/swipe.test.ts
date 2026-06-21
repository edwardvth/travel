import { describe, it, expect } from 'vitest'
import { swipeCommit, clamp, SWIPE } from './swipe'

const free = { leftNoop: false, rightNoop: false }

describe('swipeCommit', () => {
  it('commits left when dragged left past the distance threshold', () => {
    expect(swipeCommit(-(SWIPE.thresholdPx + 1), 0, free)).toBe('left')
  })

  it('commits right when dragged right past the distance threshold', () => {
    expect(swipeCommit(SWIPE.thresholdPx + 1, 0, free)).toBe('right')
  })

  it('springs back (null) under the threshold with no velocity', () => {
    expect(swipeCommit(-40, 0, free)).toBeNull()
    expect(swipeCommit(40, 0, free)).toBeNull()
  })

  it('commits on a flick: fast enough AND past the min flick distance', () => {
    // Short distance but high velocity → flick commits.
    expect(swipeCommit(-(SWIPE.minFlickPx + 1), -(SWIPE.velocityPxPerS + 1), free)).toBe('left')
    expect(swipeCommit(SWIPE.minFlickPx + 1, SWIPE.velocityPxPerS + 1, free)).toBe('right')
  })

  it('does NOT flick-commit when fast but under the min distance', () => {
    expect(swipeCommit(-(SWIPE.minFlickPx - 1), -(SWIPE.velocityPxPerS + 100), free)).toBeNull()
  })

  it('does NOT flick-commit when far enough but too slow (and under threshold)', () => {
    expect(swipeCommit(-(SWIPE.minFlickPx + 1), -(SWIPE.velocityPxPerS - 100), free)).toBeNull()
  })

  it('never commits toward a disabled edge', () => {
    // Left disabled (on the last stop): a big left drag still no-ops.
    expect(swipeCommit(-300, -900, { leftNoop: true, rightNoop: false })).toBeNull()
    // Right disabled (on the first stop): a big right drag still no-ops.
    expect(swipeCommit(300, 900, { leftNoop: false, rightNoop: true })).toBeNull()
  })

  it('still commits the enabled direction when the other edge is disabled', () => {
    // First stop (right disabled) — swiping left to advance still works.
    expect(swipeCommit(-300, 0, { leftNoop: false, rightNoop: true })).toBe('left')
  })

  it('treats a dead-still release (no offset) as no commit', () => {
    expect(swipeCommit(0, 0, free)).toBeNull()
  })
})

describe('clamp', () => {
  it('bounds a value to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
  it('matches the tilt clamp used for the card rotation', () => {
    // 8° max tilt at 0.05 deg/px → saturates beyond 160px of drag.
    expect(clamp(300 * SWIPE.tiltDegPerPx, -SWIPE.maxTiltDeg, SWIPE.maxTiltDeg)).toBe(SWIPE.maxTiltDeg)
    expect(clamp(-300 * SWIPE.tiltDegPerPx, -SWIPE.maxTiltDeg, SWIPE.maxTiltDeg)).toBe(-SWIPE.maxTiltDeg)
  })
})
