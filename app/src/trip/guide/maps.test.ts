import { describe, it, expect } from 'vitest'
import { directionsUrl, detectPlatform } from './maps'

const coords = { lat: 38.6247, lng: -90.1848 }

describe('directionsUrl', () => {
  it('iOS → Apple Maps walking url', () => {
    const u = directionsUrl({ name: 'Old Courthouse', coords, destination: 'St. Louis' }, 'ios')
    expect(u).toContain('maps.apple.com')
    expect(u).toContain('daddr=38.6247,-90.1848')
    expect(u).toContain('dirflg=w')
  })
  it('Android → geo: uri so the default app opens', () => {
    const u = directionsUrl({ name: 'Old Courthouse', coords, destination: 'St. Louis' }, 'android')
    expect(u.startsWith('geo:38.6247,-90.1848')).toBe(true)
    expect(u).toContain('Old%20Courthouse')
  })
  it('desktop → Google Maps walking url', () => {
    const u = directionsUrl({ name: 'Old Courthouse', coords, destination: 'St. Louis' }, 'desktop')
    expect(u).toContain('google.com/maps/dir/')
    expect(u).toContain('destination=38.6247,-90.1848')
    expect(u).toContain('travelmode=walking')
  })
  it('no coords → name+destination query', () => {
    const u = directionsUrl({ name: 'Old Courthouse', destination: 'St. Louis' }, 'desktop')
    expect(u).toContain('query=Old%20Courthouse%2C%20St.%20Louis')
  })
})

describe('detectPlatform', () => {
  it('detects iOS from a UA string', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios')
  })
  it('detects Android from a UA string', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14)')).toBe('android')
  })
  it('falls back to desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop')
  })
})
