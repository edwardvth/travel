# Shared Place-Description Cache — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate each place's description (story/facts/experience) **once**, store it in a global, server-only library keyed by Google `placeId`, and reuse it across all trips — with instant cached reads, founder-only maintenance, stampede-safe generation, and full provenance.

**Architecture:** A new `enrich-place` Supabase edge function is the *only* writer/reader of two new Postgres tables (`place_cache`, `place_cache_audit`); it verifies the place via Google Place Details, claims a per-row lock via PostgREST (a `POST` 409 = contention), generates via the existing `ai-proxy` (founder/credits-gated), and writes content + provenance atomically. The browser calls the function through a thin client (`enrichClient.ts`) and a cached hook (`useStopDescription`); the description pipeline moves out of the browser. **No queues, cron, workers, realtime, or new services** — concurrency/lease/staleness are handled on read via row state + PostgREST filters.

**Tech Stack:** React 18 + TS + Vite, TanStack Query, vitest (`npx vitest run`), Supabase Edge Functions (Deno) + PostgREST, Google Places API (New), Anthropic via `ai-proxy`.

> **Spec:** `docs/superpowers/specs/2026-06-24-voyager-place-description-cache-design.md` (reference).
>
> **Test reality:** Deno isn't installed locally. So **all decision/validation/parsing logic is authored as pure TS in the app and unit-tested in vitest**; the `enrich-place` function **copies** those pure helpers (Deno can't import app modules) — the plan flags every copy so they stay in sync — and the deployed function is verified by **live probes** (Task 13), not local tests.

---

## File Structure

**Create (app — pure + client, all vitest-tested):**
- `app/src/trip/placeCache/version.ts` — `CURRENT_ENRICH_VERSION`, `promptId(template)` hash.
- `app/src/trip/placeCache/validate.ts` — `validatePlaceRequest`, `isValidPlaceIdShape`, coord/range checks.
- `app/src/trip/placeCache/decide.ts` — lock/lease/cooldown/unsupported **pure decision** + constants.
- `app/src/trip/placeCache/types.ts` — shared `PlaceDescription`, `EnrichState`, `CacheRow` types.
- `app/src/lib/enrichClient.ts` — `fetchPlaceDescription`, `fetchPlaceDescriptionsBatch`, `regeneratePlace` (call the function; never throw).
- `app/src/data/useStopDescription.ts` — cached hook + poll budget.
- `app/src/data/usePrewarmDescriptions.ts` — bounded batch pre-warm.

**Create (backend — operator-applied / probe-verified):**
- `supabase/sql/place_cache.sql` — tables, RLS, partial unique index, manual-edit/mark-stale trigger.
- `supabase/functions/enrich-place/index.ts` — the function (copies the pure helpers + ports wiki/prompt/parse).

**Modify (read-sites + add):**
- `app/src/trip/Guide.tsx` — feed `StoryTabs` from `useStopDescription`; drop `!stop.history` auto-enrich.
- `app/src/trip/StopDetail.tsx` — read via the hook; replace the public Generate button with a **founder-only** Regenerate.
- `app/src/trip/guide/ArrivalView.tsx` — feed from the hook (via Guide).
- `app/src/trip/AddStop.tsx` — pre-warm on add.

---

## Phase 1 — Pure shared logic (vitest)

### Task 1: Version + prompt provenance

**Files:** Create `app/src/trip/placeCache/version.ts`, `app/src/trip/placeCache/version.test.ts`

- [ ] **Step 1: Write the failing test** (`version.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { CURRENT_ENRICH_VERSION, promptId } from './version'

describe('version', () => {
  it('CURRENT_ENRICH_VERSION is the current (facts-separated) prompt = 2', () => {
    expect(CURRENT_ENRICH_VERSION).toBe(2)
  })
})

describe('promptId', () => {
  it('is stable for the same template and differs for different templates', () => {
    const a = promptId('write three sections: history, facts, tips')
    const b = promptId('write three sections: history, facts, tips')
    const c = promptId('a different prompt')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{8,}$/) // short hex digest
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/trip/placeCache/version.test.ts`
Expected: FAIL — cannot resolve `./version`.

- [ ] **Step 3: Implement** (`app/src/trip/placeCache/version.ts`)

```ts
/**
 * The enrichment prompt version. Bump when the prompt template changes so the
 * cache regenerates at the new version (old-prompt content is never served).
 * The current value matches the "facts-separated / experience-routed" prompt;
 * the pre-existing browser prompt was implicitly version 1.
 * MIRROR: supabase/functions/enrich-place keeps the same integer.
 */
export const CURRENT_ENRICH_VERSION = 2

/**
 * A short, stable hex digest of the exact prompt template string — exact prompt
 * provenance beyond the integer version (FNV-1a, 32-bit). Pure.
 * MIRROR: copied verbatim into supabase/functions/enrich-place.
 */
export function promptId(template: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < template.length; i++) {
    h ^= template.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/trip/placeCache/version.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/placeCache/version.ts app/src/trip/placeCache/version.test.ts
git commit -m "feat(place-cache): version constant + promptId provenance hash

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Request validation

**Files:** Create `app/src/trip/placeCache/validate.ts`, `app/src/trip/placeCache/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { isValidPlaceIdShape, validatePlaceRequest } from './validate'

describe('isValidPlaceIdShape', () => {
  it('accepts Google-shaped ids and rejects junk', () => {
    expect(isValidPlaceIdShape('ChIJteVBdWDwwIcRNKiWxoko7Xk')).toBe(true)
    expect(isValidPlaceIdShape('short')).toBe(false)
    expect(isValidPlaceIdShape('bad id with spaces!!')).toBe(false)
    expect(isValidPlaceIdShape('')).toBe(false)
  })
})

describe('validatePlaceRequest', () => {
  it('passes a well-formed request', () => {
    const r = validatePlaceRequest({ placeId: 'ChIJteVBdWDwwIcRNKiWxoko7Xk', name: 'Gateway Arch', coords: { lat: 38.6, lng: -90.2 } })
    expect(r.ok).toBe(true)
  })
  it('rejects bad placeId shape', () => {
    expect(validatePlaceRequest({ placeId: 'nope', name: 'X' }).ok).toBe(false)
  })
  it('rejects an empty name', () => {
    expect(validatePlaceRequest({ placeId: 'ChIJteVBdWDwwIcRNKiWxoko7Xk', name: '   ' }).ok).toBe(false)
  })
  it('rejects out-of-range coordinates', () => {
    expect(validatePlaceRequest({ placeId: 'ChIJteVBdWDwwIcRNKiWxoko7Xk', name: 'X', coords: { lat: 200, lng: 0 } }).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/trip/placeCache/validate.test.ts`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 3: Implement** (`app/src/trip/placeCache/validate.ts`)

```ts
/** Google place ids are opaque `[A-Za-z0-9_-]`, ≥ ~20 chars in practice. */
export function isValidPlaceIdShape(placeId: string): boolean {
  return /^[A-Za-z0-9_-]{16,}$/.test(placeId)
}

export interface PlaceRequest {
  placeId: string
  name?: string
  destination?: string
  coords?: { lat: number; lng: number }
  placeTypes?: string[]
}

/**
 * Validate an enrichment request BEFORE any generation — cheap shape gate that
 * stops malformed/fake ids from creating rows. (Existence is verified server-
 * side via Google Place Details; this is the pre-check.) Pure.
 * MIRROR: copied into supabase/functions/enrich-place.
 */
export function validatePlaceRequest(req: PlaceRequest): { ok: boolean; reason?: string } {
  if (!isValidPlaceIdShape(req.placeId)) return { ok: false, reason: 'bad_place_id' }
  if (req.name !== undefined && req.name.trim().length === 0) return { ok: false, reason: 'empty_name' }
  if (req.coords) {
    const { lat, lng } = req.coords
    const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
    if (!finite(lat) || !finite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { ok: false, reason: 'bad_coords' }
    }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/trip/placeCache/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/placeCache/validate.ts app/src/trip/placeCache/validate.test.ts
git commit -m "feat(place-cache): request validation (placeId shape, name, coords)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Generation decision (lock / lease / cooldown / unsupported)

**Files:** Create `app/src/trip/placeCache/types.ts`, `app/src/trip/placeCache/decide.ts`, `app/src/trip/placeCache/decide.test.ts`

- [ ] **Step 1: Write the failing test** (`decide.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { decideAction, GEN } from './decide'
import type { CacheRow } from './types'

const base = (over: Partial<CacheRow>): CacheRow => ({
  place_id: 'p', prompt_version: 2, generation_status: 'ready',
  generation_started_at: '2026-06-24T00:00:00Z', generation_attempts: 1, ...over,
} as CacheRow)
const NOW = Date.parse('2026-06-24T00:00:30Z') // 30s after the base timestamp

describe('decideAction', () => {
  it('no row → claim', () => {
    expect(decideAction(null, NOW).kind).toBe('claim')
  })
  it('ready → serve', () => {
    expect(decideAction(base({ generation_status: 'ready' }), NOW).kind).toBe('serve')
  })
  it('unsupported → unsupported (terminal)', () => {
    expect(decideAction(base({ generation_status: 'unsupported' }), NOW).kind).toBe('unsupported')
  })
  it('generating within lease → pending', () => {
    expect(decideAction(base({ generation_status: 'generating' }), NOW).kind).toBe('pending')
  })
  it('generating past lease → reclaim', () => {
    const old = base({ generation_status: 'generating', generation_started_at: '2026-06-24T00:00:00Z' })
    const later = Date.parse('2026-06-24T00:02:00Z') // 120s > 60s lease
    expect(decideAction(old, later).kind).toBe('reclaim')
  })
  it('failed within cooldown → failed', () => {
    const r = base({ generation_status: 'failed', generation_started_at: '2026-06-24T00:00:00Z' })
    expect(decideAction(r, NOW).kind).toBe('failed')
  })
  it('failed past cooldown, under max attempts → claim (retry)', () => {
    const r = base({ generation_status: 'failed', generation_started_at: '2026-06-24T00:00:00Z', generation_attempts: 2 })
    const later = Date.parse('2026-06-24T00:10:00Z') // 600s > 300s cooldown
    expect(decideAction(r, later).kind).toBe('claim')
  })
  it('failed and at max attempts → failed (founder-only retry)', () => {
    const r = base({ generation_status: 'failed', generation_started_at: '2026-06-24T00:00:00Z', generation_attempts: GEN.MAX_ATTEMPTS })
    const later = Date.parse('2026-06-24T01:00:00Z')
    expect(decideAction(r, later).kind).toBe('failed')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/trip/placeCache/decide.test.ts`
Expected: FAIL — cannot resolve `./decide`.

- [ ] **Step 3: Implement** — first `app/src/trip/placeCache/types.ts`:

```ts
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
}

export type EnrichState = 'ready' | 'pending' | 'failed' | 'unsupported'
```

Then `app/src/trip/placeCache/decide.ts`:

```ts
import type { CacheRow } from './types'

/** Concurrency/lease constants (seconds). MIRROR into enrich-place. */
export const GEN = {
  LEASE_SECONDS: 60,
  FAILURE_COOLDOWN_SECONDS: 300,
  MAX_ATTEMPTS: 5,
} as const

export type Decision =
  | { kind: 'serve' }
  | { kind: 'pending' }
  | { kind: 'failed' }
  | { kind: 'unsupported' }
  | { kind: 'claim' }    // no row / retry-eligible → attempt atomic claim
  | { kind: 'reclaim' }  // stuck generating lease → conditional reclaim

/**
 * Decide what to do for a place given its current row and the clock — the pure
 * core of the lock/lease/cooldown/terminal state machine. The function turns
 * 'claim'/'reclaim' into atomic PostgREST writes. Pure + fully unit-tested.
 * MIRROR: copied verbatim into supabase/functions/enrich-place.
 */
export function decideAction(row: CacheRow | null, nowMs: number): Decision {
  if (!row) return { kind: 'claim' }
  const started = Date.parse(row.generation_started_at)
  const ageS = (nowMs - started) / 1000
  switch (row.generation_status) {
    case 'ready': return { kind: 'serve' }
    case 'unsupported': return { kind: 'unsupported' }
    case 'generating':
      return ageS > GEN.LEASE_SECONDS ? { kind: 'reclaim' } : { kind: 'pending' }
    case 'failed':
      if (ageS <= GEN.FAILURE_COOLDOWN_SECONDS) return { kind: 'failed' }
      return row.generation_attempts >= GEN.MAX_ATTEMPTS ? { kind: 'failed' } : { kind: 'claim' }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/trip/placeCache/decide.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/placeCache/types.ts app/src/trip/placeCache/decide.ts app/src/trip/placeCache/decide.test.ts
git commit -m "feat(place-cache): pure generation-decision state machine + shared types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — Client transport + hook (vitest)

### Task 4: `enrichClient.ts` — call the function

**Files:** Create `app/src/lib/enrichClient.ts`, `app/src/lib/enrichClient.test.ts`. Reference: `app/src/lib/placeSearch.ts` (auth + fetch pattern), `app/src/trip/guide/placePhoto.ts` (`authToken`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPlaceDescription, fetchPlaceDescriptionsBatch, regeneratePlace } from './enrichClient'

vi.mock('./supabase', () => ({
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon',
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

const okJson = (body: unknown) => ({ ok: true, json: async () => body } as Response)

describe('fetchPlaceDescription', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns ready content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson({ status: 'ready', content: { history: 'H', facts: ['a'], tips: 'T', notice: '' } }))
    const r = await fetchPlaceDescription('p1', { name: 'Gateway Arch' })
    expect(r.state).toBe('ready')
    expect(r.content?.history).toBe('H')
  })
  it('maps pending / failed / unsupported', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    spy.mockResolvedValueOnce(okJson({ status: 'pending' }))
    expect((await fetchPlaceDescription('p1', {})).state).toBe('pending')
    spy.mockResolvedValueOnce(okJson({ status: 'unsupported' }))
    expect((await fetchPlaceDescription('p1', {})).state).toBe('unsupported')
  })
  it('non-OK / throw → failed (never throws)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    expect((await fetchPlaceDescription('p1', {})).state).toBe('failed')
  })
})

describe('fetchPlaceDescriptionsBatch', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns the ready map', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson({ results: { p1: { history: 'H', facts: [], tips: '', notice: '' } } }))
    const m = await fetchPlaceDescriptionsBatch(['p1', 'p2'])
    expect(m.p1?.history).toBe('H')
    expect(m.p2).toBeUndefined()
  })
  it('empty input → {} (no fetch)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchPlaceDescriptionsBatch([])).toEqual({})
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('regeneratePlace', () => {
  afterEach(() => vi.restoreAllMocks())
  it('posts action regenerate and returns the result state', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson({ status: 'ready', content: { history: 'H2', facts: [], tips: '', notice: '' } }))
    const r = await regeneratePlace('p1', true)
    expect(r.state).toBe('ready')
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ action: 'regenerate', placeId: 'p1', force: true })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/enrichClient.test.ts`
Expected: FAIL — cannot resolve `./enrichClient`.

- [ ] **Step 3: Implement** (`app/src/lib/enrichClient.ts`)

```ts
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './supabase'
import type { PlaceDescription, EnrichState } from '../trip/placeCache/types'

const FN = 'enrich-place'
const fnUrl = () => `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${FN}`

async function authToken(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) return data.session.access_token } catch { /* anon */ }
  return SUPABASE_ANON_KEY
}
async function callFn(payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown | null> {
  try {
    const res = await fetch(fnUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await authToken()), apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(payload), signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export interface PlaceHints { name?: string; destination?: string; coords?: { lat: number; lng: number }; placeTypes?: string[] }
export interface DescriptionResult { state: EnrichState; content?: PlaceDescription }

function toResult(json: unknown): DescriptionResult {
  const j = (json ?? {}) as { status?: string; content?: PlaceDescription }
  const state: EnrichState =
    j.status === 'ready' ? 'ready' : j.status === 'pending' ? 'pending' : j.status === 'unsupported' ? 'unsupported' : 'failed'
  return state === 'ready' && j.content ? { state, content: j.content } : { state }
}

/** Get one place's description (cache/generate via the function). Never throws. */
export async function fetchPlaceDescription(placeId: string, hints: PlaceHints, signal?: AbortSignal): Promise<DescriptionResult> {
  if (!placeId) return { state: 'failed' }
  return toResult(await callFn({ action: 'get', placeId, ...hints }, signal))
}

/** Ready-only batch for pre-warm (no generation). Returns a placeId→content map. Never throws. */
export async function fetchPlaceDescriptionsBatch(placeIds: string[], signal?: AbortSignal): Promise<Record<string, PlaceDescription>> {
  if (placeIds.length === 0) return {}
  const json = await callFn({ action: 'getBatch', placeIds }, signal) as { results?: Record<string, PlaceDescription> } | null
  return json?.results ?? {}
}

/** Founder-only force/regenerate. Never throws. */
export async function regeneratePlace(placeId: string, force = false): Promise<DescriptionResult> {
  if (!placeId) return { state: 'failed' }
  return toResult(await callFn({ action: 'regenerate', placeId, force }))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/enrichClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/enrichClient.ts app/src/lib/enrichClient.test.ts
git commit -m "feat(place-cache): enrichClient — get/getBatch/regenerate wrappers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `useStopDescription` hook

**Files:** Create `app/src/data/useStopDescription.ts`, `app/src/data/useStopDescription.test.tsx`. Reference: `app/src/data/usePlaceSearch.ts`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useStopDescription } from './useStopDescription'
import type { Stop } from '../types'

vi.mock('../lib/enrichClient', () => ({
  fetchPlaceDescription: vi.fn(async () => ({ state: 'ready', content: { history: 'LibH', facts: ['x'], tips: 'LibT', notice: '' } })),
}))

const wrap = ({ children }: { children: React.ReactNode }) =>
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>

describe('useStopDescription', () => {
  it('placeId stop → reads the library', async () => {
    const stop = { name: 'X', placeId: 'p1' } as Stop
    const { result } = renderHook(() => useStopDescription(stop), { wrapper: wrap })
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.history).toBe('LibH')
    expect(result.current.facts).toEqual(['x'])
  })
  it('by-name stop → uses the stop fields, no fetch', async () => {
    const { fetchPlaceDescription } = await import('../lib/enrichClient')
    const stop = { name: 'Typed', history: 'OwnH', facts: ['f'], tips: 'OwnT' } as Stop
    const { result } = renderHook(() => useStopDescription(stop), { wrapper: wrap })
    expect(result.current.history).toBe('OwnH')
    expect(result.current.state).toBe('ready')
    expect(fetchPlaceDescription).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/data/useStopDescription.test.tsx`
Expected: FAIL — cannot resolve `./useStopDescription`.

- [ ] **Step 3: Implement** (`app/src/data/useStopDescription.ts`)

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchPlaceDescription, type PlaceHints } from '../lib/enrichClient'
import { CURRENT_ENRICH_VERSION } from '../trip/placeCache/version'
import type { Stop } from '../types'
import type { EnrichState } from '../trip/placeCache/types'
import { stopCoords } from '../trip/walk'

const UI_POLL_BUDGET_MS = 12_000
const POLL_INTERVAL_MS = 1_500

export interface StopDescription { history: string; facts: string[]; tips: string; notice: string; state: EnrichState }

/**
 * The description for a stop. placeId stops read the shared library (cached,
 * pre-warmable, polls briefly while generating); by-name stops use their own
 * stored fields. While a placeId stop's library entry is generating/failed, fall
 * back to the stop's legacy stored fields if present. Never blocks.
 */
export function useStopDescription(stop: Stop | undefined): StopDescription {
  const placeId = stop?.placeId
  const legacy = { history: stop?.history ?? '', facts: stop?.facts ?? [], tips: stop?.tips ?? '', notice: stop?.notice ?? '' }
  const c = stop ? stopCoords(stop) : null
  const hints: PlaceHints = { name: stop?.name, ...(c ? { coords: c } : {}), ...(stop?.placeTypes ? { placeTypes: stop.placeTypes } : {}) }

  const q = useQuery({
    queryKey: ['place-desc', placeId, CURRENT_ENRICH_VERSION],
    enabled: !!placeId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: ({ signal }) => fetchPlaceDescription(placeId!, hints, signal),
    // Poll while pending, but only within the UI budget (not the 60s backend lease).
    refetchInterval: (query) => {
      const r = query.state.data
      if (r?.state !== 'pending') return false
      const elapsed = Date.now() - (query.state.dataUpdatedAt || Date.now())
      return elapsed < UI_POLL_BUDGET_MS ? POLL_INTERVAL_MS : false
    },
  })

  if (!placeId) return { ...legacy, state: 'ready' }
  const r = q.data
  if (r?.state === 'ready' && r.content) return { ...r.content, state: 'ready' }
  // pending/failed/unsupported/loading → show legacy fields if any, surface the state.
  return { ...legacy, state: r?.state ?? 'pending' }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/data/useStopDescription.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/useStopDescription.ts app/src/data/useStopDescription.test.tsx
git commit -m "feat(place-cache): useStopDescription — cached library reads + legacy fallback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Bounded pre-warm

**Files:** Create `app/src/data/usePrewarmDescriptions.ts`, `app/src/data/usePrewarmDescriptions.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePrewarmDescriptions, PREWARM_BATCH_MAX } from './usePrewarmDescriptions'

vi.mock('../lib/enrichClient', () => ({ fetchPlaceDescriptionsBatch: vi.fn(async () => ({})) }))

const wrap = ({ children }: { children: React.ReactNode }) =>
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>

describe('usePrewarmDescriptions', () => {
  it('caps the batch at PREWARM_BATCH_MAX and de-dupes', async () => {
    const { fetchPlaceDescriptionsBatch } = await import('../lib/enrichClient')
    const ids = Array.from({ length: PREWARM_BATCH_MAX + 10 }, (_, i) => 'p' + i)
    renderHook(() => usePrewarmDescriptions([...ids, ids[0]]), { wrapper: wrap })
    await Promise.resolve()
    const called = (fetchPlaceDescriptionsBatch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[]
    expect(called.length).toBe(PREWARM_BATCH_MAX)
  })
  it('no ids → no call', async () => {
    const { fetchPlaceDescriptionsBatch } = await import('../lib/enrichClient')
    ;(fetchPlaceDescriptionsBatch as ReturnType<typeof vi.fn>).mockClear()
    renderHook(() => usePrewarmDescriptions([]), { wrapper: wrap })
    expect(fetchPlaceDescriptionsBatch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/data/usePrewarmDescriptions.test.tsx`
Expected: FAIL — cannot resolve `./usePrewarmDescriptions`.

- [ ] **Step 3: Implement** (`app/src/data/usePrewarmDescriptions.ts`)

```ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchPlaceDescriptionsBatch } from '../lib/enrichClient'
import { CURRENT_ENRICH_VERSION } from '../trip/placeCache/version'

/** Max placeIds warmed in one batch — keeps large trips from flooding requests. */
export const PREWARM_BATCH_MAX = 25

/**
 * Pre-warm the description cache for a bounded set of placeIds (e.g. the active
 * day's stops). One `getBatch` (ready hits only — never generates), seeded into
 * the same TanStack cache `useStopDescription` reads, so opening a stop is
 * instant. De-dupes and caps at PREWARM_BATCH_MAX.
 */
export function usePrewarmDescriptions(placeIds: Array<string | undefined>): void {
  const qc = useQueryClient()
  const ids = Array.from(new Set(placeIds.filter((x): x is string => !!x))).slice(0, PREWARM_BATCH_MAX)
  const key = ids.join(',')
  useEffect(() => {
    if (ids.length === 0) return
    let cancelled = false
    void (async () => {
      const map = await fetchPlaceDescriptionsBatch(ids)
      if (cancelled) return
      for (const [placeId, content] of Object.entries(map)) {
        qc.setQueryData(['place-desc', placeId, CURRENT_ENRICH_VERSION], { state: 'ready', content })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/data/usePrewarmDescriptions.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/usePrewarmDescriptions.ts app/src/data/usePrewarmDescriptions.test.tsx
git commit -m "feat(place-cache): bounded pre-warm (active-day batch, capped, ready-only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — Read-site integration

> These tasks change behavior in `Guide`/`StopDetail`/`ArrivalView`/`AddStop`. They
> have no new pure unit under test; verify with `npx tsc -b` + the full suite +
> the live smoke test (Task 13). Keep edits minimal and follow the file's style.

### Task 7: Guide reads from the library + pre-warms the active day

**Files:** Modify `app/src/trip/Guide.tsx`

- [ ] **Step 1: Replace the per-stop enrichment source**

In `Guide.tsx`, the focused stop currently feeds `StoryTabs` from `stop.history/notice/tips/facts` and auto-enriches via `const needsEnrich = !!stop && !stop.history`. Replace with the hook:

- Add imports:
```ts
import { useStopDescription } from '../data/useStopDescription'
import { usePrewarmDescriptions } from '../data/usePrewarmDescriptions'
```
- Where the focused `stop` is known, derive its description:
```ts
  const desc = useStopDescription(stop)
  const story = desc.history
  const notice = desc.notice
  const experience = desc.tips
  const facts = desc.facts
```
  (Replace the existing `story/notice/experience/facts` derivations that read `stop.history/...` for the focused card.)
- **Remove** the `needsEnrich`/`generateStopDetail` auto-enrich effect block (the one gated on `!stop.history` + `canEdit` that calls `generateStopDetail` and `save`). The library now owns generation.
- Pre-warm the active day's stops:
```ts
  usePrewarmDescriptions(stops.map(s => s.placeId))
```
- **Surface the loading state** (spec "Loading behavior"): when `desc.state === 'pending'` and the body is empty, render a tasteful shimmer with a label — *"Writing this place's story…"* — using the existing `CardSkeleton`/skeleton pattern in Guide rather than a blank; on `'failed'`/`'unsupported'`, show the legacy fallback (already in `desc.*`) or a calm one-line message. `desc.state` carries this; the UI poll budget lives in the hook (Task 5), so no spinner-for-a-minute.

- [ ] **Step 2: Verify**

Run: `npx tsc -b && npx vitest run`
Expected: exit 0; suite green (Guide tests may need the enrichClient mock — if a Guide test imports the real hook and errors on network, mock `../data/useStopDescription` in that test to return a static description; do the minimal mock the failing test requires).

- [ ] **Step 3: Commit**

```bash
git add app/src/trip/Guide.tsx
git commit -m "feat(place-cache): Guide reads descriptions from the shared library + pre-warms the day

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 8: StopDetail + ArrivalView via the hook; founder-only Regenerate

**Files:** Modify `app/src/trip/StopDetail.tsx`, `app/src/trip/guide/ArrivalView.tsx`

- [ ] **Step 1: StopDetail — read via the hook, remove the public button**

In `StopDetail.tsx`:
- Add: `import { useStopDescription } from '../data/useStopDescription'` and `import { regeneratePlace } from '../lib/enrichClient'` and the auth/role source the app already uses for founder (e.g. `useProfile`/`useAuth` — match how `ai-proxy` access is detected elsewhere; if a `profile.role` is available in this component's context, use it).
- Replace reads of `stop.history` / `stop.facts` / `stop.tips` in the render with `const desc = useStopDescription(stop)` then use `desc.history` / `desc.facts` / `desc.tips`.
- **Remove** the public Generate / Re-generate button + `handleGenerate` that calls `generateStopDetail` (lines around 145–151, 256–272).
- Add a **founder-only** control in its place:
```tsx
  {isFounder && stop.placeId && (
    <button type="button" onClick={async () => { await regeneratePlace(stop.placeId!, false); qc.invalidateQueries({ queryKey: ['place-desc', stop.placeId] }) }}
      className="text-[12px] text-muted hover:text-ink underline">
      Regenerate (founder)
    </button>
  )}
```
  (`isFounder` from the profile; `qc` from `useQueryClient()` — add `import { useQueryClient } from '@tanstack/react-query'` if not present. If the founder role isn't readily available in this component, gate the control behind the same signal the app uses to show founder-only affordances; do not expose it to non-founders.)

- [ ] **Step 2: ArrivalView**

`ArrivalView` receives `story/notice/experience/facts` as props from Guide (Task 7 already feeds them from `useStopDescription`). Confirm no direct `stop.history` reads remain in `ArrivalView`; if it reads stop fields directly, thread the same `desc` values from Guide instead. (No change if it's purely prop-driven.)

- [ ] **Step 3: Verify**

Run: `npx tsc -b && npx vitest run`
Expected: exit 0; suite green (update/mocks as in Task 7 if a StopDetail test exercised the old button).

- [ ] **Step 4: Commit**

```bash
git add app/src/trip/StopDetail.tsx app/src/trip/guide/ArrivalView.tsx
git commit -m "feat(place-cache): StopDetail/ArrivalView read the library; founder-only regenerate replaces the public button

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 9: Pre-warm on add (AddStop)

**Files:** Modify `app/src/trip/AddStop.tsx`

- [ ] **Step 1: Fire a background warm when a placeId stop is added**

In `AddStop.tsx`, add `import { fetchPlaceDescription } from '../lib/enrichClient'`. In `onPickPlace`, after `addStop({...})` and the existing `backfillPlaceDetails(...)`, add:
```ts
    if (p.placeId) void fetchPlaceDescription(p.placeId, { name: p.primaryText, ...(p.types.length ? { placeTypes: p.types } : {}) })
```
This pre-generates the description so it's ready (or `pending`) by the time the user opens the stop. Fire-and-forget; never blocks the add.

- [ ] **Step 2: Verify + commit**

Run: `npx tsc -b && npx vitest run` → exit 0, green.
```bash
git add app/src/trip/AddStop.tsx
git commit -m "feat(place-cache): pre-warm a place's description on add

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — Backend (operator-applied / probe-verified)

### Task 10: Database SQL

**Files:** Create `supabase/sql/place_cache.sql` (a tracked script the operator runs in the Supabase SQL editor — there is no migration framework in this repo).

- [ ] **Step 1: Write the SQL**

```sql
-- Shared place-description cache. Service-role only; the enrich-place function is
-- the sole reader/writer. Run in the Supabase SQL editor.

create table if not exists public.place_cache (
  place_id              text        not null,
  prompt_version        int         not null,
  prompt_id             text,
  supersedes_version    int,
  generation_status     text        not null default 'generating'
                          check (generation_status in ('generating','ready','failed','unsupported')),
  generation_started_at timestamptz not null default now(),
  generation_attempts   int         not null default 0,
  generation_error      text,
  content_source        text        not null default 'generated'
                          check (content_source in ('generated','manual')),
  manual_lock           boolean     not null default false,
  is_stale              boolean     not null default false,
  history               text,
  facts                 jsonb,
  tips                  text,
  notice                text,
  source                text,
  place_name            text,
  address               text,
  lat                   double precision,
  lng                   double precision,
  place_types           jsonb,
  country_code          text,
  region                text,
  model                 text,
  generated_at          timestamptz,
  updated_at            timestamptz,
  last_verified_at      timestamptz,
  edited_by             text,
  primary key (place_id, prompt_version)
);

-- At most one curated override per place (deliberate, version-independent).
create unique index if not exists place_cache_one_manual_lock
  on public.place_cache (place_id) where manual_lock;

create table if not exists public.place_cache_audit (
  id             bigint generated always as identity primary key,
  place_id       text not null,
  prompt_version int,
  action         text not null check (action in ('generate','regenerate','manual_edit','mark_stale')),
  actor          text,
  model          text,
  prompt_id      text,
  detail         text,
  created_at     timestamptz not null default now()
);
create index if not exists place_cache_audit_place_idx on public.place_cache_audit (place_id, created_at);

-- Lock both tables to the service role: enable RLS with NO client policies.
-- (The service role used by the edge function bypasses RLS; anon/authenticated
--  get no policy => no access.)
alter table public.place_cache       enable row level security;
alter table public.place_cache_audit enable row level security;

-- Manual-edit + mark-stale audit trigger. Fires ONLY for a genuine manual edit
-- (content_source='manual' AND content changed) so a function regenerate
-- (which writes content_source='generated') never double-logs.
create or replace function public.place_cache_audit_trg() returns trigger as $$
begin
  if NEW.content_source = 'manual'
     and (NEW.history is distinct from OLD.history
          or NEW.facts is distinct from OLD.facts
          or NEW.tips is distinct from OLD.tips
          or NEW.notice is distinct from OLD.notice) then
    insert into public.place_cache_audit(place_id, prompt_version, action, actor, prompt_id, detail)
    values (NEW.place_id, NEW.prompt_version, 'manual_edit', coalesce(NEW.edited_by,'dashboard'), NEW.prompt_id, 'content edited');
  end if;
  if NEW.is_stale and not OLD.is_stale then
    insert into public.place_cache_audit(place_id, prompt_version, action, actor, detail)
    values (NEW.place_id, NEW.prompt_version, 'mark_stale', coalesce(NEW.edited_by,'dashboard'), 'marked stale');
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists place_cache_audit_after_update on public.place_cache;
create trigger place_cache_audit_after_update
  after update on public.place_cache
  for each row execute function public.place_cache_audit_trg();
```

- [ ] **Step 2: Commit (apply is Task 13, operator)**

```bash
git add supabase/sql/place_cache.sql
git commit -m "feat(place-cache): SQL — tables, RLS, single-manual-lock index, audit trigger

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 11: `enrich-place` edge function

**Files:** Create `supabase/functions/enrich-place/index.ts`. Reference: `supabase/functions/place-photo/index.ts` (CORS/rate-limit/Supabase-REST-with-service-key), `place-search/index.ts` (Place Details GET), `app/src/trip/enrich.ts` (`buildEnrichPrompt`/`parseStopDetail`), `app/src/trip/wiki.ts` (`wikiExtractUrl`/`parseWikiExtract`).

> No local test (Deno). Verified by Task 13 probes. **Copy** the pure helpers
> from Tasks 1–3 verbatim (`promptId`, `validatePlaceRequest`, `decideAction`,
> `GEN`, `CURRENT_ENRICH_VERSION`) and the ported `buildEnrichPrompt`/
> `parseStopDetail`/`wikiExtractUrl`/`parseWikiExtract` — with a header comment
> naming the app source of truth for each.

- [ ] **Step 1: Write the function** — full code:

```ts
// supabase/functions/enrich-place/index.ts
//
// Shared place-description cache authority. The ONLY reader/writer of place_cache
// (service role). Verifies the place via Google Place Details, claims a per-row
// lock via PostgREST (POST 409 = contention), generates via ai-proxy (founder/
// credits-gated), writes content + provenance atomically, audits. Reuses the
// shared GOOGLE_PLACES_API_KEY + service role. Never 5xx — returns
// {status:'failed'|'unsupported'} on any error.
//
// COPIED PURE HELPERS (sync with app):
//   CURRENT_ENRICH_VERSION, promptId        ← app/src/trip/placeCache/version.ts
//   validatePlaceRequest, isValidPlaceIdShape ← app/src/trip/placeCache/validate.ts
//   GEN, decideAction                        ← app/src/trip/placeCache/decide.ts
//   buildEnrichPrompt, parseStopDetail       ← app/src/trip/enrich.ts
//   wikiExtractUrl, parseWikiExtract         ← app/src/trip/wiki.ts

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')
const REST = `${SUPABASE_URL}/rest/v1/place_cache`
const AUDIT = `${SUPABASE_URL}/rest/v1/place_cache_audit`
const AI_PROXY = `${SUPABASE_URL}/functions/v1/ai-proxy`
const CURRENT_ENRICH_VERSION = 2
const GEN = { LEASE_SECONDS: 60, FAILURE_COOLDOWN_SECONDS: 300, MAX_ATTEMPTS: 5 }
const RATE_LIMIT_PER_HOUR = 120
const rate = new Map<string, { count: number; resetAt: number }>()

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const sh = (extra: Record<string, string> = {}) => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra })

// ---- copied pure helpers (verbatim from app; see header) ----
function promptId(t: string): string { let h = 0x811c9dc5; for (let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,0x01000193)} return (h>>>0).toString(16).padStart(8,'0') }
function isValidPlaceIdShape(p: string){ return /^[A-Za-z0-9_-]{16,}$/.test(p) }
function validatePlaceRequest(r: { placeId: string; name?: string; coords?: { lat:number; lng:number } }) {
  if(!isValidPlaceIdShape(r.placeId)) return {ok:false}; if(r.name!==undefined && r.name.trim()==='') return {ok:false}
  if(r.coords){const{lat,lng}=r.coords;const f=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);if(!f(lat)||!f(lng)||lat<-90||lat>90||lng<-180||lng>180) return {ok:false}}
  return {ok:true}
}
type Row = { generation_status:string; generation_started_at:string; generation_attempts:number; content_source?:string; manual_lock?:boolean } | null
// Returns { kind } to MATCH app/src/trip/placeCache/decide.ts exactly (verbatim copy).
function decideAction(row: Row, nowMs: number): { kind: string } {
  if(!row) return { kind:'claim' }
  const age=(nowMs-Date.parse(row.generation_started_at))/1000
  switch(row.generation_status){
    case 'ready': return { kind:'serve' }
    case 'unsupported': return { kind:'unsupported' }
    case 'generating': return { kind: age>GEN.LEASE_SECONDS?'reclaim':'pending' }
    case 'failed':
      if(age<=GEN.FAILURE_COOLDOWN_SECONDS) return { kind:'failed' }
      return { kind: row.generation_attempts>=GEN.MAX_ATTEMPTS?'failed':'claim' }
  }
  return { kind:'failed' }
}
// buildEnrichPrompt / parseStopDetail / wikiExtractUrl / parseWikiExtract:
// PASTE the current implementations from app/src/trip/enrich.ts and app/src/trip/wiki.ts here verbatim.
// (They are pure TS with no Node/browser-only APIs.)

function ok(ip: string){ const n=Date.now(); const e=rate.get(ip); if(!e||n>e.resetAt){rate.set(ip,{count:1,resetAt:n+3600_000});return true} if(e.count>=RATE_LIMIT_PER_HOUR) return false; e.count++; return true }

/** Pick the served row: a manual_lock row wins (any version), else current version. */
async function readRow(placeId: string): Promise<{ row: Row; isManualLock: boolean }> {
  const r = await fetch(`${REST}?place_id=eq.${encodeURIComponent(placeId)}&order=manual_lock.desc,prompt_version.desc`, { headers: sh() })
  const rows = r.ok ? await r.json() : []
  const manual = rows.find((x: { manual_lock?: boolean }) => x.manual_lock)
  if (manual) return { row: manual, isManualLock: true }
  const cur = rows.find((x: { prompt_version: number }) => x.prompt_version === CURRENT_ENRICH_VERSION)
  return { row: cur ?? null, isManualLock: false }
}
const content = (row: { history?: string; facts?: string[]; tips?: string; notice?: string }) =>
  ({ history: row.history ?? '', facts: row.facts ?? [], tips: row.tips ?? '', notice: row.notice ?? '' })

/** Google Place Details: verify existence + canonical metadata, or null (not found), or 'error'. */
async function placeDetails(placeId: string): Promise<Record<string, unknown> | null | 'error'> {
  if (!GOOGLE_PLACES_API_KEY) return 'error'
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': 'displayName,formattedAddress,location,types,addressComponents' },
    })
    if (r.status === 404) return null
    if (!r.ok) return 'error'
    return await r.json()
  } catch { return 'error' }
}

async function audit(placeId: string, action: string, actor: string, extra: Record<string, unknown> = {}) {
  try { await fetch(AUDIT, { method: 'POST', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({ place_id: placeId, prompt_version: CURRENT_ENRICH_VERSION, action, actor, ...extra }) }) } catch { /* best effort */ }
}

/** Generate + atomically finalize. Caller already owns the lock row. */
async function generate(placeId: string, det: Record<string, unknown>, userAuth: string, actor: string): Promise<{ status: string; content?: unknown }> {
  const name = (det.displayName as { text?: string })?.text ?? ''
  const loc = det.location as { latitude?: number; longitude?: number } | undefined
  const addr = (det.formattedAddress as string) ?? ''
  const wiki = await fetch(wikiExtractUrl(`${name}, ${addr}`)).then(r => r.ok ? r.json() : null).catch(() => null)
  const source = parseWikiExtract(wiki) ?? ''
  const prompt = buildEnrichPrompt({ name, address: addr, lat: loc?.latitude, lng: loc?.longitude } as never, '', addr, { source })
  const aiRes = await fetch(AI_PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: userAuth }, body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: 700 }) })
  if (!aiRes.ok) { // gated/limited/failed → mark failed, return
    await fetch(`${REST}?place_id=eq.${encodeURIComponent(placeId)}&prompt_version=eq.${CURRENT_ENRICH_VERSION}`, { method: 'PATCH', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({ generation_status: 'failed', generation_error: `ai_${aiRes.status}`, updated_at: new Date().toISOString() }) })
    return { status: 'failed' }
  }
  const text = ((await aiRes.json()).content?.[0]?.text) ?? ''
  const parsed = parseStopDetail(text)
  const now = new Date().toISOString()
  // ATOMIC ready write: content + full provenance + status in one PATCH.
  await fetch(`${REST}?place_id=eq.${encodeURIComponent(placeId)}&prompt_version=eq.${CURRENT_ENRICH_VERSION}`, { method: 'PATCH', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({
    generation_status: 'ready', prompt_id: promptId(prompt), model: 'claude-sonnet-4-6',
    history: parsed.history, facts: parsed.facts, tips: parsed.tips, notice: parsed.notice, source,
    place_name: name, address: addr, lat: loc?.latitude, lng: loc?.longitude, place_types: det.types ?? [],
    generated_at: now, updated_at: now, last_verified_at: now, content_source: 'generated', generation_error: null,
  }) })
  await audit(placeId, 'generate', actor, { model: 'claude-sonnet-4-6', prompt_id: promptId(prompt) })
  return { status: 'ready', content: parsed }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })
  const userAuth = req.headers.get('Authorization') ?? ''
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  let p: { action?: string; placeId?: string; placeIds?: string[]; name?: string; coords?: { lat: number; lng: number }; force?: boolean }
  try { p = await req.json() } catch { return json({ status: 'failed' }) }

  try {
    // --- getBatch: ready hits only, no generation ---
    if (p.action === 'getBatch') {
      const ids = (p.placeIds ?? []).filter(isValidPlaceIdShape).slice(0, 50)
      if (ids.length === 0) return json({ results: {} })
      const inList = ids.map(encodeURIComponent).join(',')
      const r = await fetch(`${REST}?place_id=in.(${inList})&generation_status=eq.ready&or=(manual_lock.eq.true,prompt_version.eq.${CURRENT_ENRICH_VERSION})`, { headers: sh() })
      const rows = r.ok ? await r.json() : []
      const results: Record<string, unknown> = {}
      for (const row of rows) if (!results[row.place_id] || row.manual_lock) results[row.place_id] = content(row)
      return json({ results })
    }

    const placeId = p.placeId ?? ''
    if (!validatePlaceRequest({ placeId, name: p.name, coords: p.coords }).ok) return json({ status: 'failed' })

    // --- regenerate (founder-only) ---
    if (p.action === 'regenerate') {
      // verify founder
      const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: userAuth, apikey: SERVICE_KEY } }).then(r => r.ok ? r.json() : null).catch(() => null)
      const uid = who?.id
      if (!uid) return json({ status: 'failed' }, 401)
      const prof = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}&select=role`, { headers: sh() }).then(r => r.ok ? r.json() : []).catch(() => [])
      if (prof?.[0]?.role !== 'founder') return json({ status: 'failed' }, 403)
      if (!ok(ip)) return json({ status: 'failed' }, 429)
      const { row, isManualLock } = await readRow(placeId)
      if (isManualLock && !p.force) return json({ status: 'ready', content: content(row as Record<string, unknown>) }) // preserve curated unless force
      const det = await placeDetails(placeId)
      if (det === null) { await upsertUnsupported(placeId); return json({ status: 'unsupported' }) }
      if (det === 'error') return json({ status: 'failed' })
      // upsert a current-version row in 'generating', clearing manual_lock on force
      await fetch(REST, { method: 'POST', headers: sh({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ place_id: placeId, prompt_version: CURRENT_ENRICH_VERSION, generation_status: 'generating', generation_started_at: new Date().toISOString(), generation_attempts: 1, content_source: 'generated', manual_lock: false, supersedes_version: (row as { prompt_version?: number })?.prompt_version ?? null }) })
      const out = await generate(placeId, det as Record<string, unknown>, userAuth, uid)
      await audit(placeId, 'regenerate', uid)
      return json(out)
    }

    // --- get ---
    const { row, isManualLock } = await readRow(placeId)
    const action = decideAction(row as Row, Date.now())
    if (action.kind === 'serve' || (isManualLock && row)) return json({ status: 'ready', content: content(row as Record<string, unknown>) })
    if (action.kind === 'unsupported') return json({ status: 'unsupported' })
    if (action.kind === 'pending') return json({ status: 'pending' })
    if (action.kind === 'failed') return json({ status: 'failed' })
    if (!ok(ip)) return json({ status: 'pending' }) // rate-limited → ask client to retry, don't generate now

    // claim or reclaim → verify, then own + generate
    const det = await placeDetails(placeId)
    if (det === null) { await upsertUnsupported(placeId); return json({ status: 'unsupported' }) }
    if (det === 'error') return json({ status: 'failed' })

    if (action.kind === 'reclaim') {
      const re = await fetch(`${REST}?place_id=eq.${encodeURIComponent(placeId)}&prompt_version=eq.${CURRENT_ENRICH_VERSION}&generation_status=eq.generating&generation_started_at=lt.${new Date(Date.now() - GEN.LEASE_SECONDS*1000).toISOString()}`, { method: 'PATCH', headers: sh({ Prefer: 'return=representation' }), body: JSON.stringify({ generation_started_at: new Date().toISOString(), generation_attempts: ((row as { generation_attempts?: number })?.generation_attempts ?? 1) + 1 }) })
      const got = re.ok ? await re.json() : []
      if (!got.length) return json({ status: 'pending' }) // someone else reclaimed
    } else {
      // claim: POST insert; 409 means another request won → pending
      const ins = await fetch(REST, { method: 'POST', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({ place_id: placeId, prompt_version: CURRENT_ENRICH_VERSION, generation_status: 'generating', generation_started_at: new Date().toISOString(), generation_attempts: 1 }) })
      if (ins.status === 409) return json({ status: 'pending' })
      if (!ins.ok) return json({ status: 'failed' })
    }
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: userAuth, apikey: SERVICE_KEY } }).then(r => r.ok ? r.json() : null).catch(() => null)
    return json(await generate(placeId, det as Record<string, unknown>, userAuth, who?.id ?? 'system'))
  } catch (e) {
    console.error('[enrich-place]', String(e))
    return json({ status: 'failed' })
  }
})

async function upsertUnsupported(placeId: string) {
  const now = new Date().toISOString()
  await fetch(REST, { method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ place_id: placeId, prompt_version: CURRENT_ENRICH_VERSION, generation_status: 'unsupported', generation_started_at: now, updated_at: now, last_verified_at: now }) })
}
```

> **Implementer note:** paste the real `buildEnrichPrompt`, `parseStopDetail`,
> `wikiExtractUrl`, `parseWikiExtract` bodies from the app (they're pure). Keep the
> `model` string consistent with what `ai-proxy` actually used (`claude-sonnet-4-6`
> default). The `addressComponents` field can populate `country_code`/`region` if
> desired (optional; leave null if you don't parse it).
>
> **Deferred (spec "drift auto-flag"):** the columns exist (`is_stale`,
> `last_verified_at`) and `generate()` stamps `last_verified_at`, but the cheap
> "metadata materially changed since a prior entry → set `is_stale`" comparison is
> **not** implemented in v1 (it's a "may" in the spec). Leave a `// TODO(drift):`
> marker at the write site; it's a later one-liner, not part of this build.

- [ ] **Step 2: Structural self-check + commit** (no local Deno test)

Confirm: every branch returns benign JSON (never throws/5xx); the lock claim uses `POST`→409; reclaim is a filtered `PATCH`; the ready write is a single PATCH; `regenerate` checks founder; `getBatch` never generates. Then:
```bash
git add supabase/functions/enrich-place/index.ts
git commit -m "feat(place-cache): enrich-place edge function (verify, lock, generate, audit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — Verify, deploy, smoke

### Task 12: Full app verification

- [ ] **Step 1: Typecheck + full suite**

Run: `cd app && npx tsc -b && npx vitest run`
Expected: exit 0; all tests pass (Tasks 1–6 added; Tasks 7–9 didn't break existing — fix any read-site test that referenced the removed button/auto-enrich by mocking `useStopDescription`).

- [ ] **Step 2: Commit any test adjustments**

```bash
git add -A && git commit -m "test(place-cache): adjust read-site tests for library-backed descriptions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 13: Deploy + live probes (operator)

- [ ] **Step 1: Apply SQL** — paste `supabase/sql/place_cache.sql` into the Supabase SQL editor (project `wnpanbjzmcsvhfyjdczv`) and run it. Confirm both tables + the partial unique index + the trigger exist.

- [ ] **Step 2: Deploy the function**

Run (operator): `supabase functions deploy enrich-place`
Expected: deploys under slug `enrich-place`. It reuses `GOOGLE_PLACES_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and calls `ai-proxy` for the gated AI.

- [ ] **Step 3: Probe `get` (cache miss → ready)** — with `ANON` from `app/.env.local`:

```bash
URL="https://wnpanbjzmcsvhfyjdczv.supabase.co/functions/v1/enrich-place"
curl -s -X POST "$URL" -H "Content-Type: application/json" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  --data '{"action":"get","placeId":"ChIJteVBdWDwwIcRNKiWxoko7Xk","name":"Gateway Arch"}'
```
Expected: `{"status":"ready","content":{...history,facts,tips...}}` on first run (generates), instant `ready` on a second run (cache hit). (A non-founder/no-credit token may return `{"status":"failed"}` from the gate — use a founder token to seed.)

- [ ] **Step 4: Probe `getBatch`, `unsupported`, `regenerate`**

```bash
# batch (ready hits only):
curl -s -X POST "$URL" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" -H "Content-Type: application/json" --data '{"action":"getBatch","placeIds":["ChIJteVBdWDwwIcRNKiWxoko7Xk"]}'
# fake-but-shaped id → unsupported (negative cache), no content row with content:
curl -s -X POST "$URL" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" -H "Content-Type: application/json" --data '{"action":"get","placeId":"ABCDEFGHIJKLMNOPQRST","name":"Nowhere"}'
# regenerate with a FOUNDER token → ready (overwrites):
curl -s -X POST "$URL" -H "Authorization: Bearer $FOUNDER_JWT" -H "apikey: $ANON" -H "Content-Type: application/json" --data '{"action":"regenerate","placeId":"ChIJteVBdWDwwIcRNKiWxoko7Xk","force":false}'
```
Expected: batch returns the ready map; the fake id returns `{"status":"unsupported"}`; regenerate returns `ready` (and 403 `failed` with a non-founder token). Spot-check the `place_cache` row in the Supabase dashboard for full provenance (model, prompt_id, place_name, timestamps) and an audit row.

- [ ] **Step 5: App smoke**

Run: `cd app && npm run dev` → open a trip → Add a stop (autocomplete) → open it: the description appears (or a tasteful "Writing this place's story…" then resolves). Add the same place again / open it in another trip → instant (cache hit). As a founder, the "Regenerate (founder)" control appears in Stop detail; as a non-founder it does not.

### Task 14: Merge

- [ ] Finish via **superpowers:finishing-a-development-branch** (PR or merge). The branch carries the whole feature; the operator SQL + deploy (Task 13) must be done for it to function live, but the app degrades gracefully until then (descriptions fall back to legacy fields / empty).

---

## Risks & mitigations
- **Pure-helper drift (app ↔ function):** the function copies `decideAction`/
  `validate`/`promptId`/`version`; each copy names its app source. A divergence is
  caught by the Task-13 probes. (A future refactor could share via a Deno-importable
  module; out of scope.)
- **ai-proxy gate on generation:** non-founder/no-credit users can't *generate* new
  places (they reuse cached ones). Acceptable per spec; founders/credited users seed
  the shared library for everyone.
- **Place Details cost:** one call per first generation, then cached forever; fake
  ids cost one (rate-limited) lookup then a tiny `unsupported` row.
- **Read-site tests:** removing the public generate button / auto-enrich may break
  existing Guide/StopDetail tests — mock `useStopDescription` in those tests.

## Out of scope (tracked)
- Premium offline snapshots; admin "Places" page; realtime push; time-based
  staleness policy; shared cache for by-name stops.
