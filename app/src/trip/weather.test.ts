import { describe, it, expect } from 'vitest'
import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, Snowflake, CloudLightning } from 'lucide-react'
import { weatherFromCode } from './icons'

describe('weatherFromCode', () => {
  it('maps clear / partly cloudy / cloudy', () => {
    expect(weatherFromCode(0)).toEqual({ label: 'clear', icon: Sun })
    expect(weatherFromCode(1)).toEqual({ label: 'partly cloudy', icon: CloudSun })
    expect(weatherFromCode(2)).toEqual({ label: 'partly cloudy', icon: CloudSun })
    expect(weatherFromCode(3)).toEqual({ label: 'cloudy', icon: Cloud })
  })

  it('maps fog', () => {
    expect(weatherFromCode(45).icon).toBe(CloudFog)
    expect(weatherFromCode(48).icon).toBe(CloudFog)
  })

  it('maps drizzle and rain ranges', () => {
    expect(weatherFromCode(51).icon).toBe(CloudDrizzle)
    expect(weatherFromCode(57).icon).toBe(CloudDrizzle)
    expect(weatherFromCode(61).icon).toBe(CloudRain)
    expect(weatherFromCode(67).icon).toBe(CloudRain)
  })

  it('maps snow and snow showers', () => {
    expect(weatherFromCode(71).icon).toBe(Snowflake)
    expect(weatherFromCode(77).icon).toBe(Snowflake)
    expect(weatherFromCode(85).icon).toBe(Snowflake)
    expect(weatherFromCode(86).icon).toBe(Snowflake)
  })

  it('maps showers and thunderstorms', () => {
    expect(weatherFromCode(80).icon).toBe(CloudRain)
    expect(weatherFromCode(82).icon).toBe(CloudRain)
    expect(weatherFromCode(95).icon).toBe(CloudLightning)
    expect(weatherFromCode(99).icon).toBe(CloudLightning)
  })

  it('falls back to clear/Sun for unknown codes', () => {
    expect(weatherFromCode(1234)).toEqual({ label: 'clear', icon: Sun })
    expect(weatherFromCode(-1)).toEqual({ label: 'clear', icon: Sun })
  })
})
