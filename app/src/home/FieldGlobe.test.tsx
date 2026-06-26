import { render } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { FieldGlobe } from './FieldGlobe'

vi.mock('./useEarthTexture', () => ({ useEarthTexture: () => null }))

afterEach(() => vi.restoreAllMocks())

describe('FieldGlobe', () => {
  it('renders an aria-hidden canvas that starts transparent (opacity 0)', () => {
    // jsdom getContext('webgl2') returns null → component must bail gracefully.
    const { container } = render(<FieldGlobe />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas).toBeTruthy()
    expect(canvas.style.opacity).toBe('0')
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not start an animation loop when WebGL2 is unavailable', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    render(<FieldGlobe />)
    // No GL context → no render loop scheduled.
    expect(raf).not.toHaveBeenCalled()
    raf.mockRestore()
  })

  it('renders the static image when staticSrc is set and WebGL is unavailable', () => {
    // jsdom getContext('webgl2') is null → static fallback should show.
    const { container } = render(<FieldGlobe staticSrc="/assets/globe-still.webp" />)
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBe('/assets/globe-still.webp')
  })

  it('does not start a loop when active=false', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    render(<FieldGlobe active={false} />)
    expect(raf).not.toHaveBeenCalled()
    raf.mockRestore()
  })
})
