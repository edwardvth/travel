import { describe, it, expect } from 'vitest'
import { authUrlError } from './authErrors'

describe('authUrlError', () => {
  it('returns null with no error in the URL', () => {
    expect(authUrlError('', '')).toBeNull()
  })
  it('explains expired/used links gently', () => {
    expect(authUrlError('', 'error_description=otp+expired'))
      .toMatch(/expired or was opened/i)
  })
  it('passes through other descriptions, decoding +', () => {
    expect(authUrlError('?error_description=Email+not+confirmed', ''))
      .toBe('Email not confirmed')
  })
})
