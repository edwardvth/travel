import { describe, it, expect } from 'vitest'
import type { Stop, PriceLevel } from './types'

describe('Stop additive chip fields', () => {
  it('accepts hours[] / price enum / goodFor', () => {
    const s: Stop = {
      name: 'X',
      hours: ['Monday: 9:30 AM – 5:00 PM'],
      price: '$$',
      goodFor: 'Architecture lovers',
    }
    expect(s.price).toBe('$$')
    expect(s.hours?.length).toBe(1)
    const p: PriceLevel = '$$$$'
    expect(p).toBe('$$$$')
  })
})
