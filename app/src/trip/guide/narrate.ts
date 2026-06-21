// app/src/trip/guide/narrate.ts
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '../../lib/supabase'

/** Stable cache key for a (text, voice) pair — FNV-1a hex. Pure. */
export function narrationCacheKey(text: string, voiceId: string): string {
  let h = 0x811c9dc5
  const s = `${voiceId}::${text}`
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16)
}

/**
 * Slug of the deployed ElevenLabs TTS edge function. Supabase auto-named the
 * function `hyper-function` at creation (the display title was renamed to
 * "narrate" afterward, but the invoke-URL slug is fixed at create time). To use
 * a clean `narrate` slug, recreate the function under that name and change this.
 */
const NARRATE_FN_SLUG = 'hyper-function'

export function narrateProxyUrl(base = SUPABASE_URL): string {
  return `${base.replace(/\/$/, '')}/functions/v1/${NARRATE_FN_SLUG}`
}

async function authToken(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) return data.session.access_token } catch { /* anon */ }
  return SUPABASE_ANON_KEY
}

/**
 * Fetch a playable audio object-URL for `text` in `voiceId` via the narrate
 * proxy (which serves from cache or synthesizes + caches). Returns null on any
 * failure so the caller falls back to Web Speech. Never throws.
 */
export async function fetchNarrationUrl(text: string, voiceId: string): Promise<string | null> {
  try {
    const res = await fetch(narrateProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await authToken()), apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ text, voiceId, key: narrationCacheKey(text, voiceId) }),
    })
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}

/**
 * Web Speech fallback (free, on-device). Returns false if unsupported.
 * `rate` mirrors the narration-speed preference and is clamped to the range the
 * Web Speech spec allows (`[0.5, 2]`); the SPEEDS cycle already sits inside it.
 */
export function speakFallback(text: string, rate = 1): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false
  const u = new SpeechSynthesisUtterance(text)
  u.rate = Math.min(2, Math.max(0.5, rate))
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
  return true
}
