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

    // Label is "Interesting Facts" but the data key/prop stays `notice`.
    fireEvent.click(screen.getByRole('tab', { name: 'Interesting Facts' }))
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

  it('renders the middle tab as "Interesting Facts" (data key still notice)', () => {
    render(
      <StoryTabs story="s" notice="n" experience="e" active="notice" onChange={() => {}} />,
    )
    expect(screen.getByRole('tab', { name: 'Interesting Facts' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Notice' })).not.toBeInTheDocument()
  })

  it('renders HTML body as clean paragraphs with no raw tags', () => {
    const { container } = render(
      <StoryTabs
        story="<p>First para.</p><p>Second **para**.</p>"
        notice="n"
        experience="e"
        active="story"
        onChange={() => {}}
      />,
    )
    const ps = container.querySelectorAll('[role="tabpanel"] p')
    expect(ps.length).toBe(2)
    expect(ps[0].textContent).toBe('First para.')
    expect(ps[1].textContent).toBe('Second para.')
    // Markdown emphasis preserved; no literal "<p>" leaked into the DOM text.
    expect(ps[1].querySelector('strong')?.textContent).toBe('para')
    expect(container.textContent).not.toContain('<p>')
  })

  it('marks the active tab aria-selected', () => {
    render(
      <StoryTabs story="s" notice="n" experience="e" active="experience" onChange={() => {}} />,
    )
    expect(screen.getByRole('tab', { name: 'Experience' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'false')
  })
})
