import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './supabase'
import type { PlaceDescription, EnrichState } from '../trip/placeCache/types'

const FN = 'enrich-place'
const fnUrl = () => `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${FN}`

async function authToken(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) return data.session.access_token } catch { /* anon */ }
  return SUPABASE_ANON_KEY
}
async function callFn(payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown | null> {
  try {
    const res = await fetch(fnUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await authToken()), apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(payload), signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export interface PlaceHints { name?: string; destination?: string; coords?: { lat: number; lng: number }; placeTypes?: string[] }
export interface DescriptionResult { state: EnrichState; content?: PlaceDescription }

function toResult(json: unknown): DescriptionResult {
  const j = (json ?? {}) as { status?: string; content?: PlaceDescription }
  const state: EnrichState =
    j.status === 'ready' ? 'ready' : j.status === 'pending' ? 'pending' : j.status === 'unsupported' ? 'unsupported' : 'failed'
  return state === 'ready' && j.content ? { state, content: j.content } : { state }
}

/** Get one place's description (cache/generate via the function). Never throws. */
export async function fetchPlaceDescription(placeId: string, hints: PlaceHints, signal?: AbortSignal): Promise<DescriptionResult> {
  if (!placeId) return { state: 'failed' }
  return toResult(await callFn({ action: 'get', placeId, ...hints }, signal))
}

/** Ready-only batch for pre-warm (no generation). Returns a placeId→content map. Never throws. */
export async function fetchPlaceDescriptionsBatch(placeIds: string[], signal?: AbortSignal): Promise<Record<string, PlaceDescription>> {
  if (placeIds.length === 0) return {}
  const json = await callFn({ action: 'getBatch', placeIds }, signal) as { results?: Record<string, PlaceDescription> } | null
  return json?.results ?? {}
}

/** Founder-only force/regenerate. Never throws. */
export async function regeneratePlace(placeId: string, force = false): Promise<DescriptionResult> {
  if (!placeId) return { state: 'failed' }
  return toResult(await callFn({ action: 'regenerate', placeId, force }))
}
