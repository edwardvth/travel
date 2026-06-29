/** Coarse category for a stop, biasing the Add suggest + driving the row icon. */
export type StopKind = 'do' | 'eat' | 'stay'

/** Canonical normalized price level for a stop (rendered as a chip). */
export type PriceLevel = '$' | '$$' | '$$$' | '$$$$'

export interface Stop {
  name: string
  type?: string
  /** Coarse category — derived from `type`/name when unset (see `stopKind`). */
  kind?: StopKind
  time?: string
  /**
   * The time the day-suggestion AI originally proposed for this stop, captured
   * at generation. Lets the time editor offer "back to suggested" after a manual
   * change; preserved through manual time edits. Optional/additive.
   */
  suggestedTime?: string
  duration?: number
  /**
   * When this stop is one of the three timed meals — set by the day suggestion
   * so meal-aware logic (Tier 2a Optimize Day) identifies meals from a field
   * rather than a fragile name regex. Optional/additive.
   */
  mealAnchor?: 'breakfast' | 'lunch' | 'dinner'
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
  /**
   * Where this stop's coordinates ORIGINATED — `'ai'` (model-supplied in a
   * suggestion) or `'geocoder'` (resolved by lib/geocode.ts after the fact).
   * Origin only; a later manual relocate does NOT change this (see
   * `locationEditedAt`). Optional/additive — absent on legacy stops.
   */
  coordinateSource?: 'ai' | 'geocoder'
  /**
   * ISO timestamp set when a human manually relocated this stop (Change
   * location). Distinct from `coordinateSource`: it records edit history, not
   * origin, so an AI→relocate sequence keeps the origin while marking the edit.
   * Optional/additive.
   */
  locationEditedAt?: string
  wikiTitle?: string
  /**
   * Canonical normalized-place identity from a place-search provider (Google
   * Places). `placeId` is the authoritative dedupe/enrichment/caching key;
   * `placeName` is the provider's canonical display name (SEPARATE from the
   * editable `name`); `placeTypes` are the provider's categories. Optional/
   * additive — absent on by-name and legacy stops.
   */
  placeId?: string
  placeSource?: 'google'
  placeName?: string
  placeTypes?: string[]
  /**
   * Opening hours as Google `regularOpeningHours.weekdayDescriptions` — seven
   * strings like "Monday: 9:30 AM – 11:45 PM". From the Places API at generate
   * time. Optional/additive; rendered via `stopHoursLabel`.
   */
  hours?: string[]
  /** Normalized price level from Google `priceLevel`. Optional/additive. */
  price?: PriceLevel
  /** AI-derived audience/occasion tag, e.g. "Romantic dinner". Optional/additive. */
  goodFor?: string
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
  /**
   * Resolved geo for `destination` — center + ISO-3166-1 alpha-2 `countryCode`
   * (lowercased, ready for Places `includedRegionCodes`; '' when unknown) +
   * `state`. Canonical derived metadata, written eagerly on create + destination
   * change; used to country-restrict + seed the autocomplete bias center.
   */
  destinationGeo?: { lat: number; lng: number; countryCode: string; state?: string }
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
  /**
   * Which source resolved `coverImage` ('wiki' | 'unsplash'). Set the first time
   * a cover is machine-resolved; its presence marks the cover as settled so the
   * Dashboard backfill never re-fetches it on subsequent loads. Absent on legacy
   * covers (which get re-resolved once to migrate them).
   */
  coverSource?: 'wiki' | 'unsplash'
  /**
   * The cover-resolution logic version this cover was produced by. When the
   * logic changes (e.g. a new landmark override), bumping the current version
   * re-resolves each cover ONCE on the next load, then it settles again — so a
   * logic change rolls out without re-fetching on every page load.
   */
  coverVersion?: number
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
  /** Cross-device account settings (AI model/key, units, narration voice). */
  settings?: Record<string, unknown>
}
