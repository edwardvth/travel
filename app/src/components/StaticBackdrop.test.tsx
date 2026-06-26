import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StaticBackdrop } from './StaticBackdrop'

describe('StaticBackdrop', () => {
  it('renders a decorative absolute backdrop layer', () => {
    const { container } = render(<StaticBackdrop />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toBeTruthy()
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(root.className).toContain('absolute')
    expect(root.getAttribute('style')).toMatch(/radial-gradient/)
  })
})
