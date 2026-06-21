import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Stop } from '../../types'
import { ArrivingBanner } from './ArrivingBanner'
import { ArrivalView } from './ArrivalView'

const stop: Stop = { name: 'Gateway Arch' }

describe('ArrivingBanner', () => {
  it('renders the arriving copy and reports open + dismiss', () => {
    const onOpen = vi.fn()
    const onDismiss = vi.fn()
    render(<ArrivingBanner name="Rijksmuseum" onOpen={onOpen} onDismiss={onDismiss} />)
    expect(screen.getByText(/You're arriving at/)).toBeInTheDocument()
    expect(screen.getByText('Rijksmuseum')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /View Guide/ }))
    expect(onOpen).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Dismiss arrival notice/ }))
    expect(onDismiss).toHaveBeenCalled()
  })
})

describe('ArrivalView', () => {
  it('shows YOU\'VE ARRIVED, the name, and fires onComplete', () => {
    const onComplete = vi.fn()
    render(
      <ArrivalView
        stop={stop}
        heroUrl={null}
        story="The story."
        notice="The notice."
        experience="The experience."
        voiceId="v1"
        onComplete={onComplete}
        activeTab="story"
        onTabChange={() => {}}
        telemetry="SAARINEN · 1965"
        nextLabel="City Museum · 8 MIN"
      />,
    )
    expect(screen.getByText("YOU'VE ARRIVED")).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gateway Arch' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mark complete & continue/ }))
    expect(onComplete).toHaveBeenCalled()
    // After completing, the button settles to "Completed".
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })
})
