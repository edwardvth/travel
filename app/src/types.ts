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
  notice?: string
  image?: string
  icon?: string
  coords?: { lat: number; lng: number }
  wikiTitle?: string
  note?: string
  /** Reservation tracking for this stop. Absent until the user marks it. */
  reservation?: { status: 'to_reserve' | 'reserved'; time?: string; confirmation?: string; note?: string }
  /**
   * Legacy reservation field (pre-"Reserved" rename). Read-only back-compat —
   * `reservationStatus`/`setReservation` map and migrate it. Never written by
   * new code; kept in the type so old JSONB trips still parse.
   */
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
  /** Check-in / check-out as ISO `YYYY-MM-DD` (or date-time) strings. */
  checkIn?: string
  checkOut?: string
  lat?: number
  lng?: number
}
export interface TripConfig {
  title?: string; subtitle?: string; numDays?: number
  dayLabels?: string[]; dayTitles?: string[]; startDate?: string
  /** Destination (clean place label, e.g. "St. Louis, Missouri, United States"). Drives cover-image queries. */
  destination?: string
  /** Free-form trip-level travel notes (edited in Trip → Trip details). */
  notes?: string
  units?: 'metric' | 'imperial'
  aiModel?: string
  aiKey?: string
  /**
   * Cover photo for the trip card (home page). A representative landmark image
   * for the destination, fetched once on trip creation (free Wikipedia/Wikimedia
   * URL — see `landmark.ts`). Stored as a plain hotlink string, never a data URL.
   */
  coverImage?: string
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
