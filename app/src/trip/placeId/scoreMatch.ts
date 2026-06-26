import { distanceMeters } from './geo'
import { nameSimilarity } from './name'
import { EXACT_DISTANCE_M, NEAR_DISTANCE_M, AMBIGUITY_PENALTY, AUTO_ATTACH_THRESHOLD } from './constants'
import type { Candidate, MatchResult } from './types'

interface StopLike { name: string; lat?: number; lng?: number; coords?: { lat: number; lng: number } }

const coordsOf = (s: StopLike): { lat: number; lng: number } | undefined => {
  const lat = s.lat ?? s.coords?.lat
  const lng = s.lng ?? s.coords?.lng
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng } : undefined
}

const distOf = (
  stopCoords: { lat: number; lng: number } | undefined, c: Candidate,
): number | undefined =>
  stopCoords && typeof c.lat === 'number' && typeof c.lng === 'number'
    ? distanceMeters(stopCoords, { lat: c.lat, lng: c.lng }) : undefined

function nameScore(stopName: string, c: Candidate): number {
  switch (nameSimilarity(stopName, c.name)) {
    case 'exact': return 0.6
    case 'close': return 0.35
    default: return 0
  }
}

function distanceScore(d: number | undefined): number {
  if (d === undefined) return 0
  if (d <= EXACT_DISTANCE_M) return 0.4
  if (d <= NEAR_DISTANCE_M) return 0.2
  return -0.3
}

/**
 * Score the PRIMARY candidate (candidates[0]) against the stop, penalising an
 * ambiguous runner-up. All confidence logic lives here. Pure + unit-tested.
 * confident = score >= AUTO_ATTACH_THRESHOLD. candidates stay in Google's order.
 */
export function scoreMatch(stop: StopLike, candidates: Candidate[]): MatchResult {
  if (candidates.length === 0) return { score: 0, confident: false }
  const sc = coordsOf(stop)
  const primary = candidates[0]
  const distanceM = distOf(sc, primary)

  let score = nameScore(stop.name, primary) + distanceScore(distanceM)
  if (!sc) score -= 0.15 // coordless stop can't be location-verified → favor review

  // Ambiguity: a runner-up that is also name-similar OR within NEAR_DISTANCE_M.
  const ambiguous = candidates.slice(1).some((c) => {
    const sim = nameSimilarity(stop.name, c.name)
    if (sim === 'exact' || sim === 'close') return true
    const d = distOf(sc, c)
    return d !== undefined && d <= NEAR_DISTANCE_M
  })
  if (ambiguous) score -= AMBIGUITY_PENALTY

  return {
    score,
    confident: score >= AUTO_ATTACH_THRESHOLD,
    ...(distanceM !== undefined ? { distanceM: Math.round(distanceM) } : {}),
  }
}
