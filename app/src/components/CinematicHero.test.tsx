import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CinematicHero } from './CinematicHero'

describe('CinematicHero', () => {
  it('renders headline, subcopy, and the search pill', () => {
    render(<CinematicHero headline="Where to next?" subcopy="Name a city." onSubmit={vi.fn()} />)
    expect(screen.getByText('Where to next?')).toBeInTheDocument()
    expect(screen.getByText('Name a city.')).toBeInTheDocument()
    // the pill input is labelled "Where do you want to go?"
    expect(screen.getByLabelText(/where do you want to go/i)).toBeInTheDocument()
  })

  it('applies the brightness filter to the video layer when set', () => {
    const { container } = render(
      <CinematicHero headline="x" subcopy="y" brightness={1.8} onSubmit={vi.fn()} />,
    )
    expect(container.innerHTML).toMatch(/brightness\(1\.8\)/)
  })
})
