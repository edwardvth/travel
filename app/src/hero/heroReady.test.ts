import { describe, it, expect, beforeEach, vi } from 'vitest'
import { signalHeroReady, onHeroReady, _resetHeroReady } from './heroReady'

beforeEach(() => {
  _resetHeroReady()
})

describe('heroReady', () => {
  it('onHeroReady fires after signalHeroReady', () => {
    const cb = vi.fn()
    onHeroReady(cb)
    expect(cb).not.toHaveBeenCalled()
    signalHeroReady()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('subscribing after it already fired still calls back (async)', async () => {
    vi.useFakeTimers()
    signalHeroReady()
    const cb = vi.fn()
    onHeroReady(cb)
    // Fires async via setTimeout(0).
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(cb).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('only fires once even if signalled multiple times', () => {
    const cb = vi.fn()
    onHeroReady(cb)
    signalHeroReady()
    signalHeroReady()
    signalHeroReady()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('_resetHeroReady resets the fired state', () => {
    signalHeroReady()
    _resetHeroReady()
    const cb = vi.fn()
    onHeroReady(cb)
    // After reset, not yet fired → callback should not run synchronously.
    expect(cb).not.toHaveBeenCalled()
    signalHeroReady()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('unsubscribe prevents the callback from firing', () => {
    const cb = vi.fn()
    const unsub = onHeroReady(cb)
    unsub()
    signalHeroReady()
    expect(cb).not.toHaveBeenCalled()
  })
})
