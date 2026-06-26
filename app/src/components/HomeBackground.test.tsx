import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HomeBackground } from './HomeBackground'

describe('HomeBackground', () => {
  it('always renders the StaticBackdrop as an immediate paint', () => {
    const { container } = render(<HomeBackground />)
    // The static gradient layer is present from first render.
    expect(container.innerHTML).toMatch(/radial-gradient/)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('aria-hidden', 'true')
  })
})

import { vi } from 'vitest'
import { __resetWebGL2Cache } from '../home/webgl-support'

vi.mock('../home/FieldGlobe', () => ({ FieldGlobe: () => <div data-testid="field-globe" /> }))

describe('HomeBackground — shader gating', () => {
  it('mounts FieldGlobe only when WebGL2 is supported', () => {
    __resetWebGL2Cache()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((id: string) => (id === 'webgl2' ? ({} as WebGL2RenderingContext) : null)) as never,
    )
    const { getByTestId, unmount } = render(<HomeBackground />)
    expect(getByTestId('field-globe')).toBeInTheDocument()
    unmount()
    vi.restoreAllMocks()
  })

  it('renders only the StaticBackdrop when WebGL2 is unsupported', () => {
    __resetWebGL2Cache()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never)
    const { queryByTestId, container } = render(<HomeBackground />)
    expect(queryByTestId('field-globe')).not.toBeInTheDocument()
    expect(container.innerHTML).toMatch(/radial-gradient/)
    vi.restoreAllMocks()
  })
})
