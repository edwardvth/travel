import { describe, expect, it } from 'vitest'
import { CITIES, project } from './cities'
import { HERO_DESTINATIONS } from '../data/heroDestinations'

describe('project (equirectangular)', () => {
  it('maps (lat 0, lng 0) to the exact center', () => {
    const { x, y } = project(0, 0, 1000, 500)
    expect(x).toBeCloseTo(500, 6)
    expect(y).toBeCloseTo(250, 6)
  })

  it('maps the top-left corner (lat 90, lng -180) to (0, 0)', () => {
    const { x, y } = project(90, -180, 1000, 500)
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(0, 6)
  })

  it('maps the bottom-right corner (lat -90, lng 180) to (w, h)', () => {
    const { x, y } = project(-90, 180, 1000, 500)
    expect(x).toBeCloseTo(1000, 6)
    expect(y).toBeCloseTo(500, 6)
  })

  it('places eastern longitudes right of center and northern latitudes above', () => {
    const center = project(0, 0, 360, 180)
    const tokyo = project(35.68, 139.65, 360, 180)
    expect(tokyo.x).toBeGreaterThan(center.x) // east
    expect(tokyo.y).toBeLessThan(center.y) // north (smaller y)
  })
})

describe('CITIES', () => {
  it('has an entry for every hero destination', () => {
    const names = CITIES.map((c) => c.name)
    for (const dest of HERO_DESTINATIONS) {
      expect(names).toContain(dest)
    }
    expect(CITIES).toHaveLength(HERO_DESTINATIONS.length)
  })

  it('has finite, in-range coordinates for every city', () => {
    for (const c of CITIES) {
      expect(Number.isFinite(c.lat)).toBe(true)
      expect(Number.isFinite(c.lng)).toBe(true)
      expect(c.lat).toBeGreaterThanOrEqual(-90)
      expect(c.lat).toBeLessThanOrEqual(90)
      expect(c.lng).toBeGreaterThanOrEqual(-180)
      expect(c.lng).toBeLessThanOrEqual(180)
    }
  })
})
