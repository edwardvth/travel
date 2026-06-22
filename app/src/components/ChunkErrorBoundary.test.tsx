import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChunkErrorBoundary } from './ChunkErrorBoundary'

/** A child that throws on render, to trip the boundary. */
function Boom({ message }: { message: string }): never {
  throw new Error(message)
}

describe('ChunkErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught errors to console.error; silence the expected noise.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the stale-version message + Reload for a chunk-load error', () => {
    render(
      <ChunkErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: https://x/assets/Guide-abc.js" />
      </ChunkErrorBoundary>,
    )
    expect(screen.getByText(/Couldn't load the latest version/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('shows the generic crash message + Reload for a non-chunk error', () => {
    render(
      <ChunkErrorBoundary>
        <Boom message="Cannot read properties of undefined (reading 'x')" />
      </ChunkErrorBoundary>,
    )
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('renders children when there is no error', () => {
    render(
      <ChunkErrorBoundary>
        <p>hello</p>
      </ChunkErrorBoundary>,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})
