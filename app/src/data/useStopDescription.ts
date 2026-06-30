import { useEffect } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { generateStopDetail, type StopDetailContent } from '../trip/enrich'
import { fetchPlaceDescription } from '../lib/enrichClient'
import type { Stop, TripData } from '../types'

/** Descriptions are effectively static once generated — cache hard, never auto-refetch. */
const STALE = Infinity
const GC = 24 * 60 * 60 * 1000

export type DescriptionStatus = 'idle' | 'loading' | 'error' | 'ready'

/**
 * True when a stop already carries generated description content. The DURABLE
 * cache is the stop itself (history/facts/tips live in the trip JSONB), so a stop
 * that has any of them never needs regenerating.
 */
export function stopHasDescription(stop: Stop | undefined | null): boolean {
  if (!stop) return false
  return !!(stop.history || (stop.facts && stop.facts.length > 0) || stop.tips)
}

/** The description content already persisted on a stop, or null. */
export function stopDescriptionContent(stop: Stop): StopDetailContent | null {
  if (!stopHasDescription(stop)) return null
  return {
    history: stop.history ?? '',
    facts: stop.facts ?? [],
    tips: stop.tips ?? '',
    notice: stop.notice ?? '',
    goodFor: stop.goodFor ?? '',
  }
}

/** Lowercase + collapse whitespace for a stable, case-insensitive name key. */
function normalizeName(s: string): string {
  return s.normalize('NFKD').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Stable identity for a stop's description cache. Prefers the authoritative
 * `placeId` (the canonical Places dedupe/enrichment key — see `Stop.placeId`);
 * falls back to the normalized name + destination (+ rounded coords) so by-name
 * and legacy stops still get a collision-resistant key. The key is what dedupes
 * concurrent requests and what `applyStopDescription` matches on, so a result
 * that resolves after a swipe still lands on the right stop.
 */
export function stopDescriptionKey(stop: Stop, destination = ''): string {
  if (stop.placeId) return `place:${stop.placeId}`
  const lat = stop.lat ?? stop.coords?.lat
  const lng = stop.lng ?? stop.coords?.lng
  const geo = lat != null && lng != null ? `@${lat.toFixed(3)},${lng.toFixed(3)}` : ''
  return `name:${normalizeName(stop.name)}|${normalizeName(destination)}${geo}`
}

function isEmptyContent(c: StopDetailContent): boolean {
  return !c.history && (!c.facts || c.facts.length === 0) && !c.tips && !c.notice
}

const queryKeyFor = (key: string) => ['stop-description', key] as const

/**
 * Resolve a description for a stop. For `placeId` stops we consult the SHARED
 * place-description library first (the `enrich-place` edge function backed by the
 * `place_cache` table): a cross-trip cache HIT returns instantly with NO AI cost,
 * and a MISS makes the function generate + cache server-side so the next trip
 * containing this place is free. Any non-ready cache result (pending / failed /
 * unsupported — e.g. Google can't verify the placeId, or the user is rate-limited)
 * falls through to the existing per-stop local generation, so behaviour never
 * regresses. By-name / legacy stops (no placeId) always use local generation.
 *
 * Wrapped so an all-empty result becomes a (retryable) error: `generateStopDetail`
 * never throws — it returns a Wikipedia fallback or empty content — and treating
 * "resolved but entirely empty" as an error lets the UI show a graceful fallback
 * + retry instead of a blank, falsely-"successful" description.
 */
export async function runGenerate(stop: Stop, tripTitle: string, destination: string): Promise<StopDetailContent> {
  if (stop.placeId) {
    const lat = stop.lat ?? stop.coords?.lat
    const lng = stop.lng ?? stop.coords?.lng
    const r = await fetchPlaceDescription(stop.placeId, {
      name: stop.name,
      destination,
      ...(lat != null && lng != null ? { coords: { lat, lng } } : {}),
      ...(stop.placeTypes ? { placeTypes: stop.placeTypes } : {}),
    })
    if (r.state === 'ready' && r.content) {
      const cached: StopDetailContent = {
        history: r.content.history,
        facts: r.content.facts,
        tips: r.content.tips,
        notice: r.content.notice,
        goodFor: r.content.goodFor ?? '',
      }
      if (!isEmptyContent(cached)) return cached
    }
    // pending / failed / unsupported / empty → fall through to local generation.
  }
  const content = await generateStopDetail(stop, tripTitle, destination)
  if (isEmptyContent(content)) throw new Error('empty-description')
  return content
}

export interface StopDescriptionCtx {
  tripTitle: string
  destination?: string
  /** Only generate when allowed (mirrors the existing canEdit enrichment gate). */
  enabled?: boolean
}

export interface UseStopDescription {
  content: StopDetailContent | null
  /** True when the content came from the stop itself (already persisted). */
  fromStop: boolean
  status: DescriptionStatus
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

/**
 * Lazy, cache-aware, per-stop description loader. Backed by TanStack Query keyed
 * on the stop's IDENTITY (placeId-preferred), so:
 *  - concurrent requests for the same place dedupe to one in-flight call,
 *  - loading/error state is per-stop — swiping reads the new stop's own status,
 *    and a request resolving for a previous stop can never leave the next stuck,
 *  - a stop that already has content shows instantly (no fetch),
 *  - prefetched results are an instant cache hit when the user arrives.
 *
 * It never generates on its own when the stop already has content; the durable
 * cache is the stop in the trip JSONB (the focused card persists fresh results
 * via `applyStopDescription`).
 */
export function useStopDescription(stop: Stop | undefined, ctx: StopDescriptionCtx): UseStopDescription {
  const destination = ctx.destination ?? ''
  const onStop = stop ? stopDescriptionContent(stop) : null
  const key = stop ? stopDescriptionKey(stop, destination) : ''
  const enabled = !!stop && !onStop && (ctx.enabled ?? true)

  const q = useQuery({
    queryKey: queryKeyFor(key),
    enabled,
    staleTime: STALE,
    gcTime: GC,
    retry: false,
    queryFn: () => runGenerate(stop!, ctx.tripTitle, destination),
  })

  // The persisted stop content wins (it's the source of truth); else the query.
  const content = onStop ?? q.data ?? null
  const isLoading = enabled && q.isLoading
  const isError = enabled && q.isError
  const status: DescriptionStatus = onStop
    ? 'ready'
    : isLoading
      ? 'loading'
      : isError
        ? 'error'
        : content
          ? 'ready'
          : 'idle'

  return { content, fromStop: !!onStop, status, isLoading, isError, refetch: q.refetch }
}

/**
 * Imperatively warm the description cache for one stop (used by Suggest-a-day so
 * the opening stops are generating before Guide is even opened). Cache-first:
 * skips stops that already have content, dedupes via the shared key, never
 * throws, never blocks. Fire-and-forget.
 */
export function prefetchStopDescription(qc: QueryClient, stop: Stop, ctx: StopDescriptionCtx): void {
  if (!stop || stopHasDescription(stop) || ctx.enabled === false) return
  const destination = ctx.destination ?? ''
  void qc.prefetchQuery({
    queryKey: queryKeyFor(stopDescriptionKey(stop, destination)),
    queryFn: () => runGenerate(stop, ctx.tripTitle, destination),
    staleTime: STALE,
    gcTime: GC,
    retry: false,
  })
}

/**
 * Keep descriptions loading ahead of the user: warms the cache for whichever of
 * `stops` still lack content (the caller passes the active window, e.g. stops
 * N..N+3). Uses the SAME key + queryFn as `useStopDescription`, so landing on a
 * warmed stop is an instant cache hit. Re-runs only when the actual set of
 * uncached stops changes (stable signature), so it never loops per render.
 */
export function usePrefetchStopDescriptions(stops: (Stop | undefined)[], ctx: StopDescriptionCtx): void {
  const qc = useQueryClient()
  const destination = ctx.destination ?? ''
  const enabled = ctx.enabled ?? true
  const targets = enabled ? stops.filter((s): s is Stop => !!s && !stopHasDescription(s)) : []
  const signature = targets.map(s => stopDescriptionKey(s, destination)).join('|')
  useEffect(() => {
    for (const s of targets) prefetchStopDescription(qc, s, ctx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, signature])
}

/**
 * Immutably write generated content onto every content-less stop in `data` whose
 * identity matches `key`. Returns the SAME `data` reference when nothing changed,
 * so callers can skip a no-op save. Matching by identity (not a fragile day/stop
 * index) means a result that resolves after the user has swiped still patches the
 * correct stop, and a stop that already has content is never overwritten.
 */
export function applyStopDescription(
  data: TripData,
  key: string,
  destination: string,
  content: StopDetailContent,
): TripData {
  let changed = false
  const days = data.days.map(d => {
    let dayChanged = false
    const stops = d.stops.map(s => {
      if (stopHasDescription(s)) return s
      if (stopDescriptionKey(s, destination) !== key) return s
      dayChanged = true
      changed = true
      return { ...s, history: content.history, facts: content.facts, tips: content.tips, notice: content.notice, ...(content.goodFor ? { goodFor: content.goodFor } : {}) }
    })
    return dayChanged ? { ...d, stops } : d
  })
  return changed ? { ...data, days } : data
}
