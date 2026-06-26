/** A frozen Google candidate kept on a review row (Google's order, never reordered). */
export interface Candidate {
  placeId: string
  name: string
  address?: string
  lat?: number
  lng?: number
  /** Google's place types (preserved for display + future scoring). */
  types: string[]
  /** Distance (m) from the stop's coords to this candidate; undefined if either lacks coords. */
  distanceM?: number
}

/** Output of scoreMatch for the primary candidate. */
export interface MatchResult {
  score: number
  confident: boolean
  distanceM?: number
}

/** Where a review row points (re-location key). */
export interface ReviewStopRef {
  dayIndex: number
  stopIndex: number
  stopName: string
}
