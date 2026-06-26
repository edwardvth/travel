import { describe, it, expect, vi, afterEach } from 'vitest'
import { supportsWebGL2, __resetWebGL2Cache } from './webgl-support'

afterEach(() => vi.restoreAllMocks())

describe('supportsWebGL2', () => {
  it('returns false when getContext yields no webgl2 (jsdom default)', () => {
    __resetWebGL2Cache()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never)
    expect(supportsWebGL2()).toBe(false)
  })

  it('returns true when a webgl2 context is available', () => {
    __resetWebGL2Cache()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((id: string) => (id === 'webgl2' ? ({} as WebGL2RenderingContext) : null)) as never,
    )
    expect(supportsWebGL2()).toBe(true)
  })
})
