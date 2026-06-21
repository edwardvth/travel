import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as narrate from './narrate'
import { ListenButton } from './ListenButton'

describe('ListenButton', () => {
  beforeEach(() => {
    vi.spyOn(narrate, 'fetchNarrationUrl').mockResolvedValue(null)
    vi.spyOn(narrate, 'speakFallback').mockReturnValue(true)
  })
  afterEach(() => vi.restoreAllMocks())

  it('does NOT fetch or play narration on mount (never auto-plays)', () => {
    render(<ListenButton text="Hello" voiceId="v1" />)
    expect(narrate.fetchNarrationUrl).not.toHaveBeenCalled()
    expect(narrate.speakFallback).not.toHaveBeenCalled()
  })

  it('renders a tappable Listen control', () => {
    render(<ListenButton text="Hello" voiceId="v1" />)
    expect(screen.getByRole('button', { name: /listen/i })).toBeInTheDocument()
  })
})
