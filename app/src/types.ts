export interface Stop {
  name: string
  type?: string
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
}
export interface Day { title: string; note?: string; stops: Stop[] }
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
  days: Day[]; completed: string[]; hotel: unknown | null; savedAt?: string
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
