import { describe, it, expect } from 'vitest'
import { weatherUrl } from './useWeather'

describe('weatherUrl', () => {
  it('uses Open-Meteo defaults (celsius) for metric — no temperature_unit override', () => {
    const u = weatherUrl(41.88, -87.63, '2026-06-25', 'metric')
    expect(u).toContain('latitude=41.88')
    expect(u).toContain('longitude=-87.63')
    expect(u).toContain('start_date=2026-06-25')
    expect(u).toContain('end_date=2026-06-25')
    expect(u).not.toContain('temperature_unit')
  })

  it('requests fahrenheit for imperial', () => {
    expect(weatherUrl(41.88, -87.63, '2026-06-25', 'imperial')).toContain('temperature_unit=fahrenheit')
  })
})
