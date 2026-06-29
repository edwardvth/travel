import { supabase } from '../lib/supabase'

/** The deployed slug of the Unsplash proxy edge function. */
const UNSPLASH_FN_SLUG = 'unsplash-photo'

/**
 * Fetch a high-quality cover image URL for `query` from Unsplash, via the
 * server-side proxy (the Access Key never reaches the client). Returns a
 * hotlinkable Unsplash CDN URL, or null on any miss — no key set, no results,
 * network/parse error — so callers fall through to the Wikipedia fallback.
 * Never throws.
 */
export async function fetchUnsplashCover(query: string): Promise<string | null> {
  const q = query.trim()
  if (!q) return null
  try {
    const { data, error } = await supabase.functions.invoke(UNSPLASH_FN_SLUG, { body: { query: q } })
    if (error) return null
    const url = (data as { url?: unknown } | null)?.url
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}
