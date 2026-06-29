import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Logo } from './Logo'

describe('Logo', () => {
  it('renders the Passage wordmark', () => {
    render(<Logo />)
    expect(screen.getByText('Passage')).toBeInTheDocument()
  })
})
