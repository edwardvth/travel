export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'
export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export type HeroCategory =
  | 'city' | 'mountains' | 'beach' | 'countryside'
  | 'historic' | 'nightlife' | 'desert' | 'snow' | 'luxury'

/** One curated background clip. Poster is REQUIRED and always renders first. */
export interface HeroClip {
  id: string                     // stable slug, e.g. 'santorini-dawn'
  label: string                  // human label (debug/credits)
  category: HeroCategory
  timeOfDay: TimeOfDay[]         // slots this clip is eligible for
  season?: Season[]              // optional season eligibility (omit = all seasons)
  poster: string                 // always-rendered fallback image (instant paint)
  sources: { src: string; type: 'video/webm' | 'video/mp4' }[] // ordered: webm first
  dominantColor: string          // hex — tunes crossfade bg + text scrim for legibility
  focalPoint?: { x: number; y: number }  // object-position 0..1 (default 0.5/0.5)
  durationSec?: number
  credit: { author: string; source: 'Coverr' | 'Mixkit' | 'Pexels' | 'Pixabay' | 'Custom'; url: string; license: string }
  weight?: number                // selection weighting in its slot (default 1)
}

export interface HeroVideoConfig {
  clips: HeroClip[]
  crossfadeMs: number            // default 1200
  minClipDisplayMs: number       // default 9000 (how long a clip shows before advancing)
  windows: Record<TimeOfDay, [number, number]>  // local-hour buckets (24h)
  enableVideoOnMobile: boolean   // default false → poster-only on small/touch
  saveDataPosterOnly: boolean    // honor navigator.connection.saveData / slow effectiveType
}
