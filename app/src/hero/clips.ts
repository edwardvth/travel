import type { HeroVideoConfig } from './types'

/** Build the ordered webm-first / mp4-fallback source list for a clip id. */
const sources = (id: string) => [
  { src: `/video/${id}.webm`, type: 'video/webm' as const },
  { src: `/video/${id}.mp4`, type: 'video/mp4' as const },
]

/** Unsplash poster URL helper — guaranteed-rendering base layer. */
const poster = (photoId: string) =>
  `https://images.unsplash.com/photo-${photoId}?w=1600&q=80`

/**
 * Default cinematic hero configuration.
 *
 * Footage under /video/ is placeholder-grade; the Unsplash poster always
 * renders first and is what shows until real cuts are dropped in. Swap
 * licensed footage by replacing files in app/public/video/ and (optionally)
 * editing the manifest below — no code changes needed elsewhere.
 */
export const HERO_CONFIG: HeroVideoConfig = {
  crossfadeMs: 1200,
  minClipDisplayMs: 9000,
  windows: {
    morning: [5, 11],
    afternoon: [11, 17],
    evening: [17, 20],
    night: [20, 5],
  },
  enableVideoOnMobile: false,
  saveDataPosterOnly: true,
  clips: [
    {
      id: 'santorini-dawn',
      label: 'Santorini at dawn',
      category: 'beach',
      timeOfDay: ['morning', 'evening'],
      season: ['summer', 'spring'],
      poster: poster('1570077188670-e3a8d69ac5ff'),
      sources: sources('santorini-dawn'),
      dominantColor: '#e9c6a3',
      focalPoint: { x: 0.5, y: 0.45 },
      credit: { author: 'Unsplash', source: 'Custom', url: 'https://unsplash.com/photos/1570077188670-e3a8d69ac5ff', license: 'Unsplash' },
      weight: 1,
    },
    {
      id: 'alps-lake-morning',
      label: 'Swiss alpine lake, morning',
      category: 'mountains',
      timeOfDay: ['morning', 'afternoon'],
      season: ['winter', 'autumn', 'spring'],
      poster: poster('1502786129293-79981df4e689'),
      sources: sources('alps-lake-morning'),
      dominantColor: '#7d96a8',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Unsplash', source: 'Custom', url: 'https://unsplash.com/photos/1502786129293-79981df4e689', license: 'Unsplash' },
      weight: 1,
    },
    {
      id: 'kyoto-bamboo',
      label: 'Kyoto bamboo grove',
      category: 'countryside',
      timeOfDay: ['morning', 'afternoon'],
      season: ['spring', 'autumn'],
      poster: poster('1493976040374-85c8e12f0c0e'),
      sources: sources('kyoto-bamboo'),
      dominantColor: '#4f6b43',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Unsplash', source: 'Custom', url: 'https://unsplash.com/photos/1493976040374-85c8e12f0c0e', license: 'Unsplash' },
      weight: 1,
    },
    {
      id: 'tropical-aerial',
      label: 'Tropical coastline, aerial',
      category: 'beach',
      timeOfDay: ['afternoon'],
      season: ['summer'],
      poster: poster('1505228395891-9a51e7e86bf6'),
      sources: sources('tropical-aerial'),
      dominantColor: '#2f9fb3',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Unsplash', source: 'Custom', url: 'https://unsplash.com/photos/1505228395891-9a51e7e86bf6', license: 'Unsplash' },
      weight: 1,
    },
    {
      id: 'tuscany-day',
      label: 'Tuscan countryside, day',
      category: 'countryside',
      timeOfDay: ['morning', 'afternoon'],
      season: ['spring', 'summer', 'autumn'],
      poster: poster('1523906834658-6e24ef2386f9'),
      sources: sources('tuscany-day'),
      dominantColor: '#b9a36a',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Unsplash', source: 'Custom', url: 'https://unsplash.com/photos/1523906834658-6e24ef2386f9', license: 'Unsplash' },
      weight: 1,
    },
    {
      id: 'skyline-golden',
      label: 'City skyline, golden hour',
      category: 'city',
      timeOfDay: ['evening'],
      season: ['summer', 'spring', 'autumn'],
      poster: poster('1480714378408-67cf0d13bc1b'),
      sources: sources('skyline-golden'),
      dominantColor: '#c98a4b',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Unsplash', source: 'Custom', url: 'https://unsplash.com/photos/1480714378408-67cf0d13bc1b', license: 'Unsplash' },
      weight: 1,
    },
    {
      id: 'cappadocia-balloons',
      label: 'Cappadocia hot-air balloons',
      category: 'desert',
      timeOfDay: ['morning'],
      season: ['spring', 'autumn', 'summer'],
      poster: poster('1530841377377-3ff06c0ca713'),
      sources: sources('cappadocia-balloons'),
      dominantColor: '#caa07d',
      focalPoint: { x: 0.5, y: 0.4 },
      credit: { author: 'Unsplash', source: 'Custom', url: 'https://unsplash.com/photos/1530841377377-3ff06c0ca713', license: 'Unsplash' },
      weight: 1,
    },
    {
      id: 'amalfi-sunset',
      label: 'Amalfi coast at sunset',
      category: 'beach',
      timeOfDay: ['evening'],
      season: ['summer'],
      poster: poster('1533165850316-86dbc8cdbb5e'),
      sources: sources('amalfi-sunset'),
      dominantColor: '#d6845f',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Unsplash', source: 'Custom', url: 'https://unsplash.com/photos/1533165850316-86dbc8cdbb5e', license: 'Unsplash' },
      weight: 1,
    },
    {
      id: 'tokyo-neon',
      label: 'Tokyo neon streets',
      category: 'nightlife',
      timeOfDay: ['night'],
      season: ['winter', 'autumn'],
      poster: poster('1540959733332-eab4deabeeaf'),
      sources: sources('tokyo-neon'),
      dominantColor: '#7a2f6b',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Unsplash', source: 'Custom', url: 'https://unsplash.com/photos/1540959733332-eab4deabeeaf', license: 'Unsplash' },
      weight: 1,
    },
    {
      id: 'city-aerial-night',
      label: 'City aerial at night',
      category: 'city',
      timeOfDay: ['night'],
      season: ['winter', 'autumn', 'summer', 'spring'],
      poster: poster('1519501025264-65ba15a82390'),
      sources: sources('city-aerial-night'),
      dominantColor: '#1f2a44',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Unsplash', source: 'Custom', url: 'https://unsplash.com/photos/1519501025264-65ba15a82390', license: 'Unsplash' },
      weight: 1,
    },
  ],
}
