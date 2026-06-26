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
