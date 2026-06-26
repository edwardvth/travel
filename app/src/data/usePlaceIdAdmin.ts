import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '../lib/supabase'

const FN = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/place-id-admin`

async function authToken(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) return data.session.access_token } catch { /* anon */ }
  return SUPABASE_ANON_KEY
}

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await authToken()), apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`place-id-admin ${res.status}`)
  return res.json() as Promise<T>
}

export interface ReviewCandidate { placeId: string; name: string; address?: string; lat?: number; lng?: number; types: string[]; distanceM?: number }
export interface ReviewRow {
  id: number; trip_id: string; owner_id: string | null; day_index: number; stop_index: number
  stop_name: string; stop_lat: number | null; stop_lng: number | null; score: number; candidates: ReviewCandidate[]; status: string; created_at: string
}
export interface ScanStats { processed: number; tagged: number; queued: number; skipped_existing: number; google_requests: number; google_failures: number; cursor: string; done: boolean }

export const placeIdAdmin = {
  metrics: () => call<{ pending_review: number }>({ action: 'metrics' }),
  scan: (cursor?: string) => call<ScanStats>({ action: 'scan', ...(cursor ? { cursor } : {}) }),
  list: () => call<{ rows: ReviewRow[] }>({ action: 'list' }),
  attach: (reviewId: number, placeId: string) => call<{ status: string }>({ action: 'attach', reviewId, placeId }),
  skip: (reviewId: number) => call<{ status: string }>({ action: 'skip', reviewId }),
  reset: (tripId: string, dayIndex: number, stopIndex: number) => call<{ status: string }>({ action: 'reset', tripId, dayIndex, stopIndex }),
}
