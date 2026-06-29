import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AnimatedLink } from './animated-link'

describe('AnimatedLink', () => {
  it('renders an anchor with its href and text', () => {
    render(<AnimatedLink href="/auth">Sign in</AnimatedLink>)
    const link = screen.getByRole('link', { name: /sign in/i })
    expect(link).toHaveAttribute('href', '/auth')
  })

  it('shows the arrow by default and hides it when showArrow is false', () => {
    const { container, rerender } = render(<AnimatedLink href="#">Go</AnimatedLink>)
    expect(container.querySelector('svg')).not.toBeNull()
    rerender(
      <AnimatedLink href="#" showArrow={false}>
        Go
      </AnimatedLink>,
    )
    expect(container.querySelector('svg')).toBeNull()
  })

  it('applies the underline classes for each variant', () => {
    const { rerender } = render(
      <AnimatedLink href="#" variant="center">
        X
      </AnimatedLink>,
    )
    expect(screen.getByRole('link').className).toContain('before:origin-center')
    rerender(
      <AnimatedLink href="#" variant="right">
        X
      </AnimatedLink>,
    )
    expect(screen.getByRole('link').className).toContain('before:origin-left')
  })
})
