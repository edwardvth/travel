/** Coarse category for a stop, biasing the Add suggest + driving the row icon. */
export type StopKind = 'do' | 'eat' | 'stay'

export interface Stop {
  name: string
  type?: string
  /** Coarse category — derived from `type`/name when unset (see `stopKind`). */
  kind?: StopKind
  time?: string
  duration?: number
  lat?: number
  lng?: number
  address?: string
  facts?: string[]
  history?: string
  tips?: string
  image?: string
  icon?: string
  coords?: { lat: number; lng: number }
  wikiTitle?: string
  note?: string
  /** Reservation tracking for this stop. Absent until the user marks it. */
  booking?: { status: 'to_book' | 'booked'; time?: string; note?: string }
  /**
   * User-added photos as small JPEG data URLs (resized ≤1200px, see `photo.ts`).
   * The first entry doubles as the stop's cover image (see `coverPhoto`).
   * Kept inline in the JSONB `data` — no storage backend.
   */
  photos?: string[]
}
export interface Day { title: string; note?: string; stops: Stop[] }
/** The Voyage base lodging ("Stay"). Stored loosely (legacy may be a bare string). */
export interface Hotel {
  name?: string
  address?: string
  note?: string
  lat?: number
  lng?: number
}
export interface TripConfig {
  title?: string; subtitle?: string; numDays?: number
  dayLabels?: string[]; dayTitles?: string[]; startDate?: string
  units?: 'metric' | 'imperial'
  aiModel?: string
  aiKey?: string
  // Legacy config keys that may exist on imported/older trips; preserved on save.
  [key: string]: unknown
}
export interface TripData {
  days: Day[]; completed: string[]
  /** Voyage base Stay. Loosely stored (may be a string on old trips); read via `normalizeHotel`. */
  hotel?: Hotel | string | null
  savedAt?: string
}
export interface Trip {
  id: string
  owner_id: string | null
  title: string
  subtitle: string | null
  config: TripConfig
  data: TripData
  updated_at?: string
  // client-only annotations
  _shared?: boolean
  _ownerEmail?: string | null
}
export interface Profile {
  id: string; email: string; name?: string
  role: 'free' | 'founder' | string; credits: number | null
}
