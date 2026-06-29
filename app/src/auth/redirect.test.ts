import { describe, it, expect, afterEach } from 'vitest'
import { getAuthRedirectTo, isNativePlatform, NATIVE_AUTH_CALLBACK } from './redirect'

type W = { Capacitor?: { isNativePlatform?: () => boolean } }

describe('getAuthRedirectTo (B1.5 web/native split)', () => {
  afterEach(() => {
    delete (window as unknown as W).Capacitor
  })

  it('is web by default and returns the /auth callback on the current origin', () => {
    expect(isNativePlatform()).toBe(false)
    expect(getAuthRedirectTo()).toBe(window.location.origin + '/auth')
  })

  it('returns the native deep link inside the Capacitor shell', () => {
    ;(window as unknown as W).Capacitor = { isNativePlatform: () => true }
    expect(isNativePlatform()).toBe(true)
    expect(getAuthRedirectTo()).toBe(NATIVE_AUTH_CALLBACK)
  })

  it('takes the web path when Capacitor is present but not native (the web build)', () => {
    ;(window as unknown as W).Capacitor = { isNativePlatform: () => false }
    expect(isNativePlatform()).toBe(false)
    expect(getAuthRedirectTo()).toBe(window.location.origin + '/auth')
  })
})
