import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Guide from './Guide'

describe('Guide teaser', () => {
  it('renders the locked teaser copy', () => {
    render(<Guide />)
    expect(screen.getByRole('heading', { name: 'Guide' })).toBeInTheDocument()
    expect(screen.getByText('Your live travel companion.')).toBeInTheDocument()
    expect(
      screen.getByText(/Guide becomes active while you’re exploring your Voyage\./),
    ).toBeInTheDocument()
    expect(screen.getByText(/Coming in Phase 3/i)).toBeInTheDocument()
  })

  it('exposes the value props as an accessible list, not a feature dump', () => {
    render(<Guide />)
    const list = screen.getByRole('list', { name: 'What Guide will do' })
    expect(list).toBeInTheDocument()
    expect(screen.getByText('Navigate to the next stop')).toBeInTheDocument()
  })
})
