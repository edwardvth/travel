import { describe, it, expect } from 'vitest'
import {
  moveItem,
  remapCompletedAfterReorder,
  remapCompletedAfterDelete,
  toggleCompleted,
} from './itinerary-helpers'

describe('moveItem', () => {
  it('moves an item down', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })
  it('moves an item up', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })
  it('is a no-op for equal/out-of-range indices', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
  it('does not mutate the input', () => {
    const arr = ['a', 'b', 'c']
    moveItem(arr, 0, 2)
    expect(arr).toEqual(['a', 'b', 'c'])
  })
})

describe('remapCompletedAfterReorder', () => {
  it('moves the done key with its stop', () => {
    // Day 0 stops [A,B,C]; B (index 1) is done. Move A(0) -> end: order [1,2,0].
    // B is now at new index 0.
    const order = [1, 2, 0]
    expect(remapCompletedAfterReorder(['0-1'], 0, order)).toEqual(['0-0'])
  })
  it('leaves other days untouched', () => {
    const order = [1, 0]
    expect(remapCompletedAfterReorder(['1-0', '0-1'], 0, order).sort()).toEqual(['0-0', '1-0'])
  })
  it('drops stale keys not present in order', () => {
    const order = [0, 1] // only two stops now
    expect(remapCompletedAfterReorder(['0-5'], 0, order)).toEqual([])
  })
  it('returns empty for empty input', () => {
    expect(remapCompletedAfterReorder([], 0, [0, 1])).toEqual([])
    expect(remapCompletedAfterReorder(undefined, 0, [0, 1])).toEqual([])
  })
})

describe('remapCompletedAfterDelete', () => {
  it('drops the deleted key and decrements higher indices', () => {
    // Day 0 had [A,B,C,D]; A(0) and C(2) and D(3) done. Delete B(1).
    // A stays 0, C 2->1, D 3->2.
    const result = remapCompletedAfterDelete(['0-0', '0-2', '0-3'], 0, 1)
    expect(result.sort()).toEqual(['0-0', '0-1', '0-2'])
  })
  it('drops the deleted index itself', () => {
    expect(remapCompletedAfterDelete(['0-1'], 0, 1)).toEqual([])
  })
  it('leaves other days untouched', () => {
    const result = remapCompletedAfterDelete(['0-2', '1-2'], 0, 0)
    expect(result.sort()).toEqual(['0-1', '1-2'])
  })
  it('returns empty for empty input', () => {
    expect(remapCompletedAfterDelete(undefined, 0, 0)).toEqual([])
  })
})

describe('toggleCompleted', () => {
  it('adds a key when absent', () => {
    expect(toggleCompleted([], 0, 2)).toEqual(['0-2'])
  })
  it('removes a key when present', () => {
    expect(toggleCompleted(['0-2', '1-0'], 0, 2)).toEqual(['1-0'])
  })
  it('handles undefined input', () => {
    expect(toggleCompleted(undefined, 1, 1)).toEqual(['1-1'])
  })
})
