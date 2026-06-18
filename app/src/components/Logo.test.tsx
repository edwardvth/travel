import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Logo } from './Logo'

describe('Logo', () => {
  it('renders the Voyager wordmark', () => {
    render(<Logo />)
    expect(screen.getByText('Voyager')).toBeInTheDocument()
  })
})
