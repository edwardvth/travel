# Stop chips (hours · price · good-for) + day-utilization caption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google-Places-sourced opening-hours + price chips and an AI good-for chip to `StopDetail`, plus a tiny day-utilization caption on the Plan day header.

**Architecture:** A standalone, dormant-by-default `place-details` edge function (mirrors `place-photo`) returns raw Google `regularOpeningHours`/`priceLevel`; the client maps + renders them as read-only chips, persisting onto the stop at "Generate details" time. `goodFor` rides the existing AI enrichment. The caption is a pure derived value reusing `trip/duration.ts`. All additive, immutable saves, no edit-gate.

**Tech Stack:** Vite + React 18 + TS + Tailwind (CSS-var tokens) + Supabase Edge Functions (Deno) + Google Places API (New) + vitest.

**Spec:** `docs/superpowers/specs/2026-06-29-passage-stop-chips-day-caption-design.md`
**Baseline:** worktree `.claude/worktrees/tier3-chips-caption`, branch `tier3-chips-caption`, off `main` HEAD `cd878d4`. All commands run from `app/` unless noted. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File structure

| File | Responsibility | New? |
|---|---|---|
| `app/src/types.ts` | `PriceLevel` + additive `Stop.hours/price/goodFor` | modify |
| `app/src/trip/enrich.ts` | `goodFor` in `StopDetailContent` + parse + prompt | modify |
| `supabase/functions/place-details/index.ts` | Google Places hours/price proxy (Deno) | create |
| `app/src/trip/placeDetails.ts` | client invoker + `mapGooglePrice` (pure) | create |
| `app/src/trip/placeDetails.test.ts` | `mapGooglePrice` unit tests | create |
| `app/src/trip/stop-hours.ts` | `stopHoursLabel` (pure) | create |
| `app/src/trip/stop-hours.test.ts` | `stopHoursLabel` unit tests | create |
| `app/src/trip/icons.tsx` | add `Heart`, `TriangleAlert` re-exports | modify |
| `app/src/trip/StopDetail.tsx` | parallel Places fetch + persist + render chips | modify |
| `app/src/trip/day-utilization.ts` | `dayUtilization` (pure) | create |
| `app/src/trip/day-utilization.test.ts` | `dayUtilization` unit tests | create |
| `app/src/trip/Itinerary.tsx` | render the caption line | modify |

---

## Baseline check (before Task 1)

- [ ] Run: `cd app && npm install && npm test`
  Expected: full suite green (the worktree's current count). Then `npx tsc -b` clean.

---

## Task 1: `types.ts` — `PriceLevel` + additive `Stop` fields

**Files:**
- Modify: `app/src/types.ts`
- Test: `app/src/types.test.ts` (create)

- [ ] **Step 1: Write the failing test** — `app/src/types.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import type { Stop, PriceLevel } from './types'

describe('Stop additive chip fields', () => {
  it('accepts hours[] / price enum / goodFor', () => {
    const s: Stop = {
      name: 'X',
      hours: ['Monday: 9:30 AM – 5:00 PM'],
      price: '$$',
      goodFor: 'Architecture lovers',
    }
    expect(s.price).toBe('$$')
    expect(s.hours?.length).toBe(1)
    const p: PriceLevel = '$$$$'
    expect(p).toBe('$$$$')
  })
})
```

- [ ] **Step 2: Run — fails**
  Run: `npx vitest run src/types.test.ts`
  Expected: TS error — `has no exported member 'PriceLevel'` / unknown properties `hours`/`price`/`goodFor`.

- [ ] **Step 3: Implement** — in `app/src/types.ts`, add the type alias above `interface Stop`:

```ts
/** Canonical normalized price level for a stop (rendered as a chip). */
export type PriceLevel = '$' | '$$' | '$$$' | '$$$$'
```

  And add these fields inside `interface Stop` (right after the `placeTypes?: string[]` block):

```ts
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
```

- [ ] **Step 4: Run — passes**
  Run: `npx vitest run src/types.test.ts` → `1 passed`. Then `npx tsc -b` clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/types.ts app/src/types.test.ts
git commit -m "feat(types): add Stop.hours[]/price(enum)/goodFor + PriceLevel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `enrich.ts` — `goodFor` in the AI enrichment

**Files:**
- Modify: `app/src/trip/enrich.ts` (`StopDetailContent` line 6-11, `parseStopDetail` 136-161, `buildEnrichPrompt` prompt body ~97-112)
- Test: `app/src/trip/enrich.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `app/src/trip/enrich.test.ts`

```ts
describe('parseStopDetail goodFor', () => {
  it('emits goodFor when present', () => {
    const out = parseStopDetail('{"history":"h","facts":[],"tips":"t","goodFor":"Foodies"}')
    expect(out.goodFor).toBe('Foodies')
  })
  it('omits goodFor (empty string) when absent', () => {
    const out = parseStopDetail('{"history":"h"}')
    expect(out.goodFor).toBe('')
  })
})

describe('buildEnrichPrompt goodFor', () => {
  it('asks for a goodFor tag in the JSON schema', () => {
    const p = buildEnrichPrompt({ name: 'Louvre' } as any, 'Paris Trip')
    expect(p).toContain('"goodFor"')
  })
})
```

(Confirm `parseStopDetail` and `buildEnrichPrompt` are already imported at the top of the test file; they are.)

- [ ] **Step 2: Run — fails**
  Run: `npx vitest run src/trip/enrich.test.ts`
  Expected: `goodFor` is `undefined` / prompt lacks `"goodFor"`.

- [ ] **Step 3: Implement** — in `app/src/trip/enrich.ts`:

  (a) Add `goodFor` to the interface (lines 6-11):

```ts
export interface StopDetailContent {
  history: string
  facts: string[]
  tips: string
  notice: string
  goodFor: string
}
```

  (b) In `parseStopDetail`, add `goodFor` to BOTH the `fallback` (line 137), the parsed object (lines 148-153), and the plain-text fallback return (line 160). Each gets `goodFor: ''` except the parsed object:

```ts
  const fallback: StopDetailContent = { history: '', facts: [], tips: '', notice: '', goodFor: '' }
```
```ts
      return {
        history: typeof info.history === 'string' ? info.history.trim() : '',
        facts: coerceFacts(info.facts),
        tips: typeof info.tips === 'string' ? info.tips.trim() : '',
        notice: typeof info.notice === 'string' ? info.notice.trim() : '',
        goodFor: typeof info.goodFor === 'string' ? info.goodFor.trim() : '',
      }
```
```ts
  return { history: raw, facts: [], tips: '', notice: '', goodFor: '' }
```

  Also update the `empty` const in `generateStopDetail` (line 180) and its catch return:

```ts
  const empty: StopDetailContent = { history: '', facts: [], tips: '', notice: '', goodFor: '' }
```

  (c) In `buildEnrichPrompt`, add one section line (after the `"tips"` line, ~102) and one JSON-template key (line 112). After the `tips` bullet add:

```
- "goodFor" = a short audience/occasion tag (2-4 words, e.g. "Architecture lovers", "Romantic dinner", "Family-friendly") if one is genuinely characteristic of this place — else omit.
```

  And extend the JSON template object (line 112) to include `"goodFor":"Architecture lovers"` before the closing brace:

```
{"history":"Story — why it matters, plain-text paragraphs separated by \\n\\n (or empty).","facts":["interesting factual detail with a date or number","little-known true detail"],"tips":"Experience — how to experience it on the ground: best time, what to look for, the atmosphere.","goodFor":"Architecture lovers"}
```

- [ ] **Step 4: Run — passes**
  Run: `npx vitest run src/trip/enrich.test.ts` → green. Then `npx tsc -b` clean (any other `StopDetailContent` literal in the codebase now needs `goodFor` — fix call sites if the typecheck flags them; the only consumer is `StopDetail.tsx`, handled in Task 7).

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/enrich.ts app/src/trip/enrich.test.ts
git commit -m "feat(enrich): AI good-for tag in StopDetailContent + prompt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `place-details` edge function (Google Places hours/price proxy)

**Files:**
- Create: `supabase/functions/place-details/index.ts`

Deno function — not covered by vitest. Mirrors `place-photo`: server-side key, CORS, per-IP rate limit, graceful `200 { hours: null, price: null }` when the key is unset. Reuses the existing `GOOGLE_PLACES_API_KEY` secret.

- [ ] **Step 1: Implement** — create `supabase/functions/place-details/index.ts`

```ts
// supabase/functions/place-details/index.ts
//
// PAID, DORMANT opening-hours + price proxy: Google Places API (New).
//
// Returns a place's regularOpeningHours.weekdayDescriptions (7 strings) and raw
// priceLevel enum for the stop-detail chips. The Google Places API key lives
// ONLY here, server-side, and is NEVER returned to the client. Reuses the same
// GOOGLE_PLACES_API_KEY secret as place-photo.
//
// GRACEFUL BY DESIGN: when GOOGLE_PLACES_API_KEY is unset (the default), this
// returns 200 JSON { placeId: null, hours: null, price: null } so the client
// simply shows no chips and the app behaves EXACTLY as today. NEVER 500s.
//
// DEPLOY: supabase functions deploy place-details  (slug must stay 'place-details';
// the client constant PLACE_DETAILS_FN_SLUG in app/src/trip/placeDetails.ts must match).

const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')
const RATE_LIMIT_PER_HOUR = 120
const rate = new Map<string, { count: number; resetAt: number }>()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PlaceDetailsReply { placeId: string | null; displayName: string | null; hours: string[] | null; price: string | null }

function reply(body: PlaceDetailsReply, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const nullReply = () => reply({ placeId: null, displayName: null, hours: null, price: null })

function ok(ip: string): boolean {
  const now = Date.now(); const e = rate.get(ip)
  if (!e || now > e.resetAt) { rate.set(ip, { count: 1, resetAt: now + 3600_000 }); return true }
  if (e.count >= RATE_LIMIT_PER_HOUR) return false
  e.count++; return true
}

/** Shape we pull out of either a Details place object or a Text Search result. */
interface RawPlace {
  id?: string
  displayName?: { text?: string }
  regularOpeningHours?: { weekdayDescriptions?: unknown }
  priceLevel?: string
}

function pick(p: RawPlace | null | undefined): PlaceDetailsReply {
  if (!p) return { placeId: null, displayName: null, hours: null, price: null }
  const wd = p.regularOpeningHours?.weekdayDescriptions
  const hours = Array.isArray(wd) ? wd.map((s) => String(s)).filter(Boolean) : null
  return {
    placeId: typeof p.id === 'string' && p.id ? p.id : null,
    displayName: p.displayName?.text ?? null,
    hours: hours && hours.length ? hours : null,
    price: typeof p.priceLevel === 'string' && p.priceLevel ? p.priceLevel : null,
  }
}

const DETAILS_FIELDS = 'id,displayName,regularOpeningHours,priceLevel'
const SEARCH_FIELDS = 'places.id,places.displayName,places.regularOpeningHours,places.priceLevel'

async function byPlaceId(placeId: string): Promise<RawPlace | null> {
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY as string, 'X-Goog-FieldMask': DETAILS_FIELDS },
    })
    if (!r.ok) return null
    return await r.json().catch(() => null) as RawPlace | null
  } catch { return null }
}

async function byQuery(query: string): Promise<RawPlace | null> {
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY as string,
        'X-Goog-FieldMask': SEARCH_FIELDS,
      },
      body: JSON.stringify({ textQuery: query }),
    })
    if (!r.ok) return null
    const json = await r.json().catch(() => null) as { places?: RawPlace[] } | null
    return json?.places?.[0] ?? null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  // Dormant until an operator sets the key. NEVER 500 the app — fall through.
  if (!GOOGLE_PLACES_API_KEY) return nullReply()

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!ok(ip)) return new Response('Rate limit', { status: 429, headers: CORS })

  let body: { query?: string; placeId?: string }
  try { body = await req.json() } catch { return nullReply() }

  const placeId = (body.placeId ?? '').trim()
  const query = (body.query ?? '').slice(0, 200).trim()
  if (!placeId && !query) return nullReply()

  const raw = placeId ? await byPlaceId(placeId) : await byQuery(query)
  return reply(pick(raw))
})
```

- [ ] **Step 2: Smoke-check shape (optional, local)** — the function is dormant without a key. A quick mental check: with no key it returns `{ placeId:null, displayName:null, hours:null, price:null }`. No automated test (Deno runtime). Document this in the commit.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/place-details/index.ts
git commit -m "feat(edge): place-details — Google Places hours/price proxy (dormant w/o key)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `placeDetails.ts` client + `mapGooglePrice` (pure, tested)

**Files:**
- Create: `app/src/trip/placeDetails.ts`
- Test: `app/src/trip/placeDetails.test.ts`

- [ ] **Step 1: Write the failing test** — `app/src/trip/placeDetails.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { mapGooglePrice } from './placeDetails'

describe('mapGooglePrice', () => {
  it('maps the Google enum to canonical symbols', () => {
    expect(mapGooglePrice('PRICE_LEVEL_INEXPENSIVE')).toBe('$')
    expect(mapGooglePrice('PRICE_LEVEL_MODERATE')).toBe('$$')
    expect(mapGooglePrice('PRICE_LEVEL_EXPENSIVE')).toBe('$$$')
    expect(mapGooglePrice('PRICE_LEVEL_VERY_EXPENSIVE')).toBe('$$$$')
  })
  it('returns undefined for free / unspecified / unknown / empty', () => {
    expect(mapGooglePrice('PRICE_LEVEL_FREE')).toBeUndefined()
    expect(mapGooglePrice('PRICE_LEVEL_UNSPECIFIED')).toBeUndefined()
    expect(mapGooglePrice('')).toBeUndefined()
    expect(mapGooglePrice(null)).toBeUndefined()
    expect(mapGooglePrice('garbage')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — fails**
  Run: `npx vitest run src/trip/placeDetails.test.ts`
  Expected: `mapGooglePrice is not a function`.

- [ ] **Step 3: Implement** — `app/src/trip/placeDetails.ts`

```ts
// app/src/trip/placeDetails.ts
//
// PAID, DORMANT opening-hours + price client: Google Places (proxied).
// POSTs { query?, placeId? } to the `place-details` edge function, which holds
// the key server-side and answers { hours:null, price:null } when the key is
// unset. Never throws; returns null on any miss so chips simply don't show.
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '../lib/supabase'
import type { PriceLevel } from '../types'

/** Deploy slug — must match `supabase functions deploy place-details`. */
const PLACE_DETAILS_FN_SLUG = 'place-details'

const PRICE_MAP: Record<string, PriceLevel> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
}

/** Map Google's raw priceLevel enum to a canonical symbol, or undefined. Pure. */
export function mapGooglePrice(raw: string | null | undefined): PriceLevel | undefined {
  if (typeof raw !== 'string') return undefined
  return PRICE_MAP[raw.trim()]
}

export interface StopPlaceDetails {
  placeId?: string
  hours?: string[]
  price?: PriceLevel
}

function detailsProxyUrl(base = SUPABASE_URL): string {
  return `${base.replace(/\/$/, '')}/functions/v1/${PLACE_DETAILS_FN_SLUG}`
}
async function authToken(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) return data.session.access_token } catch { /* anon */ }
  return SUPABASE_ANON_KEY
}

/**
 * Fetch opening hours + price for a stop via the place-details proxy. Prefers a
 * known `placeId`; falls back to a text `query` ("Name, Destination"). Returns
 * only the fields Google had — `{}` when the key is dormant or nothing matched.
 * Never throws.
 */
export async function fetchPlaceDetails(input: { placeId?: string; query?: string }): Promise<StopPlaceDetails> {
  const placeId = (input.placeId ?? '').trim()
  const query = (input.query ?? '').trim()
  if (!placeId && !query) return {}
  try {
    const res = await fetch(detailsProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await authToken()), apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ placeId: placeId || undefined, query: query || undefined }),
    })
    if (!res.ok) return {}
    const json = await res.json().catch(() => null) as { placeId?: string | null; hours?: string[] | null; price?: string | null } | null
    if (!json) return {}
    const out: StopPlaceDetails = {}
    if (typeof json.placeId === 'string' && json.placeId) out.placeId = json.placeId
    if (Array.isArray(json.hours) && json.hours.length) out.hours = json.hours.map(String)
    const price = mapGooglePrice(json.price)
    if (price) out.price = price
    return out
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: Run — passes**
  Run: `npx vitest run src/trip/placeDetails.test.ts` → green. Then `npx tsc -b` clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/placeDetails.ts app/src/trip/placeDetails.test.ts
git commit -m "feat(places): place-details client + mapGooglePrice (pure, tested)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `stop-hours.ts` — `stopHoursLabel` (pure, tested)

**Files:**
- Create: `app/src/trip/stop-hours.ts`
- Test: `app/src/trip/stop-hours.test.ts`

- [ ] **Step 1: Write the failing test** — `app/src/trip/stop-hours.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { stopHoursLabel } from './stop-hours'

const UNIFORM = [
  'Monday: 9:30 AM – 11:45 PM','Tuesday: 9:30 AM – 11:45 PM','Wednesday: 9:30 AM – 11:45 PM',
  'Thursday: 9:30 AM – 11:45 PM','Friday: 9:30 AM – 11:45 PM','Saturday: 9:30 AM – 11:45 PM',
  'Sunday: 9:30 AM – 11:45 PM',
]
const VARIES = [
  'Monday: 9:00 AM – 5:00 PM','Tuesday: 9:00 AM – 5:00 PM','Wednesday: 9:00 AM – 5:00 PM',
  'Thursday: 9:00 AM – 5:00 PM','Friday: 9:00 AM – 9:00 PM','Saturday: 10:00 AM – 9:00 PM',
  'Sunday: Closed',
]

describe('stopHoursLabel', () => {
  it('returns "" for empty/undefined', () => {
    expect(stopHoursLabel(undefined)).toBe('')
    expect(stopHoursLabel([])).toBe('')
  })
  it('collapses uniform days to "Daily <range>"', () => {
    expect(stopHoursLabel(UNIFORM)).toBe('Daily 9:30 AM–11:45 PM')
  })
  it('shows the scheduled weekday when hours vary and a date is given', () => {
    // 2026-07-03 is a Friday
    expect(stopHoursLabel(VARIES, '2026-07-03')).toBe('Fri 9:00 AM–9:00 PM')
    // 2026-07-05 is a Sunday (Closed)
    expect(stopHoursLabel(VARIES, '2026-07-05')).toBe('Sun Closed')
  })
  it('hides (\"\") when hours vary and there is no date', () => {
    expect(stopHoursLabel(VARIES)).toBe('')
  })
})
```

- [ ] **Step 2: Run — fails**
  Run: `npx vitest run src/trip/stop-hours.test.ts`
  Expected: `stopHoursLabel is not a function`.

- [ ] **Step 3: Implement** — `app/src/trip/stop-hours.ts`

```ts
// app/src/trip/stop-hours.ts
//
// Render Google `regularOpeningHours.weekdayDescriptions` (7 strings like
// "Monday: 9:30 AM – 11:45 PM") into one compact chip label. Pure + tested.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Strip the leading "Weekday: " and normalize the dash/whitespace of the range. */
function rangeOf(line: string): string {
  const after = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line
  return after
    .replace(/\s*[–—-]\s*/g, '–') // any dash w/ spaces -> tight en-dash
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Compact label for a stop's opening hours.
 * - empty/undefined -> ''
 * - all 7 days identical -> "Daily <range>"
 * - varies + ISO `date` (YYYY-MM-DD) -> that weekday only, e.g. "Fri 9:00 AM–9:00 PM"
 * - varies + no date -> '' (hide rather than mislead)
 */
export function stopHoursLabel(hours: string[] | undefined, date?: string): string {
  if (!hours || hours.length === 0) return ''
  const ranges = hours.map(rangeOf)
  const allSame = ranges.every((r) => r === ranges[0])
  if (allSame) return `Daily ${ranges[0]}`

  if (!date) return ''
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const wantedFull = WEEKDAYS[d.getDay()]
  const idx = hours.findIndex((line) => line.trimStart().toLowerCase().startsWith(wantedFull.toLowerCase()))
  if (idx < 0) return ''
  return `${wantedFull.slice(0, 3)} ${ranges[idx]}`
}
```

- [ ] **Step 4: Run — passes**
  Run: `npx vitest run src/trip/stop-hours.test.ts` → `4 passed`. Then `npx tsc -b` clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/stop-hours.ts app/src/trip/stop-hours.test.ts
git commit -m "feat(stop-hours): stopHoursLabel — compact opening-hours chip label

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `icons.tsx` — add `Heart` + `TriangleAlert` re-exports

**Files:**
- Modify: `app/src/trip/icons.tsx`

`Clock` already exists. Add `Heart` (good-for chip) and `TriangleAlert` (overload cue).

- [ ] **Step 1: Implement** — in `app/src/trip/icons.tsx`, add `Heart` and `TriangleAlert` to BOTH the `lucide-react` import list and the re-export block (mirror the existing `Clock` entries at lines ~23 and ~80). Add alphabetically near the existing names:

```ts
  Heart,
  TriangleAlert,
```
(in the import from `lucide-react`, and again in the re-export object.)

- [ ] **Step 2: Verify typecheck** — Run: `npx tsc -b`
  Expected: clean (both names exist in `lucide-react`).

- [ ] **Step 3: Commit**

```bash
git add app/src/trip/icons.tsx
git commit -m "chore(icons): re-export Heart + TriangleAlert

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `StopDetail.tsx` — parallel Places fetch + persist + render chips

**Files:**
- Modify: `app/src/trip/StopDetail.tsx` (`handleGenerate` ~145-160; chip row ~210-228; imports)

- [ ] **Step 1: Add imports** — near the existing `import { generateStopDetail } from './enrich'` (line 4) and the icon imports:

```ts
import { fetchPlaceDetails } from './placeDetails'
import { stopHoursLabel } from './stop-hours'
import { dayDate } from './helpers'
// add Clock, Heart to the existing icon import from './icons'
```

- [ ] **Step 2: Fetch Places in parallel + persist** — replace the body of `handleGenerate` (the try block around lines 150-151) so the AI enrichment and Places lookup run together and persist in one patch:

```ts
      const destination = destinationOf(trip)
      const [result, details] = await Promise.all([
        generateStopDetail(stop as Stop, trip.title, destination),
        fetchPlaceDetails({
          placeId: stop.placeId,
          query: [stop.name, destination].filter(Boolean).join(', '),
        }),
      ])
      patchStop({
        history: result.history,
        facts: result.facts,
        tips: result.tips,
        notice: result.notice,
        goodFor: result.goodFor || undefined,
        ...(details.hours ? { hours: details.hours } : {}),
        ...(details.price ? { price: details.price } : {}),
        ...(details.placeId && !stop.placeId ? { placeId: details.placeId, placeSource: 'google' as const } : {}),
      })
```

(`patchStop` already clones + `save({ data })`; `destinationOf` is already imported and used at the old line 150.)

- [ ] **Step 3: Render the chips** — in the chip row (after the reservation chips, before the `{meta && …}` line at ~227), add. Compute the label once above the JSX return (near the other derived values) since `dayDate` can be `null`:

```ts
  const hoursLabel = stopHoursLabel(stop.hours, dayDate(trip, day) ?? undefined)
```

```tsx
                {hoursLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-semibold text-muted">
                    <Clock size={12} aria-hidden="true" />
                    {hoursLabel}
                  </span>
                )}
                {stop.price && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-mono font-semibold text-muted"
                    aria-label={`Price level ${stop.price}`}
                  >
                    {stop.price}
                  </span>
                )}
                {stop.goodFor && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-semibold text-muted">
                    <Heart size={12} aria-hidden="true" />
                    {stop.goodFor}
                  </span>
                )}
```

(Confirmed: `helpers.ts:dayDate` returns an ISO `YYYY-MM-DD` string or `null` (null when the trip has no `startDate`). Passing `?? undefined` makes `stopHoursLabel` hide the chip for undated trips with varying hours — correct.)

- [ ] **Step 4: Run the suite + typecheck**
  Run: `npx vitest run src/trip/StopDetail.test.tsx` (if present) and `npm test`; then `npx tsc -b`.
  Expected: green + clean. `generateStopDetail` now returns `goodFor` so the `StopDetailContent` consumer typechecks.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/StopDetail.tsx
git commit -m "feat(stop-detail): hours/price/good-for chips (Places + AI), parallel fetch on generate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `day-utilization.ts` — `dayUtilization` (pure, tested)

**Files:**
- Create: `app/src/trip/day-utilization.ts`
- Test: `app/src/trip/day-utilization.test.ts`

- [ ] **Step 1: Write the failing test** — `app/src/trip/day-utilization.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { dayUtilization, OVERLOAD_MINUTES } from './day-utilization'
import type { Stop } from '../types'

describe('dayUtilization', () => {
  it('sums explicit durations (minutes) and counts stops', () => {
    const stops: Stop[] = [{ name: 'a', duration: 90 }, { name: 'b', duration: 30 }]
    const u = dayUtilization(stops)
    expect(u.stops).toBe(2)
    expect(u.minutes).toBe(120)
    expect(u.hours).toBe(2)
    expect(u.overloaded).toBe(false)
  })
  it('falls back to a per-kind default when duration is missing', () => {
    const u = dayUtilization([{ name: 'm', kind: 'eat' }, { name: 'museum', kind: 'do' }])
    expect(u.minutes).toBeGreaterThan(0) // both contribute their duration.ts default
    expect(u.stops).toBe(2)
  })
  it('flags overloaded past the threshold', () => {
    const stops: Stop[] = Array.from({ length: 8 }, (_, i) => ({ name: `s${i}`, duration: 100 }))
    expect(dayUtilization(stops).minutes).toBe(800)
    expect(dayUtilization(stops).overloaded).toBe(800 > OVERLOAD_MINUTES)
    expect(dayUtilization(stops).overloaded).toBe(true)
  })
  it('handles an empty day', () => {
    expect(dayUtilization([])).toEqual({ stops: 0, minutes: 0, hours: 0, overloaded: false })
  })
})
```

- [ ] **Step 2: Run — fails**
  Run: `npx vitest run src/trip/day-utilization.test.ts`
  Expected: `dayUtilization is not a function`.

- [ ] **Step 3: Implement** — `app/src/trip/day-utilization.ts`

```ts
import type { Stop } from '../types'
import { normalizeDuration, defaultDurationMinutes } from './duration'

/** A day past this many planned minutes is flagged "full". */
export const OVERLOAD_MINUTES = 11 * 60

export interface DayUtilization {
  stops: number
  minutes: number
  hours: number
  overloaded: boolean
}

function stopMinutes(s: Stop): number {
  return normalizeDuration(s.duration) ?? defaultDurationMinutes(s)
}

/** Derived day load: stop count + planned minutes/hours + overloaded flag. Pure. */
export function dayUtilization(stops: readonly Stop[]): DayUtilization {
  const minutes = stops.reduce((sum, s) => sum + stopMinutes(s), 0)
  return {
    stops: stops.length,
    minutes,
    hours: Math.round(minutes / 60),
    overloaded: minutes > OVERLOAD_MINUTES,
  }
}
```

(Confirm `normalizeDuration` + `defaultDurationMinutes` signatures in `app/src/trip/duration.ts` during implementation — `defaultDurationMinutes` takes a `Pick<Stop,'kind'|'type'|'name'>`; a full `Stop` satisfies it.)

- [ ] **Step 4: Run — passes**
  Run: `npx vitest run src/trip/day-utilization.test.ts` → green. Then `npx tsc -b` clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/trip/day-utilization.ts app/src/trip/day-utilization.test.ts
git commit -m "feat(plan): dayUtilization derived helper (reuses duration.ts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `Itinerary.tsx` — render the caption

**Files:**
- Modify: `app/src/trip/Itinerary.tsx` (imports; day-title block ~207-223)

- [ ] **Step 1: Add imports** — near the existing `import { dayCount as countDays, dayLabel, stopCount, isAutoDayTitle } from './helpers'` (line 13) and the icon imports:

```ts
import { dayUtilization } from './day-utilization'
import { dayStops } from './helpers'   // add to the existing helpers import if not already present
// add TriangleAlert to the existing icon import from './icons'
```

- [ ] **Step 2: Compute + render** — inside the `Itinerary` body where `day`/`count` are computed (~41-42), add:

```ts
  const util = dayUtilization(dayStops(trip, day))
```

  Then render the caption directly under the day title block — after the `{dayNote && …}` line (~222), inside the same `<div className="min-w-0">`:

```tsx
                <p
                  className={
                    'mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold ' +
                    (util.overloaded ? 'text-amber-700 dark:text-amber-300' : 'text-muted')
                  }
                >
                  {util.overloaded && <TriangleAlert size={12} aria-label="This day looks full" />}
                  <span>{util.stops} {util.stops === 1 ? 'stop' : 'stops'} · ~{util.hours}h planned</span>
                </p>
```

(If `dayStops` is not exported from `helpers.ts`, use `trip.data?.days?.[day]?.stops ?? []` inline instead.)

- [ ] **Step 3: Run the suite + typecheck**
  Run: `npm test` and `npx tsc -b`.
  Expected: green + clean.

- [ ] **Step 4: Commit**

```bash
git add app/src/trip/Itinerary.tsx
git commit -m "feat(plan): day-utilization caption with subtle overload cue

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Final verification

- [ ] **Full suite green:** `cd app && npm test`
- [ ] **Typecheck clean:** `npx tsc -b`
- [ ] **Build succeeds:** `npm run build` (one pre-existing chunk-size warning is acceptable)
- [ ] **Manual smoke (dev), key dormant:** `npm run dev` → open a stop → "Generate details": history/facts/tips populate, a **good-for** chip appears when the AI returns one; **no hours/price** chips (key unset = correct). Open the Plan day header → the **caption** shows "N stops · ~Hh planned"; build an over-packed day (>11h) → caption flips to amber + alert icon.
- [ ] **Manual smoke (with key, optional):** set `GOOGLE_PLACES_API_KEY`, deploy `place-details`, regenerate a well-known venue (e.g. a museum) → hours chip ("Daily …" or weekday) + price chip ($$) appear.

---

## Definition of done

- [ ] `Stop.hours[]`/`price`/`goodFor` + `PriceLevel` added (additive, back-compat).
- [ ] `place-details` edge function returns Google hours/raw-price; dormant `{null}` without the key; never 500s; reuses `GOOGLE_PLACES_API_KEY`.
- [ ] Client `fetchPlaceDetails` + pure tested `mapGooglePrice`; `stopHoursLabel` pure + tested (uniform / weekday / undated / empty).
- [ ] `StopDetail` fetches Places in parallel with AI on generate, persists once (immutable), and renders hours/price/good-for chips on the kind/reservation row (wrap on mobile).
- [ ] `goodFor` produced by the AI enrichment (prompt + parse), rendered, never fabricated-when-absent.
- [ ] `dayUtilization` pure + tested (reuses `duration.ts`); `Itinerary` caption with subtle overload cue, no persisted data, no layout shift.
- [ ] `npm test` green · `npx tsc -b` clean · `npm run build` succeeds · committed per task with the trailer on branch `tier3-chips-caption`.

---

## Self-review

**Spec coverage:** A (edge fn)→T3; B (client invoker)→T4; C (data model)→T1; D (fetch+persist)→T7; E (goodFor AI)→T2; F (stopHoursLabel)→T5; G (chips render)→T6,T7; H (day-utilization + caption)→T8,T9. Rollout/dormant-key→T3,T10. All covered.

**Placeholder scan:** every code step has full code; the two "confirm during implementation" notes (`dayDate` return type in T7; `dayStops`/`duration.ts` signatures in T8/T9) are explicit verification steps with concrete fallbacks, not deferred work.

**Type consistency:** `PriceLevel` (T1) imported by `placeDetails.ts` (T4) + used on `Stop.price` (T1) + chip (T7). `StopDetailContent.goodFor` (T2) consumed in `handleGenerate` (T7). `StopPlaceDetails {placeId,hours,price}` (T4) consumed in T7. `dayUtilization`/`OVERLOAD_MINUTES` (T8) consumed in T9. `stopHoursLabel(hours,date)` (T5) called in T7. Edge reply `{placeId,displayName,hours,price}` (T3) parsed in T4. Consistent throughout.

**Risk note (resolved):** `dayDate` was verified to return ISO `YYYY-MM-DD | null` — exactly what `stopHoursLabel` consumes; T7 passes `?? undefined`. No open unknowns remain.
