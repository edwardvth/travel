import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { bearing, compassLabel, useGeolocation } from './geo'

describe('bearing', () => {
  it('returns ~0° for due north', () => {
    expect(bearing({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 0)
  })
  it('returns ~90° for due east', () => {
    expect(bearing({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 0)
  })
  it('returns ~180° for due south', () => {
    expect(bearing({ lat: 1, lng: 0 }, { lat: 0, lng: 0 })).toBeCloseTo(180, 0)
  })
  it('normalizes into [0,360)', () => {
    const b = bearing({ lat: 0, lng: 0 }, { lat: -1, lng: -0.0001 })
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })
})

describe('compassLabel', () => {
  it('maps degrees to 8-point labels', () => {
    expect(compassLabel(0)).toBe('N')
    expect(compassLabel(45)).toBe('NE')
    expect(compassLabel(90)).toBe('E')
    expect(compassLabel(225)).toBe('SW')
    expect(compassLabel(359)).toBe('N')
  })
})

describe('useGeolocation', () => {
  afterEach(() => vi.restoreAllMocks())

  it("reports 'unsupported' when geolocation is absent", () => {
    const nav = navigator as { geolocation?: unknown }
    const orig = nav.geolocation
    delete nav.geolocation
    const { result } = renderHook(() => useGeolocation(true))
    expect(result.current.status).toBe('unsupported')
    nav.geolocation = orig
  })

  it('reports a granted position from watchPosition', async () => {
    const watch = vi.fn((ok: PositionCallback) => {
      ok({ coords: { latitude: 38.6, longitude: -90.2 } } as GeolocationPosition)
      return 1
    })
    vi.stubGlobal('navigator', { geolocation: { watchPosition: watch, clearWatch: vi.fn() } })
    const { result } = renderHook(() => useGeolocation(true))
    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(result.current.pos).toEqual({ lat: 38.6, lng: -90.2 })
  })

  it('does not watch when disabled', () => {
    const watch = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { watchPosition: watch, clearWatch: vi.fn() } })
    renderHook(() => useGeolocation(false))
    expect(watch).not.toHaveBeenCalled()
  })
})
