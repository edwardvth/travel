import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import Auth from './Auth'

// Mock FieldGlobe so jsdom doesn't try to create a WebGL context.
vi.mock('../home/FieldGlobe', () => ({ FieldGlobe: () => <div data-testid="field-globe" /> }))

// Hoisted so the test can assert on the same fns the component receives.
const mocks = vi.hoisted(() => ({ signInApple: vi.fn(), signInGoogle: vi.fn() }))

// Auth pulls auth actions from context; provide a minimal stub.
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInGoogle: mocks.signInGoogle,
    signInApple: mocks.signInApple,
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

  // Guideline 4.8: offering Google requires offering Sign in with Apple too.
  it('offers Sign in with Apple and triggers it on click', async () => {
    renderAuth()
    const apple = screen.getByRole('button', { name: /continue with apple/i })
    expect(apple).toBeInTheDocument()
    fireEvent.click(apple)
    await waitFor(() => expect(mocks.signInApple).toHaveBeenCalled())
  })
})
