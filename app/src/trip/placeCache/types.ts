export type GenerationStatus = 'generating' | 'ready' | 'failed' | 'unsupported'

/** The cache row as the function reads it (subset the decision needs). */
export interface CacheRow {
  place_id: string
  prompt_version: number
  generation_status: GenerationStatus
  generation_started_at: string // ISO
  generation_attempts: number
}

/** The description payload returned to the client. */
export interface PlaceDescription {
  history: string
  facts: string[]
  tips: string
  notice: string
  /** Audience/occasion chip ("Romantic dinner"). Added with the chips feature; optional for back-compat with pre-chips cache rows. */
  goodFor?: string
}

export type EnrichState = 'ready' | 'pending' | 'failed' | 'unsupported'
