import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { StoryTabs } from './StoryTabs'

describe('StoryTabs', () => {
  it('renders the active body and switches it via onChange', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <StoryTabs
        story="The story body."
        notice="The notice body."
        experience="The experience body."
        active="story"
        onChange={onChange}
      />,
    )
    expect(screen.getByText('The story body.')).toBeInTheDocument()
    expect(screen.queryByText('The notice body.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Notice' }))
    expect(onChange).toHaveBeenCalledWith('notice')

    // Parent-driven: re-render with the new active tab shows its body.
    rerender(
      <StoryTabs
        story="The story body."
        notice="The notice body."
        experience="The experience body."
        active="notice"
        onChange={onChange}
      />,
    )
    expect(screen.getByText('The notice body.')).toBeInTheDocument()
    expect(screen.queryByText('The story body.')).not.toBeInTheDocument()
  })

  it('marks the active tab aria-selected', () => {
    render(
      <StoryTabs story="s" notice="n" experience="e" active="experience" onChange={() => {}} />,
    )
    expect(screen.getByRole('tab', { name: 'Experience' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'false')
  })
})
