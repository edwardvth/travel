import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HeroToggle } from './HeroToggle'

describe('HeroToggle', () => {
  it('renders both options with accessible names', () => {
    render(<HeroToggle mode="cinematic" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /cinematic/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /explorer/i })).toBeInTheDocument()
  })

  it('reflects the active mode via aria-pressed', () => {
    render(<HeroToggle mode="cinematic" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /cinematic/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /explorer/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('calls onChange("explorer") when Explorer is clicked', async () => {
    const onChange = vi.fn()
    render(<HeroToggle mode="cinematic" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /explorer/i }))
    expect(onChange).toHaveBeenCalledWith('explorer')
  })

  it('calls onChange("cinematic") when Cinematic is clicked from explorer mode', async () => {
    const onChange = vi.fn()
    render(<HeroToggle mode="explorer" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /cinematic/i }))
    expect(onChange).toHaveBeenCalledWith('cinematic')
  })
})
