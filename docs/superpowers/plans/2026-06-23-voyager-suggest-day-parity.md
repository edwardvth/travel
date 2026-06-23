# Suggest Day Parity Restoration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Suggest a day" generate a complete, realistic, scheduled day (typically 6–10 stops / ~8–12h, meal-anchored, morning→evening) instead of a thin 4-stop list — by enriching the single `suggestDay` prompt and capturing `time`/`duration`, plus a shared duration helper.

**Architecture:** Spec: `docs/superpowers/specs/2026-06-23-voyager-suggest-day-parity-design.md`. Keep Voyager's single-prompt architecture (`app/src/trip/suggest.ts`). `Stop.time` (string) + `Stop.duration` (number, minutes) already exist — additive, no migration. A new pure `app/src/trip/duration.ts` (`normalizeDuration`, `defaultDurationMinutes`, `ensureDurations`) is shared by this work and the later Tier 2c/Tier 3d. Generation stays creative; Tier 2's deterministic "Optimize this day" re-sequences later. No gap-fill engine, no multi-day optimizer.

**Tech Stack:** Vite + React 18 + TS + Tailwind + Supabase `ai-proxy` (Claude) + vitest

---

## Grounding references (read before starting)

- Spec: `docs/superpowers/specs/2026-06-23-voyager-suggest-day-parity-design.md`.
- Conventions: `CLAUDE.md` (AI calls via `callAI`; pure builders/parsers unit-tested, network is a thin boundary; immutable saves; token theming; commit trailer). `handoff.md` (test count; deploy).
- Current code: `app/src/trip/suggest.ts` (`SuggestContext`, `kindBias`, `buildSuggestPrompt`, `buildSuggestDayPrompt`, `finite`, `str`, `toStop`, `parseSuggestions`, `suggestPlaces`, `suggestDay`) and its test `app/src/trip/suggest.test.ts`. Caller: `app/src/trip/Itinerary.tsx` `handleSuggestDay` (~lines 60–92) — already imports `destinationOf` from `./landmark-context`. Types: `app/src/types.ts` (`Stop.time?: string`, `Stop.duration?: number`, `StopKind`).

## Conventions every task honours

- AI calls go through `callAI`; the **prompt builders + parsers are PURE and unit-tested**; the network call is a thin boundary (not unit-tested, matching the codebase).
- Additive only: we populate existing `Stop.time`/`Stop.duration`; no new persisted fields; back-compat reads intact.
- `cd app && npx tsc -b` clean; `cd app && npm test` green; per task commit with trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Branch `main`.
- TDD rhythm: failing test → run (fail) → minimal impl → run (pass) → `tsc -b` → commit.
- Deploy at the end: `cd app && npm run build` then `npx wrangler deploy` from repo root.

---

## Task 1 — `duration.ts`: `normalizeDuration` + `defaultDurationMinutes` + `ensureDurations`

A pure, shared module. `normalizeDuration` parses an AI duration value (`"90 min"`, `"1h 30m"`, bare number) to whole minutes. `defaultDurationMinutes` mirrors legacy's lookup table for stops the model leaves without one. `ensureDurations` fills a stop list. Reused by Tier 2c (duration suggestions) and Tier 3d (day-utilization).

- [ ] **1.1** Create `app/src/trip/duration.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeDuration, defaultDurationMinutes, ensureDurations } from './duration'
import type { Stop } from '../types'

describe('normalizeDuration', () => {
  it('parses "<n> min" / "<n>m" / minutes words', () => {
    expect(normalizeDuration('90 min')).toBe(90)
    expect(normalizeDuration('45m')).toBe(45)
    expect(normalizeDuration('30 minutes')).toBe(30)
  })
  it('parses hours and hours+minutes', () => {
    expect(normalizeDuration('1h')).toBe(60)
    expect(normalizeDuration('2 hours')).toBe(120)
    expect(normalizeDuration('1h 30m')).toBe(90)
    expect(normalizeDuration('1 hour 30 min')).toBe(90)
    expect(normalizeDuration('1.5h')).toBe(90)
  })
  it('accepts a bare number as minutes', () => {
    expect(normalizeDuration(75)).toBe(75)
    expect(normalizeDuration('60')).toBe(60)
  })
  it('returns undefined for garbage / non-positive', () => {
    expect(normalizeDuration('soon')).toBeUndefined()
    expect(normalizeDuration('')).toBeUndefined()
    expect(normalizeDuration(0)).toBeUndefined()
    expect(normalizeDuration(null)).toBeUndefined()
    expect(normalizeDuration(undefined)).toBeUndefined()
  })
})

describe('defaultDurationMinutes', () => {
  it('reads meal/type cues from type + name', () => {
    expect(defaultDurationMinutes({ name: 'Blue Bottle Coffee', type: 'Cafe' })).toBe(45)
    expect(defaultDurationMinutes({ name: 'Lunch at Z', type: 'Restaurant' })).toBe(75) // "lunch" wins over generic restaurant
    expect(defaultDurationMinutes({ name: 'Osteria', type: 'Restaurant' })).toBe(90)
    expect(defaultDurationMinutes({ name: 'The Louvre', type: 'Museum' })).toBe(90)
    expect(defaultDurationMinutes({ name: 'Opera House', type: 'Theatre' })).toBe(150)
    expect(defaultDurationMinutes({ name: 'Central Park', type: 'Park' })).toBe(60)
    expect(defaultDurationMinutes({ name: 'Riverside walk', type: 'Walking route' })).toBe(30)
  })
  it('falls back to kind, then 60', () => {
    expect(defaultDurationMinutes({ name: 'Somewhere', kind: 'eat' })).toBe(75)
    expect(defaultDurationMinutes({ name: 'Somewhere' })).toBe(60)
  })
})

describe('ensureDurations', () => {
  it('fills only stops missing a duration, immutably', () => {
    const stops: Stop[] = [
      { name: 'Cafe', type: 'Cafe' },
      { name: 'Museum', type: 'Museum', duration: 120 },
    ]
    const out = ensureDurations(stops)
    expect(out[0].duration).toBe(45)
    expect(out[1].duration).toBe(120)
    expect(stops[0].duration).toBeUndefined() // original untouched
  })
})
```

- [ ] **1.2** Run — fails (module missing): `cd app && npx vitest run src/trip/duration.test.ts` → "Cannot find module './duration'".
- [ ] **1.3** Implement `app/src/trip/duration.ts`:

```ts
import type { Stop } from '../types'

/**
 * Parse an AI-supplied duration value into whole minutes, or `undefined`.
 * Accepts `"90 min"`, `"45m"`, `"1h"`, `"1h 30m"`, `"1 hour 30 min"`, `"1.5h"`,
 * `"2 hours"`, a bare `"60"` / `60`. Garbage or non-positive → `undefined`.
 * Pure + unit-tested.
 */
export function normalizeDuration(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined
  }
  if (typeof value !== 'string') return undefined
  const s = value.trim().toLowerCase()
  if (!s) return undefined
  let total = 0
  let matched = false
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/)
  if (h) { total += Math.round(parseFloat(h[1]) * 60); matched = true }
  const m = s.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/)
  if (m) { total += parseInt(m[1], 10); matched = true }
  if (matched) return total > 0 ? total : undefined
  const n = s.match(/^(\d+(?:\.\d+)?)$/)
  if (n) { const v = Math.round(parseFloat(n[1])); return v > 0 ? v : undefined }
  return undefined
}

/**
 * A sensible default visit length (minutes) for a stop with no duration,
 * mirroring legacy travel-guide.ai's lookup table. Keyed off `type` + `name`
 * (meal/landmark cues), then `kind`, else 60. Pure + unit-tested.
 */
export function defaultDurationMinutes(stop: Pick<Stop, 'kind' | 'type' | 'name'>): number {
  const hay = `${stop.type ?? ''} ${stop.name ?? ''}`.toLowerCase()
  if (/breakfast|coffee|caf[eé]|bakery|patisserie|tea ?room|tea salon/.test(hay)) return 45
  if (/lunch|brunch/.test(hay)) return 75
  if (/dinner|restaurant|bistro|brasserie|trattoria|dining|supper/.test(hay)) return 90
  if (/museum|gallery|exhibit/.test(hay)) return 90
  if (/theatre|theater|concert|opera|show/.test(hay)) return 150
  if (/park|garden|botanical/.test(hay)) return 60
  if (/walk|stroll|promenade|trail/.test(hay)) return 30
  if (stop.kind === 'eat') return 75
  return 60
}

/** Fill `duration` (immutably) for any stop missing one. Pure + unit-tested. */
export function ensureDurations(stops: Stop[]): Stop[] {
  return stops.map(s => (s.duration === undefined ? { ...s, duration: defaultDurationMinutes(s) } : s))
}
```

- [ ] **1.4** Run — passes: `cd app && npx vitest run src/trip/duration.test.ts` → `Tests` all passed.
- [ ] **1.5** `cd app && npx tsc -b` clean. Commit: `Suggest-day parity: add shared trip/duration.ts (normalize + defaults + ensure)`.

---

## Task 2 — `suggest.ts` `toStop`: capture `time` + `duration`

The day prompt will now return `time` and `duration`; capture them. `time` is kept as the model's display string (e.g. `"10:00 AM"` → `Stop.time`). `duration` runs through `normalizeDuration` → `Stop.duration` (minutes).

- [ ] **2.1** Add to `app/src/trip/suggest.test.ts` (read the file first; reuse its existing imports of `parseSuggestions`):

```ts
describe('parseSuggestions — time + duration (suggest-day parity)', () => {
  it('captures time (string) and duration (normalized minutes)', () => {
    const stops = parseSuggestions('[{"name":"Cafe","time":"9:00 AM","duration":"45 min"}]')
    expect(stops[0]).toMatchObject({ name: 'Cafe', time: '9:00 AM', duration: 45 })
  })
  it('omits time/duration when absent or unparseable', () => {
    const stops = parseSuggestions('[{"name":"X","duration":"soon"}]')
    expect(stops[0].time).toBeUndefined()
    expect(stops[0].duration).toBeUndefined()
  })
})
```

- [ ] **2.2** Run — fails: `cd app && npx vitest run src/trip/suggest.test.ts` → the new cases fail (`time`/`duration` undefined).
- [ ] **2.3** Edit `app/src/trip/suggest.ts`:
  - Add the import: `import { normalizeDuration } from './duration'` (top of file).
  - In `toStop`, after the `note` block (before the `lat`/`lng` block), insert:

```ts
  const time = str(raw.time)
  if (time) stop.time = time
  const duration = normalizeDuration(raw.duration)
  if (duration !== undefined) stop.duration = duration
```

- [ ] **2.4** Run — passes: `cd app && npx vitest run src/trip/suggest.test.ts` → all green.
- [ ] **2.5** `cd app && npx tsc -b` clean. Commit: `Suggest-day parity: capture time + duration from suggestions (toStop)`.

---

## Task 3 — `suggest.ts`: complete-day prompt + traveler-context hook + 6-result search

Rewrite `buildSuggestDayPrompt` into a complete-day prompt; add `travelerContext?` to `SuggestContext` and fold it into both builders; bump `buildSuggestPrompt` from 5 → 6 results.

- [ ] **3.1** Add to `app/src/trip/suggest.test.ts`:

```ts
describe('buildSuggestDayPrompt — complete-day parity', () => {
  it('asks for a full, multi-stop day with meal anchors, time + duration', () => {
    const p = buildSuggestDayPrompt({ tripTitle: 'Rome', near: 'Rome, Italy' })
    expect(p).toMatch(/complete|full/i)
    expect(p).toMatch(/6.?10|6 to 10|6–10/) // density target present
    expect(p.toLowerCase()).toContain('breakfast')
    expect(p.toLowerCase()).toContain('lunch')
    expect(p.toLowerCase()).toContain('dinner')
    expect(p).toContain('"time"')
    expect(p).toContain('"duration"')
    expect(p).toContain('Rome, Italy')
  })
  it('folds traveler context when supplied, omits it otherwise', () => {
    expect(buildSuggestDayPrompt({ travelerContext: 'vegetarian, slow pace' })).toContain('vegetarian, slow pace')
    expect(buildSuggestDayPrompt({})).not.toMatch(/Traveller context/i)
  })
})

describe('buildSuggestPrompt — 6 results', () => {
  it('asks for 6 places', () => {
    expect(buildSuggestPrompt('coffee', {})).toMatch(/\b6\b/)
  })
})
```

- [ ] **3.2** Run — fails: `cd app && npx vitest run src/trip/suggest.test.ts` → new cases fail.
- [ ] **3.3** Edit `app/src/trip/suggest.ts`:
  - Extend the interface:

```ts
export interface SuggestContext {
  tripTitle?: string
  /** Optional locality hint (e.g. a city / area) to anchor the search. */
  near?: string
  /** Bias the search toward a category (do = sights, eat = food, stay = lodging). */
  kind?: StopKind
  /** Optional free-text traveller context (group, pace, diet) folded into the prompt. */
  travelerContext?: string
}
```

  - Add a small helper near `kindBias`:

```ts
/** A trailing line that folds traveller context into a prompt, or '' when absent. */
function travelerLine(ctx: SuggestContext): string {
  const t = ctx.travelerContext?.trim()
  return t ? `\n\nTraveller context — tailor the pace, food picks and choices to this group: ${t}` : ''
}
```

  - Replace `buildSuggestDayPrompt` entirely with:

```ts
/**
 * Build the "suggest a whole day" prompt — a COMPLETE, realistic day (a full
 * morning→evening arc with real meal stops, typically 6–10 stops / ~8–12h,
 * adaptive), each stop carrying a time-of-day and a duration. Restores the
 * density of the legacy travel-guide.ai planner in Voyager's single-prompt
 * architecture. Same JSON shape as `buildSuggestPrompt` (plus time/duration) so
 * `parseSuggestions` is reused.
 */
export function buildSuggestDayPrompt(ctx: SuggestContext): string {
  const where = [ctx.near, ctx.tripTitle].filter(Boolean).join(' — ')
  const locationCtx = where ? ` in the destination for this trip: "${where}"` : ''
  return `You are an expert local trip planner. Plan ONE complete, realistic day${locationCtx} — a full morning-to-evening itinerary the way a great local would actually spend the day, not a short list of attractions.

Build a full day, typically 6–10 stops and roughly 8–12 hours, adapting to the destination and pace (a major city packs more in than a quiet town). Follow a natural arc with real meal stops:
- a morning coffee or breakfast (around 8–9:30am)
- a morning highlight
- lunch (around 12–1:30pm)
- one or two afternoon stops
- an optional afternoon break or coffee
- dinner (around 7–8:30pm)
- an optional evening pick (a bar, viewpoint, show or stroll)

Keep it geographically coherent so the day flows (cluster nearby places; avoid backtracking). Favour genuinely notable, characterful places — a mix of marquee sights and insider spots — over generic tourist traps. Order the stops as someone would actually visit them, and give each a realistic time-of-day and how long to spend.${travelerLine(ctx)}

Use real places that genuinely exist, with accurate coordinates when you are confident. Prefer to omit lat/lng (leave them out) rather than invent inaccurate coordinates.

Respond with ONLY a JSON array — no markdown, no code fences, no preamble:
[{"name":"...","type":"e.g. Cafe / Museum / Restaurant / Park","address":"street, city","lat":0.0,"lng":0.0,"time":"9:00 AM","duration":"45 min","note":"1 short sentence on why it's worth it / what to do here"}]`
}
```

  - In `buildSuggestPrompt`, change `Suggest 5 excellent` → `Suggest 6 excellent`, and append the traveller line: after the existing `${biasLine}` interpolation, add `${travelerLine(ctx)}` in the same position the day prompt uses it (before the "Use real places" paragraph). (Read the current function and insert `travelerLine(ctx)` so it reads naturally.)

- [ ] **3.4** Run — passes: `cd app && npx vitest run src/trip/suggest.test.ts` → all green (existing parse/prompt tests unaffected; if a prior test asserted the literal "5", update it to "6").
- [ ] **3.5** `cd app && npx tsc -b` clean. Commit: `Suggest-day parity: complete-day prompt + traveler-context hook + 6-result search`.

---

## Task 4 — `suggest.ts`: `suggestDay` budget + guaranteed durations

Bump `suggestDay` to 4000 tokens (a fuller day needs room) and guarantee every returned stop has a duration via `ensureDurations` (so Tier 3's utilization + Tier 2's optimize always have a number).

- [ ] **4.1** Add to `app/src/trip/suggest.test.ts` (pure-helper coverage; the network call itself stays untested):

```ts
import { ensureDurations } from './duration'
describe('suggestDay duration guarantee (via ensureDurations)', () => {
  it('every stop has a duration after ensureDurations', () => {
    const filled = ensureDurations(parseSuggestions('[{"name":"Cafe","type":"Cafe"},{"name":"X","duration":"90 min"}]'))
    expect(filled.every(s => typeof s.duration === 'number')).toBe(true)
    expect(filled[0].duration).toBe(45)
    expect(filled[1].duration).toBe(90)
  })
})
```

- [ ] **4.2** Run — passes immediately (helpers exist) but documents intent: `cd app && npx vitest run src/trip/suggest.test.ts`.
- [ ] **4.3** Edit `app/src/trip/suggest.ts`:
  - Add import: `import { normalizeDuration, ensureDurations } from './duration'` (merge with the Task-2 import — single import line).
  - Replace `suggestDay`:

```ts
/** Suggest a complete, scheduled day (6–10 stops), durations guaranteed. */
export async function suggestDay(ctx: SuggestContext): Promise<Stop[]> {
  const text = await callAI(textMessage(buildSuggestDayPrompt(ctx)), { maxTokens: 4000 })
  return ensureDurations(parseSuggestions(text))
}
```

- [ ] **4.4** Run the suite — green: `cd app && npm test`.
- [ ] **4.5** `cd app && npx tsc -b` clean. Commit: `Suggest-day parity: suggestDay 4000-token budget + guaranteed durations`.

---

## Task 5 — Wire `Itinerary.handleSuggestDay` to anchor + tailor

Pass the destination (`near`) and any traveller context (read opportunistically from `trip.config` via its index signature — no `TripConfig` change here; the typed field + UI are Tier 2d).

- [ ] **5.1** Edit `app/src/trip/Itinerary.tsx` `handleSuggestDay` — replace the `suggestDay({ tripTitle: trip.title })` call with:

```ts
      const stops = await suggestDay({
        tripTitle: trip.title,
        near: destinationOf(trip),
        travelerContext:
          typeof trip.config?.travelerContext === 'string' ? trip.config.travelerContext : undefined,
      })
```

  (`destinationOf` is already imported from `./landmark-context`. `trip.config` carries an index signature, so `trip.config?.travelerContext` reads as `unknown` and the `typeof` guard narrows it — no type error, no field added.)

- [ ] **5.2** `cd app && npx tsc -b` clean; `cd app && npm test` green. Commit: `Suggest-day parity: anchor suggestDay to destination + traveler context`.

---

## Final verification + deploy

- [ ] Full suite green: `cd app && npm test`.
- [ ] Typecheck clean: `cd app && npx tsc -b`.
- [ ] Build: `cd app && npm run build` (one pre-existing chunk warning is fine).
- [ ] **Manual smoke (AI live):** "Suggest a day for me" on an empty day → a **full, scheduled day** (~6–10 stops) with a coffee/breakfast → … → dinner arc, each stop showing a time + sensible duration, geographically coherent. Re-run a few times for different destinations (a big city vs a small town) to confirm density adapts.
- [ ] Deploy: `cd app && npm run build` then `npx wrangler deploy` from repo root; smoke routes 200.
- [ ] Update `handoff.md` (Shipped & live) with the Suggest-Day-Parity entry.

## Definition of done

- [ ] **Suite green / tsc clean / build ok / deployed.**
- [ ] **`suggestDay` produces a complete day** — complete-day prompt (6–10 stops, meal anchors, morning→evening, geographic coherence, notable-not-touristy), 4000-token budget.
- [ ] **Stops arrive scheduled** — `time` + `duration` captured from the model (`toStop` + `normalizeDuration`); every stop has a duration (`ensureDurations` + `defaultDurationMinutes`).
- [ ] **Shared duration helper** — `trip/duration.ts` exists and is the single source for Tier 2c + Tier 3d.
- [ ] **Traveler-context hook** — both builders fold `ctx.travelerContext` when present; the caller reads `trip.config.travelerContext` opportunistically (typed field + UI remain Tier 2d).
- [ ] **6-result search** — `buildSuggestPrompt` asks for 6.
- [ ] **Additive / back-compat** — only existing `Stop.time`/`Stop.duration` populated; no migration; older stops still parse.
- [ ] **Conventions** — pure builders/parsers unit-tested, network a thin boundary; commit-per-task with the Co-Authored-By trailer on `main`.

## Writing-plans self-review

- **Spec coverage:** complete-day prompt → Task 3; time/duration capture → Task 2; shared duration helper → Task 1; token bump + guaranteed durations → Task 4; traveler-context hook + caller → Tasks 3 & 5; 6-result search → Task 3. ✔
- **No placeholders:** every code block is real, compilable TS with exact paths + exact `cd app && npx vitest run <file>` commands. ✔
- **Type consistency:** `normalizeDuration`/`defaultDurationMinutes`/`ensureDurations` signatures match across `duration.ts`, `suggest.ts`, and the tests; `SuggestContext.travelerContext?: string`; `Stop.time`/`Stop.duration` already exist. No `TripConfig` change (read via index signature). ✔
- **Out-of-scope guard:** no gap-fill, no multi-day optimize, no magic tour; `hours`/`price`/`goodFor` stay Tier 3b; the typed `TripConfig.travelerContext` + UI stay Tier 2d. ✔
