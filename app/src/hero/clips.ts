import type { HeroVideoConfig } from './types'

/**
 * Default cinematic hero configuration.
 *
 * These are REAL external exploration clips served from the Pexels CDN
 * (street-level, iconic destinations). They are hotlinked for now: the
 * Unsplash/Pexels poster always renders first and is what shows until the
 * mp4 loads. For production these should be self-hosted and properly
 * licensed rather than hotlinked from the Pexels CDN.
 */
export const HERO_CONFIG: HeroVideoConfig = {
  crossfadeMs: 800,
  minClipDisplayMs: 3000,
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
      id: 'paris-alley',
      label: 'Walking a Paris alley',
      category: 'historic',
      timeOfDay: ['morning', 'afternoon'],
      season: ['winter', 'spring', 'summer', 'autumn'],
      poster: 'https://images.pexels.com/videos/29098991/pexels-photo-29098991.jpeg?w=1600',
      sources: [{ src: 'https://videos.pexels.com/video-files/29098991/12572038_2560_1440_25fps.mp4', type: 'video/mp4' }],
      dominantColor: '#8c7f6e',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Pexels', source: 'Pexels', url: 'https://www.pexels.com/video/29098991/', license: 'Pexels' },
      weight: 1,
    },
    {
      id: 'kyoto-street',
      label: 'Kyoto historic street',
      category: 'historic',
      timeOfDay: ['morning', 'afternoon'],
      season: ['winter', 'spring', 'summer', 'autumn'],
      poster: 'https://images.pexels.com/videos/32111766/pexels-photo-32111766.jpeg?w=1600',
      sources: [{ src: 'https://videos.pexels.com/video-files/32111766/13690411_1920_1080_60fps.mp4', type: 'video/mp4' }],
      dominantColor: '#6b5a45',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Pexels', source: 'Pexels', url: 'https://www.pexels.com/video/32111766/', license: 'Pexels' },
      weight: 1,
    },
    {
      id: 'kyoto-riverside-morning',
      label: 'Kyoto riverside, misty morning',
      category: 'historic',
      timeOfDay: ['morning'],
      season: ['winter', 'spring', 'summer', 'autumn'],
      poster: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1600&q=80',
      sources: [{ src: 'https://videos.pexels.com/video-files/31385442/13392210_1920_1080_30fps.mp4', type: 'video/mp4' }],
      dominantColor: '#8f9aa0',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Pexels', source: 'Pexels', url: 'https://www.pexels.com/video/31385442/', license: 'Pexels' },
      weight: 1,
    },
    {
      id: 'kyoto-kimono',
      label: 'Kimono stroll, Kyoto',
      category: 'historic',
      timeOfDay: ['afternoon'],
      season: ['winter', 'spring', 'summer', 'autumn'],
      poster: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1600&q=80',
      sources: [{ src: 'https://videos.pexels.com/video-files/31385434/13392408_1920_1080_30fps.mp4', type: 'video/mp4' }],
      dominantColor: '#7a6a55',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Pexels', source: 'Pexels', url: 'https://www.pexels.com/video/31385434/', license: 'Pexels' },
      weight: 1,
    },
    {
      id: 'dubai-marina-night',
      label: 'Dubai Marina at night',
      category: 'city',
      timeOfDay: ['evening', 'night'],
      season: ['winter', 'spring', 'summer', 'autumn'],
      poster: 'https://images.pexels.com/videos/7169446/pexels-photo-7169446.jpeg?w=1600',
      sources: [{ src: 'https://videos.pexels.com/video-files/7169446/7169446-hd_1920_1080_25fps.mp4', type: 'video/mp4' }],
      dominantColor: '#16243f',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Pexels', source: 'Pexels', url: 'https://www.pexels.com/video/7169446/', license: 'Pexels' },
      weight: 1,
    },
    {
      id: 'santorini-firostefani',
      label: 'Santorini, Firostefani',
      category: 'beach',
      timeOfDay: ['afternoon', 'evening'],
      season: ['winter', 'spring', 'summer', 'autumn'],
      poster: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=1600&q=80',
      sources: [{ src: 'https://videos.pexels.com/video-files/26522774/11956556_1920_1080_30fps.mp4', type: 'video/mp4' }],
      dominantColor: '#d8c4a8',
      focalPoint: { x: 0.5, y: 0.5 },
      credit: { author: 'Pexels', source: 'Pexels', url: 'https://www.pexels.com/video/26522774/', license: 'Pexels' },
      weight: 1,
    },
  ],
}
