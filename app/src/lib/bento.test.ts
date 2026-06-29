import { describe, it, expect } from 'vitest'
import { spanClass, isFeature } from './bento'

describe('bento layout', () => {
  it('makes each of two cells a tall 2x2 half', () => {
    expect(spanClass(0, 2)).toContain('lg:col-span-2')
    expect(spanClass(0, 2)).toContain('lg:row-span-2')
    expect(isFeature(0, 2)).toBe(true)
    expect(isFeature(1, 2)).toBe(true)
  })

  it('repeats a 2x2 feature, a 2x1 wide, then two 1x1 cells', () => {
    expect(spanClass(0, 6)).toBe('lg:col-span-2 lg:row-span-2')
    expect(spanClass(1, 6)).toBe('lg:col-span-2 lg:row-span-1')
    expect(spanClass(2, 6)).toBe('lg:col-span-1 lg:row-span-1')
    expect(spanClass(3, 6)).toBe('lg:col-span-1 lg:row-span-1')
    expect(isFeature(0, 6)).toBe(true)
    expect(isFeature(2, 6)).toBe(false)
  })
})
