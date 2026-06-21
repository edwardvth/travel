// app/src/trip/guide/placePhoto.ts
//
// PAID, DORMANT hero-image fallback client: Google Places Photos (proxied).
//
// The last image layer before the placeholder, tried only when Wikipedia
// pageimages AND Wikimedia Commons both miss. This client NEVER holds the
// Google Places API key — it POSTs the query to the `place-photo` edge
// function, which holds the key server-side. When the key is unset the
// function answers `{ "url": null }` and this returns null, so the app behaves
// EXACTLY as today (graceful no-op). Never throws.
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '../../lib/supabase'

/**
 * Slug of the deployed Google Places Photos edge function. The invoke-URL slug
 * is fixed at create time — the function must be deployed under this exact name
 * (`supabase functions deploy place-photo`). If Supabase auto-renames the slug
 * (as it did for narrate -> "hyper-function"), change this to match.
 */
const PLACE_PHOTO_FN_SLUG = 'place-photo'

export function placePhotoProxyUrl(base = SUPABASE_URL): string {
  return `${base.replace(/\/$/, '')}/functions/v1/${PLACE_PHOTO_FN_SLUG}`
}

async function authToken(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) return data.session.access_token } catch { /* anon */ }
  return SUPABASE_ANON_KEY
}

/**
 * Resolve a hero-image object-URL for `query` (e.g. "Name, Destination") via the
 * place-photo proxy, or null. The proxy returns either the JPEG bytes (HIT/MISS)
 * or JSON `{ url: null }` when there's no photo / no key. We branch on the
 * response Content-Type: an `image/*` body becomes an object URL; anything else
 * (JSON null, error) is null. Guards an empty query. Never throws.
 */
export async function fetchPlacePhotoUrl(query: string): Promise<string | null> {
  const q = query.trim()
  if (!q) return null
  try {
    const res = await fetch(placePhotoProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await authToken()), apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ query: q }),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.startsWith('image/')) return null // JSON { url: null } or anything non-image -> fall through
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}
