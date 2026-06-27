import { useEffect, useState } from 'react'
import type { Trip } from '../types'
import type { HeroClip } from './types'
import { curatedClipFor, FIRST_CLIP } from './wordClips'
import { fetchDestinationVideo, clipFromDestinationVideo, type DestinationVideoCredit } from './destinationVideo'

/**
 * The hero clip for a trip's destination. Curated self-hosted clip first
 * (instant); else the girl-walking generic clip stays mounted while a Pexels
 * clip is fetched in the background and swapped in only on success (no blank /
 * no flash — HeroVideoStage crossfades). Never throws.
 */
export function useDestinationClip(trip: Trip): { clip: HeroClip; credit: DestinationVideoCredit | null } {
  const destination = (trip.config?.destination || trip.title || '').trim()
  const curated = curatedClipFor(destination)
  const [clip, setClip] = useState<HeroClip>(curated ?? FIRST_CLIP)
  const [credit, setCredit] = useState<DestinationVideoCredit | null>(null)

  useEffect(() => {
    // Reset to the best immediate clip whenever the destination changes.
    setClip(curated ?? FIRST_CLIP)
    setCredit(null)
    if (curated || !destination) return // curated or empty → no fetch
    let cancelled = false
    fetchDestinationVideo(destination).then((v) => {
      if (!cancelled && v) {
        setClip(clipFromDestinationVideo(destination, v))
        setCredit(v.credit)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination])

  return { clip, credit }
}
