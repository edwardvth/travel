// app/src/trip/guide/voices.ts
export interface NarrationVoice { id: string; name: string; accent: string; gender: string }

export const NARRATION_VOICES: readonly NarrationVoice[] = [
  { id: 'pXgsayqpmuFfzTsJw2ni', name: 'Matthew',   accent: 'American', gender: 'Male' },
  { id: 'jg80CzGPSxCeNz7dJVDZ', name: 'Tom',       accent: 'Neutral',  gender: 'Male' },
  { id: 'xzZRXG86mSM3naOyL9fa', name: 'Rowan',     accent: 'British',  gender: 'Male' },
  { id: '8Ln42OXYupYsag45MAUy', name: 'Jay Wayne', accent: 'American', gender: 'Male' },
  { id: 'wScwPA1qCkWo5R2dmlS8', name: 'Charlotte', accent: 'English',  gender: 'Female' },
] as const

export const DEFAULT_VOICE_ID = '8Ln42OXYupYsag45MAUy' // Jay Wayne

export function voiceLabel(v: NarrationVoice): string {
  return `${v.name} - ${v.accent}, ${v.gender}`
}

/** A known voice id, or the default. */
export function resolveVoiceId(id: string | undefined): string {
  return NARRATION_VOICES.some(v => v.id === id) ? (id as string) : DEFAULT_VOICE_ID
}
