// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = readFileSync(fileURLToPath(new URL('./StopDetail.tsx', import.meta.url)), 'utf8')

describe('StopDetail has no external-navigation affordances (Plan = designing)', () => {
  it('has no google.com/maps deep link', () => {
    expect(src).not.toContain('google.com/maps')
  })
  it('has no static-map peek image', () => {
    expect(src).not.toContain('staticmap.openstreetmap.de')
  })
  it('has no "Navigate" CTA', () => {
    expect(src).not.toMatch(/>\s*Navigate\s*</)
  })
})
