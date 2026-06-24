import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StopSearchInput } from './StopSearchInput'
import type React from 'react'

vi.mock('../lib/placeSearch', async (orig) => ({
  ...(await orig<typeof import('../lib/placeSearch')>()),
  fetchPredictions: vi.fn(async () => [{ placeId: 'p1', primaryText: 'Gateway Arch', secondaryText: 'St. Louis, MO', types: ['tourist_attraction'] }]),
}))

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

describe('StopSearchInput', () => {
  it('shows predictions and calls onSelect with the prediction + session token', async () => {
    const onSelect = vi.fn()
    wrap(<StopSearchInput region={{ countryCode: 'us' }} onSelect={onSelect} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'gateway' } })
    const opt = await screen.findByText('Gateway Arch')
    fireEvent.mouseDown(opt)
    await waitFor(() => expect(onSelect).toHaveBeenCalled())
    expect(onSelect.mock.calls[0][0]).toMatchObject({ placeId: 'p1', primaryText: 'Gateway Arch' })
    expect(typeof onSelect.mock.calls[0][1]).toBe('string') // session token
  })
})
