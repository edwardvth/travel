// app/src/trip/guide/voices.test.ts
import { describe, it, expect } from 'vitest'
import { NARRATION_VOICES, DEFAULT_VOICE_ID, voiceLabel, resolveVoiceId } from './voices'

describe('voices', () => {
  it('default is Jay Wayne and present in the list', () => {
    expect(DEFAULT_VOICE_ID).toBe('8Ln42OXYupYsag45MAUy')
    expect(NARRATION_VOICES.some(v => v.id === DEFAULT_VOICE_ID)).toBe(true)
  })
  it('labels as "Name - Accent, Gender"', () => {
    expect(voiceLabel(NARRATION_VOICES.find(v => v.name === 'Rowan')!)).toBe('Rowan - British, Male')
  })
  it('resolveVoiceId falls back to default for unknown/missing', () => {
    expect(resolveVoiceId('nope')).toBe(DEFAULT_VOICE_ID)
    expect(resolveVoiceId(undefined)).toBe(DEFAULT_VOICE_ID)
    expect(resolveVoiceId('pXgsayqpmuFfzTsJw2ni')).toBe('pXgsayqpmuFfzTsJw2ni')
  })
})
