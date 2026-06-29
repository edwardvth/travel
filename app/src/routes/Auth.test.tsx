import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import Auth from './Auth'

// Mock FieldGlobe so jsdom doesn't try to create a WebGL context.
vi.mock('../home/FieldGlobe', () => ({ FieldGlobe: () => <div data-testid="field-globe" /> }))

// Auth pulls auth actions from context; provide a minimal stub.
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInGoogle: vi.fn(),
    magicLink: vi.fn(),
  }),
}))

function renderAuth(initialEntries: string[] = ['/auth']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Auth />
    </MemoryRouter>,
  )
}

describe('Auth', () => {
  it('defaults to sign-up (account creation)', () => {
    renderAuth(['/auth'])
    expect(screen.getByText('Start your travels')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('opens sign-in when ?mode=signin', () => {
    // Auth reads the global location.search (not the router) for the mode override.
    const orig = window.location.search
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?mode=signin', hash: '' },
      writable: true,
    })
    try {
      renderAuth()
      expect(screen.getByText('Welcome back')).toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: orig, hash: '' },
        writable: true,
      })
    }
  })

  it('renders the field-globe background behind the form', () => {
    renderAuth()
    expect(screen.getByTestId('field-globe')).toBeInTheDocument()
  })
})
