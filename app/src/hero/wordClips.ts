import type { HeroCategory, HeroClip } from './types'
import { HERO_DESTINATIONS } from '../data/heroDestinations'

/**
 * Word → background-clip manifest.
 *
 * The hero background is DRIVEN BY the typewriter: as it types each word, the
 * background crossfades to a clip of that place. The opening prompt shows the
 * "girl walking" clip; each destination shows its own city; the "Anywhere."
 * finale shows a plane through the clouds.
 *
 * All clips are self-hosted under `app/public/video/` (1080p, audio-stripped,
 * served at `/video/<id>.mp4` with a real poster frame at `/video/<id>.jpg`).
 * To add a destination: drop `<id>.mp4` + `<id>.jpg` in there, add a clip below,
 * map the word, and list the city in `data/heroDestinations.ts`.
 */

export const PROMPT = 'Where do you want to go?'
export const FINALE = 'Anywhere.'

/** Build a self-hosted clip with sane defaults.
 *  `mobile` = a portrait 9:16 crop exists (`<id>-portrait.{mp4,jpg}`), framed on
 *  the subject so it isn't cropped out on tall phone screens. */
function clip(
  id: string,
  label: string,
  category: HeroCategory,
  dominantColor: string,
  source: 'Pexels' | 'Custom' = 'Custom',
  mobile = false,
): HeroClip {
  return {
    id,
    label,
    category,
    timeOfDay: ['morning', 'afternoon', 'evening', 'night'],
    poster: `/video/${id}.jpg`,
    sources: [{ src: `/video/${id}.mp4`, type: 'video/mp4' }],
    ...(mobile
      ? {
          posterMobile: `/video/${id}-portrait.jpg`,
          sourcesMobile: [{ src: `/video/${id}-portrait.mp4`, type: 'video/mp4' as const }],
        }
      : {}),
    dominantColor,
    focalPoint: { x: 0.5, y: 0.5 },
    credit: { author: source === 'Pexels' ? 'Pexels' : 'Voyager', source, url: '', license: source === 'Pexels' ? 'Pexels' : 'Provided' },
    weight: 1,
  }
}

const CLIPS = {
  girlWalking: clip('girl-walking', 'A walk through Paris', 'historic', '#8a8a8a', 'Pexels'),
  anywhere: clip('anywhere', 'Anywhere — a plane through the clouds', 'countryside', '#3c4a63'),
  yerevan: clip('yerevan', 'The Cascade, Yerevan', 'city', '#6f7464'),
  kyoto: clip('kyoto', 'Kimono stroll, Kyoto', 'historic', '#7a6a5a', 'Pexels'),
  paris: clip('paris', 'Eiffel Tower, Paris', 'city', '#7c8aa0'),
  tokyo: clip('tokyo', 'Tokyo', 'nightlife', '#2a2740'),
  rio: clip('rio', 'Christ the Redeemer, Rio', 'beach', '#6f8a9a', 'Custom', true),
  santorini: clip('santorini', 'Santorini', 'beach', '#9fb1bf', 'Custom', true),
  singapore: clip('singapore', 'Marina Bay, Singapore', 'city', '#1f2d44', 'Custom', true),
  milan: clip('milan', 'Duomo, Milan', 'historic', '#8a8276', 'Custom', true),
  positano: clip('positano', 'Positano, Amalfi Coast', 'beach', '#9a8a76'),
  dubai: clip('dubai', 'Dubai Marina at night', 'nightlife', '#16243f', 'Pexels'),
  swissAlps: clip('swiss-alps', 'The Swiss Alps', 'mountains', '#9aa6b4', 'Custom', true),
  banff: clip('banff', 'Banff', 'mountains', '#5b7a7e'),
  patagonia: clip('patagonia', 'Patagonia', 'mountains', '#6a7686'),
} as const

/** The clip shown on first paint (also the opening-prompt clip). */
export const FIRST_CLIP: HeroClip = CLIPS.girlWalking

const WORD_TO_CLIP: Record<string, HeroClip> = {
  [PROMPT]: CLIPS.girlWalking,
  [FINALE]: CLIPS.anywhere,
  Yerevan: CLIPS.yerevan,
  Kyoto: CLIPS.kyoto,
  Paris: CLIPS.paris,
  Tokyo: CLIPS.tokyo,
  'Rio de Janeiro': CLIPS.rio,
  Santorini: CLIPS.santorini,
  Singapore: CLIPS.singapore,
  Milan: CLIPS.milan,
  Positano: CLIPS.positano,
  Dubai: CLIPS.dubai,
  'Swiss Alps': CLIPS.swissAlps,
  Banff: CLIPS.banff,
  Patagonia: CLIPS.patagonia,
}

/** The background clip for a typewriter word (falls back to the prompt clip). */
export function clipForWord(word: string): HeroClip {
  return WORD_TO_CLIP[word] ?? FIRST_CLIP
}

/** The curated self-hosted clip mapped to a word, or null if none is curated. */
export function curatedClipFor(word: string): HeroClip | null {
  return WORD_TO_CLIP[word] ?? null
}

/** The full typewriter sequence, in order. */
export const ORDERED_WORDS: string[] = [PROMPT, ...HERO_DESTINATIONS, FINALE]

/** The clips for the next `count` words after `word` (wraps around) — for preloading. */
export function upcomingClips(word: string, count: number): HeroClip[] {
  const idx = ORDERED_WORDS.indexOf(word)
  if (idx < 0) return []
  const out: HeroClip[] = []
  for (let i = 1; i <= count; i++) {
    out.push(clipForWord(ORDERED_WORDS[(idx + i) % ORDERED_WORDS.length]))
  }
  return out
}
