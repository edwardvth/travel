import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StopMinimap } from './StopMinimap'

const DEST = { lat: 38.627, lng: -90.1994 }

describe('StopMinimap (jsdom — leaflet init skipped)', () => {
  it('renders a labelled map region and the loading skeleton', () => {
    render(<StopMinimap destination={DEST} user={null} stopName="Gateway Arch" className="absolute inset-0" />)
    expect(screen.getByRole('img', { name: /your location relative to Gateway Arch/i })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: /loading minimap/i })).toBeInTheDocument()
  })

  it('does not crash when a user position is provided', () => {
    render(<StopMinimap destination={DEST} user={{ lat: 38.6247, lng: -90.1848 }} stopName="Gateway Arch" />)
    expect(screen.getByRole('img', { name: /Gateway Arch/i })).toBeInTheDocument()
  })
})
