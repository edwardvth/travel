import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HeroSearchPill } from './HeroSearchPill'

// Keep the real framer-motion (the pill renders motion.* elements) but force
// reduced motion so the CTA is expanded up-front and no typing timers are needed
// for these behavioural tests.
vi.mock('framer-motion', async (importActual) => {
  const actual = await importActual<typeof import('framer-motion')>()
  return { ...actual, useReducedMotion: () => true }
})

describe('HeroSearchPill', () => {
  it('submits the typed value when Enter is pressed in the input', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<HeroSearchPill onSubmit={onSubmit} />)

    const input = screen.getByRole('textbox', { name: /where do you want to go/i })
    await user.type(input, 'Kyoto{Enter}')

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('Kyoto')
  })

  it('submits when the button is clicked', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<HeroSearchPill onSubmit={onSubmit} />)

    await user.type(
      screen.getByRole('textbox', { name: /where do you want to go/i }),
      'Lisbon',
    )
    await user.click(screen.getByRole('button', { name: /start planning/i }))

    expect(onSubmit).toHaveBeenCalledWith('Lisbon')
  })

  it('gives the input and the button accessible names', () => {
    render(<HeroSearchPill onSubmit={vi.fn()} />)

    expect(
      screen.getByRole('textbox', { name: /where do you want to go/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /start planning/i }),
    ).toBeInTheDocument()
  })

  it('shows the animated placeholder when empty and unfocused, then hides it on focus', async () => {
    const user = userEvent.setup()
    render(<HeroSearchPill onSubmit={vi.fn()} />)

    // Empty + unfocused → the Typewriter placeholder is rendered.
    expect(screen.getByTestId('typewriter-text')).toBeInTheDocument()

    // Focusing the real input hides the animated placeholder.
    await user.click(
      screen.getByRole('textbox', { name: /where do you want to go/i }),
    )
    expect(screen.queryByTestId('typewriter-text')).not.toBeInTheDocument()
  })
})
