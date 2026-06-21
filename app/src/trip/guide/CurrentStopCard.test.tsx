import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Stop } from '../../types'
import { CurrentStopCard } from './CurrentStopCard'
import { GuideProgress } from './GuideProgress'

const stop: Stop = { name: 'Old Courthouse', type: 'Civic landmark' }

function renderCard(over: Partial<Parameters<typeof CurrentStopCard>[0]> = {}) {
  const onDirections = vi.fn()
  const onComplete = vi.fn()
  const onTabChange = vi.fn()
  render(
    <CurrentStopCard
      stop={stop}
      heroUrl={null}
      distanceM={480}
      etaMin={6}
      headingLabel="NE"
      story="The story."
      notice="The notice."
      experience="The experience."
      voiceId="v1"
      onDirections={onDirections}
      onComplete={onComplete}
      activeTab="story"
      onTabChange={onTabChange}
      {...over}
    />,
  )
  return { onDirections, onComplete, onTabChange }
}

describe('CurrentStopCard', () => {
  it('shows the place name and the live NOW chip with distance + eta + heading', () => {
    renderCard()
    expect(screen.getByRole('heading', { name: 'Old Courthouse' })).toBeInTheDocument()
    expect(screen.getByText(/NOW · 480 m · 6 MIN · NE/)).toBeInTheDocument()
  })

  it('omits the heading segment gracefully when headingLabel is absent', () => {
    renderCard({ headingLabel: null })
    expect(screen.getByText('NOW · 480 m · 6 MIN')).toBeInTheDocument()
  })

  it('fires onDirections and onComplete', () => {
    const { onDirections, onComplete } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Directions' }))
    expect(onDirections).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Mark Old Courthouse complete/ }))
    expect(onComplete).toHaveBeenCalled()
  })
})

describe('GuideProgress', () => {
  it('renders STOP n OF m and the completed line', () => {
    render(
      <GuideProgress
        stopNumber={3}
        stopCount={7}
        dayLabel="DAY 1"
        completedCount={2}
        completedNames={['Hotel', 'Sump coffee']}
      />,
    )
    expect(screen.getByText('STOP 3 OF 7')).toBeInTheDocument()
    expect(screen.getByText('DAY 1')).toBeInTheDocument()
    expect(screen.getByText(/2 stops complete · Hotel, Sump coffee/)).toBeInTheDocument()
  })
})
