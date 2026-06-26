import { supabase } from '../lib/supabase'
import type { HeroClip } from './types'

/** The deployed slug of the Pexels video proxy edge function. */
const PEXELS_FN_SLUG = 'pexels-video'

export interface DestinationVideo {
  url: string
  poster: string | null
}

/**
 * Fetch a hero VIDEO for a destination from Pexels, via the server-side proxy
 * (the Pexels key never reaches the client). The edge function searches the
 * `city` first and escalates to `country` when the city is sparse, and caches
 * the resolved link globally. Returns `{ url, poster }` or null on any miss — no
 * key set, no results, network/parse error — so callers fall back to the
 * built-in girl-walking clip. Never throws.
 */
export async function fetchDestinationVideo(city: string, country?: string): Promise<DestinationVideo | null> {
  const c = city.trim()
  if (!c) return null
  try {
    const { data, error } = await supabase.functions.invoke(PEXELS_FN_SLUG, {
      body: { city: c, country: (country ?? '').trim() || undefined },
    })
    if (error) return null
    const url = (data as { url?: unknown } | null)?.url
    if (typeof url !== 'string' || !url) return null
    const poster = (data as { poster?: unknown } | null)?.poster
    return { url, poster: typeof poster === 'string' && poster ? poster : null }
  } catch {
    return null
  }
}

/** Build a HeroClip the controlled HeroVideoStage can show from a Pexels result. */
export function clipFromDestinationVideo(id: string, video: DestinationVideo, dominantColor = '#23262e'): HeroClip {
  return {
    id: `pexels-${id}`,
    label: id,
    category: 'city',
    timeOfDay: ['morning', 'afternoon', 'evening', 'night'],
    poster: video.poster ?? '',
    sources: [{ src: video.url, type: 'video/mp4' }],
    dominantColor,
    focalPoint: { x: 0.5, y: 0.5 },
    credit: { author: 'Pexels', source: 'Pexels', url: '', license: 'Pexels' },
    weight: 1,
  }
}
