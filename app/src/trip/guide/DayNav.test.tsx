import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DayNav } from './DayNav'

function renderNav(over: Partial<Parameters<typeof DayNav>[0]> = {}) {
  const onPrev = vi.fn()
  const onNext = vi.fn()
  const onPickDay = vi.fn()
  const onAddDay = vi.fn()
  const props = {
    dayIndex: 1,
    dayCount: 3,
    dayLabels: ['Aug 5', 'Aug 6', 'Aug 7'],
    onPrev,
    onNext,
    onPickDay,
    onAddDay,
    canEdit: true,
    ...over,
  }
  render(<DayNav {...props} />)
  return { onPrev, onNext, onPickDay, onAddDay }
}

describe('DayNav', () => {
  it('renders the active date and both neighbour labels in the middle', () => {
    renderNav()
    expect(screen.getByText('Aug 6')).toBeInTheDocument() // active
    expect(screen.getByText('Aug 5')).toBeInTheDocument() // prev (faded)
    expect(screen.getByText('Aug 7')).toBeInTheDocument() // next (faded)
  })

  it('calls onPrev / onNext when the chevron buttons are pressed', () => {
    const { onPrev, onNext } = renderNav()
    fireEvent.click(screen.getByLabelText('Previous day'))
    fireEvent.click(screen.getByLabelText('Next day'))
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('at the start boundary offers Add Day in place of the prev neighbour', () => {
    const { onAddDay } = renderNav({ dayIndex: 0 })
    expect(screen.queryByLabelText('Previous day')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Add a day'))
    expect(onAddDay).toHaveBeenCalledWith('before')
  })

  it('at the end boundary offers Add Day in place of the next neighbour', () => {
    const { onAddDay } = renderNav({ dayIndex: 2 })
    expect(screen.queryByLabelText('Next day')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Add a day'))
    expect(onAddDay).toHaveBeenCalledWith('after')
  })

  it('hides Add Day when the viewer cannot edit', () => {
    renderNav({ dayIndex: 0, canEdit: false })
    expect(screen.queryByLabelText('Add a day')).not.toBeInTheDocument()
  })

  it('opens the day picker and jumps to a chosen day', () => {
    const { onPickDay } = renderNav()
    fireEvent.click(screen.getByLabelText('Pick a day'))
    // The picker lists every day; pick Day 3 (Aug 7).
    const items = screen.getAllByText('Aug 7')
    // The last "Aug 7" is the picker row (the first is the faded next label).
    fireEvent.click(items[items.length - 1])
    expect(onPickDay).toHaveBeenCalledWith(2)
  })
})
