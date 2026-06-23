# Tier 3 — Stop Content & Day Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Tier 3 gaps from the Plan-parity design (`docs/superpowers/specs/2026-06-22-voyager-plan-parity-design.md`, §"Tier 3 — Stop content & day structure"): (a) fix the AI enrichment richness regression and the `facts[]`/`notice` field-duplication display bug so **Plan `StopDetail` and Guide `StoryTabs` render the same content**; (b) add richer enrichment fields (`hours` / `price` enum / `goodFor`) as compact chips; (c) add a per-stop hourly weather strip; (d) add a derived day-utilization summary; (e) make `DayRail` edit-gated editable (add / remove / reorder days, edit title + note) **without breaking the four Day-Reorder Invariants**.

**Architecture:** The stop is the atomic object; Plan and Guide are read/write projections over one `data`. `enrich.ts` is **shared** by both surfaces, so the enrichment fix lands in both at once. All saves are immutable via the lifted `save({ data })` from `PlannerOutletContext` (clone, never mutate cache); every write is `canEdit`-gated; all new JSONB fields are additive and read legacy fields back-compat (`stop.notice`, `stop.booking`, string `hotel`, missing `config`). Pure logic (parsing, normalization, remappers, utilization sum) is unit-tested in vitest; UI gets a render check. Per-day dates derive **by position** from `config.startDate` (`helpers.ts:dayDate`), so day reorder changes which date a position maps to — the weather cache key is therefore keyed by **coord + date**, never day index (already true in `useWeather.ts:36`; we add an explicit guard test).

**Tech Stack:** Vite + React 18 + TS + Tailwind + Open-Meteo + @dnd-kit + vitest

---

## Grounding (read before starting; exact refs used by the tasks)

- **Conventions:** `CLAUDE.md` (immutable saves §"Working conventions"; anti-slop §"Design system"; data shapes §"Data shapes"), `handoff.md` (state; **526 tests** green baseline; deploy steps).
- **Spec:** `docs/superpowers/specs/2026-06-22-voyager-plan-parity-design.md` — Tier 3 (§3a–3e), Data model (line 224), Testing (line 235), Day Reorder Invariants (line 209).
- **Enrichment generator (shared):** `app/src/trip/enrich.ts` — `StopDetailContent` (lines 6–11), `buildEnrichPrompt` (73–110, source-block "treat as authoritative" at 91, "GROUNDING RULES" at 102–105, JSON template at 109), `parseStopDetail` (133–158), `generateStopDetail` (176–193, `maxTokens: 700` at **line 185**).
- **Enrichment tests:** `app/src/trip/enrich.test.ts` (parse/prompt/generate suites; `notice` suite at 243–252).
- **Plan render:** `app/src/trip/StopDetail.tsx` — renders `history`/`facts[]`/`tips` (304–368); does **not** render `notice`; Navigate button + static-map peek (225–254) are Tier 1's concern, untouched here; chips would mount near the meta row (195–213). `handleGenerate` patches `{history,facts,tips,notice}` (134).
- **Guide render:** `app/src/trip/guide/StoryTabs.tsx` — three tabs `story`/`notice`/`experience` (lines 5, 11–15, 42); body via `renderProse`. The `notice` **prop** is derived in `app/src/trip/Guide.tsx` at **line 394** (`const notice = stop?.notice ?? ''`) and peek/prev sites (**751, 777**), and in `app/src/trip/guide/ArrivalView.tsx` (passed from Guide line 674). `CurrentStopCard.tsx` only forwards the prop (line 256).
- **AI:** `app/src/trip/ai.ts` — `DEFAULT_MODEL = 'claude-sonnet-4-6'` (13), `DEFAULT_MAX_TOKENS = 1024` (14); `enrich.ts` doesn't override the model (keeps Sonnet).
- **Weather:** `app/src/trip/WeatherGlance.tsx` (per-day, `anchorCoords` 6–17), `app/src/trip/useWeather.ts` (`queryKey: ['weather', lat, lng, date]` at 36 — coord+date keyed). Per-stop **hourly** is new.
- **Day rail:** `app/src/trip/DayRail.tsx` (READ-ONLY today — chips only).
- **Remappers:** `app/src/trip/itinerary-helpers.ts` — `moveItem` (15–23), `remapCompletedAfterReorder` (31–53), `remapCompletedAfterDelete` (60–78); keys are `"<day>-<stop>"` (`helpers.ts:completedKey`). We mirror these at the **day** level.
- **Selected-day:** `app/src/trip/PlannerLayout.tsx` — `activeDay` from `?day=N`, clamped (124–145); `setActiveDay` (132).
- **Helpers:** `app/src/trip/helpers.ts` — `dayDate` (40–53), `formatDayDate` (59–68), `dayLabel` (30–33), `stopCount` (25–27).
- **Types:** `app/src/types.ts` — `Stop` (4–37, already has `duration?`, `facts?`, `notice?`), `Day` (38, has `title`/`note`), `TripConfig` (50–68), `TripData` (69–74, `completed: string[]`).
- **Prose render:** `app/src/trip/richtext.ts` — `renderProse` (62–81), `formatInline` (16–30).

**Baseline check before task 1** (must be green):
```
cd app && npm test
```
Expected: `Test Files … passed`, **526 tests passing** (per `handoff.md`). Then `cd app && npx tsc -b` clean.

---

## Field-naming contract (single source of truth — keep consistent across ALL tasks)

| Concept | Canonical field | Type | Notes |
|---|---|---|---|
| Story | `history` | `string` | unchanged |
| Interesting Facts | **`facts`** | `string[]` | the ONE canonical facts field; rendered identically in Plan + Guide |
| Interesting Facts (legacy) | `notice` | `string` | **deprecated**: still *read* for back-compat when `facts` is empty; **never written** by new code; **dropped from the prompt + generated shape** |
| Experience / tips | `tips` | `string` | unchanged |
| Opening hours | `hours` | `string?` | additive, optional |
| Price level | `price` | `'$' \| '$$' \| '$$$' \| '$$$$'` `?` | **normalized enum** (see task 2) |
| Good-for tag | `goodFor` | `string?` | additive, optional |

`StopDetailContent` after task 2 (drop `notice` from the *generated* shape; add the three optional fields):
```ts
export interface StopDetailContent {
  history: string
  facts: string[]
  tips: string
  hours?: string
  price?: '$' | '$$' | '$$$' | '$$$$'
  goodFor?: string
}
```
`Stop.notice?` **stays in `types.ts`** (read-only back-compat); `parseStopDetail` no longer emits it.

---

## Task 1 — `types.ts`: additive Stop fields incl. the price enum

**Files:** `app/src/types.ts`, `app/src/types.test.ts` (create if absent).

This is a type-only change; the "test" is a compile-time assertion file that fails to typecheck if the shape is wrong, plus a trivial runtime assertion so vitest has something to run.

- [ ] **Write the failing test** `app/src/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import type { Stop, PriceLevel } from './types'

describe('Stop additive Tier-3 fields', () => {
  it('accepts hours / price enum / goodFor and keeps notice readable', () => {
    const s: Stop = {
      name: 'X',
      hours: 'Daily 9:00–17:00',
      price: '$$',
      goodFor: 'Architecture lovers',
      notice: 'legacy facts string', // still readable (back-compat)
      facts: ['a', 'b'],
    }
    expect(s.price).toBe('$$')
    const p: PriceLevel = '$$$$'
    expect(p).toBe('$$$$')
  })
})
```
- [ ] **Run — fails** (`PriceLevel`/`hours`/`price`/`goodFor` don't exist yet):
```
cd app && npx vitest run src/types.test.ts
```
Expected: TS error / red — `Module '"./types"' has no exported member 'PriceLevel'` and `Object literal may only specify known properties`.
- [ ] **Implement** in `app/src/types.ts`: export the enum alias and add the fields to `Stop` (keep `notice?` exactly as is):
```ts
/** Canonical normalized price level for a stop (rendered as a chip). */
export type PriceLevel = '$' | '$$' | '$$$' | '$$$$'
```
Add inside `interface Stop` (near `duration?`):
```ts
  /** Opening hours, free text (additive, optional). e.g. "Daily 9:00–17:00". */
  hours?: string
  /** Normalized price level (see PriceLevel). Additive, optional. */
  price?: PriceLevel
  /** Audience/occasion tag, e.g. "Romantic dinner". Additive, optional. */
  goodFor?: string
```
Update the existing `notice?` doc comment to mark it deprecated: `/** @deprecated Legacy Interesting-Facts string. Read-only back-compat; superseded by facts[]. Never written by new code. */`
- [ ] **Run — passes** (same command). Expected: `1 passed`. Then `cd app && npx tsc -b` clean.
- [ ] **Commit:** `feat(types): add Stop.hours/price(enum)/goodFor; deprecate notice` with the Co-Authored-By trailer.

---

## Task 2 — `enrich.ts`: prompt rewrite, `maxTokens` 2000, grounding reframe, price normalization, drop `notice` from generated shape

**Files:** `app/src/trip/enrich.ts`, `app/src/trip/enrich.test.ts`.

This is the highest-ROI task (spec §3a diagnosis: token budget slashed, "leave empty" instruction, Wikipedia as a gate, and the `facts[]`/`notice` duplication). Several behavioral changes land together; write all the failing tests first, then implement.

### 2.1 — `normalizePrice` (new pure export)

- [ ] **Write the failing test** — add to `enrich.test.ts`:
```ts
import { normalizePrice } from './enrich'

describe('normalizePrice', () => {
  it('passes through canonical symbols', () => {
    expect(normalizePrice('$')).toBe('$')
    expect(normalizePrice('$$')).toBe('$$')
    expect(normalizePrice('$$$')).toBe('$$$')
    expect(normalizePrice('$$$$')).toBe('$$$$')
  })
  it('maps common words to symbols (case/space-insensitive)', () => {
    expect(normalizePrice('cheap')).toBe('$')
    expect(normalizePrice('Budget')).toBe('$')
    expect(normalizePrice('moderate')).toBe('$$')
    expect(normalizePrice(' Expensive ')).toBe('$$$$')
    expect(normalizePrice('luxury')).toBe('$$$$')
  })
  it('returns undefined for unmappable / empty', () => {
    expect(normalizePrice('')).toBeUndefined()
    expect(normalizePrice('pricey-ish')).toBeUndefined()
    expect(normalizePrice(undefined)).toBeUndefined()
    expect(normalizePrice(42)).toBeUndefined()
  })
})
```
- [ ] **Run — fails:** `cd app && npx vitest run src/trip/enrich.test.ts` → `normalizePrice is not a function`.
- [ ] **Implement** in `enrich.ts`:
```ts
import type { PriceLevel } from '../types'

const PRICE_WORDS: Record<string, PriceLevel> = {
  cheap: '$', budget: '$', inexpensive: '$',
  moderate: '$$', mid: '$$', midrange: '$$',
  pricey: '$$$', upscale: '$$$',
  expensive: '$$$$', luxury: '$$$$', splurge: '$$$$',
}

/** Normalize a raw price value to a canonical PriceLevel, or undefined if unmappable. Pure + unit-tested. */
export function normalizePrice(value: unknown): PriceLevel | undefined {
  if (typeof value !== 'string') return undefined
  const s = value.trim()
  if (/^\${1,4}$/.test(s)) return s as PriceLevel
  return PRICE_WORDS[s.toLowerCase().replace(/[\s_-]+/g, '')]
}
```
- [ ] **Run — passes** (same command).

### 2.2 — `parseStopDetail` emits `hours`/`price`/`goodFor`, drops `notice`

- [ ] **Update the existing `parseStopDetail` tests** in `enrich.test.ts` — the shape no longer carries `notice`. Change the `parseStopDetail` suite expectations from e.g. `{ history, facts, tips, notice: '' }` to `{ history, facts, tips }`, and the empty fallback `{ history: '', facts: [], tips: '' }`. **Delete the `describe('parseStopDetail notice', …)` block (lines 243–252)** — `notice` is no longer parsed. Add new cases:
```ts
describe('parseStopDetail richer fields', () => {
  it('parses hours / normalized price / goodFor', () => {
    const out = parseStopDetail('{"history":"h","facts":["f"],"tips":"t","hours":"Daily 9-5","price":"moderate","goodFor":"Foodies"}')
    expect(out.hours).toBe('Daily 9-5')
    expect(out.price).toBe('$$')      // normalized from "moderate"
    expect(out.goodFor).toBe('Foodies')
  })
  it('drops an unmappable price to undefined', () => {
    const out = parseStopDetail('{"history":"h","price":"whatever"}')
    expect(out.price).toBeUndefined()
  })
  it('omits richer fields when absent', () => {
    const out = parseStopDetail('{"history":"h"}')
    expect(out.hours).toBeUndefined()
    expect(out.price).toBeUndefined()
    expect(out.goodFor).toBeUndefined()
    expect('notice' in out).toBe(false) // notice no longer in the generated shape
  })
})
```
- [ ] **Run — fails** (still returns `notice`, no richer fields).
- [ ] **Implement:** change `StopDetailContent` to the shape in the contract above (drop `notice`, add optional `hours`/`price`/`goodFor`). Rewrite `parseStopDetail`:
```ts
export function parseStopDetail(text: string): StopDetailContent {
  const fallback: StopDetailContent = { history: '', facts: [], tips: '' }
  const raw = (text || '').trim()
  if (!raw) return fallback

  let candidate = raw.replace(/```json|```/g, '').trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    candidate = candidate.slice(start, end + 1)
    try {
      const info = JSON.parse(candidate) as Record<string, unknown>
      const out: StopDetailContent = {
        history: typeof info.history === 'string' ? info.history.trim() : '',
        facts: coerceFacts(info.facts),
        tips: typeof info.tips === 'string' ? info.tips.trim() : '',
      }
      const hours = typeof info.hours === 'string' ? info.hours.trim() : ''
      if (hours) out.hours = hours
      const price = normalizePrice(info.price)
      if (price) out.price = price
      const goodFor = typeof info.goodFor === 'string' ? info.goodFor.trim() : ''
      if (goodFor) out.goodFor = goodFor
      return out
    } catch {
      /* fall through */
    }
  }
  return { history: raw, facts: [], tips: '' }
}
```
Also update the `coerceFacts` JSDoc/return path is unchanged. Update `generateStopDetail`'s `empty` const to `{ history: '', facts: [], tips: '' }` and its fallback returns accordingly (the AI-fail Wikipedia fallback becomes `{ ...empty, history: cleaned }`).
- [ ] **Run — passes.**

### 2.3 — prompt: drop `notice`, reframe Wikipedia, rewrite grounding, ask for richer fields

- [ ] **Update `buildEnrichPrompt` tests.** In the existing suite, the assertions `expect(p).toContain('notice')` (lines ~105 and ~106 in the `'prompt includes the destination/city…'` test) must be **removed/replaced** — the prompt no longer mentions `notice`. Update the `'forbids inventing specifics and demands empty sections when unsupported'` test (116–120): the prompt no longer demands empty sections, so assert the new rule instead:
```ts
it('forbids inventing specifics but asks for useful content in every section', () => {
  const p = buildEnrichPrompt(base, 'London Trip')
  expect(p).toMatch(/never (invent|fabricate)/i)
  expect(p).toMatch(/always write something useful/i)
  expect(p).not.toMatch(/EMPTY string/)        // old "leave empty" rule gone
})
it('frames Wikipedia as background, not an authoritative gate', () => {
  const p = buildEnrichPrompt(base, 'London Trip', '', { source: 'Founded 1066.' })
  expect(p).toContain('Founded 1066.')
  expect(p).toMatch(/background/i)
  expect(p).not.toMatch(/authoritative/i)
})
it('asks for the richer fields in the JSON schema', () => {
  const p = buildEnrichPrompt(base, 'London Trip')
  expect(p).toContain('"hours"')
  expect(p).toContain('"price"')
  expect(p).toContain('"goodFor"')
  expect(p).not.toContain('"notice"')
})
```
Keep the existing positive assertions for name / `London Trip` / `ONLY valid JSON` / `"facts"` / Story / Interesting Facts / Experience / coordinate guard.
- [ ] **Run — fails.**
- [ ] **Implement** in `buildEnrichPrompt`: change `sourceBlock` framing, the section list (drop the `notice` line; fold Interesting Facts onto `facts`), the GROUNDING RULES, and the JSON template:
  - `sourceBlock`:
```ts
const sourceBlock = source
  ? `\n\nBACKGROUND (from Wikipedia — helpful context, not the only source; combine it with your own well-established knowledge):\n"""\n${source}\n"""`
  : ''
```
  - Section list (replace lines 97–100):
```
Write content for this place:
- "history" = Story: why this place matters — its significance, character, and the story behind it (2-3 short plain-text paragraphs).
- "facts" = Interesting Facts: an array of ~4 short, true facts — trivia, dates, architecture, little-known details a curious traveller would enjoy.
- "tips" = Experience: how to actually experience it — what to do, see, or look for in front of you.
- "hours" = typical opening hours if well-known (e.g. "Daily 9:00-17:00"), else omit.
- "price" = one of "$", "$$", "$$$", "$$$$" if a typical price level is well-known, else omit.
- "goodFor" = a short audience/occasion tag (e.g. "Architecture lovers", "Romantic dinner"), else omit.
```
  - GROUNDING RULES (replace 102–105):
```
GROUNDING RULES (accuracy first, but always useful):
- Always write something useful for every section. When you are less certain, keep it shorter and stick to what's well-established about this exact place.
- Never invent specific dates, names, or numbers. If you don't know a specific, write the well-established general truth instead of a guess — never fabricate.
- For "hours", "price", and "goodFor": include only when well-established; otherwise omit the key. Never fabricate a value to fill them.
```
  - JSON template (replace line 109) — **no `notice`**:
```
{"history":"Story — plain-text paragraphs separated by \\n\\n.","facts":["fact with a date/number","little-known detail","another fact","one more"],"tips":"Experience — how to experience it.","hours":"Daily 9:00-17:00","price":"$$","goodFor":"Architecture lovers"}
```
  Update the function's JSDoc to match (background not gate; richer fields; no `notice`).
- [ ] **Run — passes.**

### 2.4 — `maxTokens` 700 → 2000, keep Sonnet

- [ ] **Add the test** to the `generateStopDetail` suite:
```ts
it('requests a generous token budget so long content is not truncated', async () => {
  fetchWikiExtractMock.mockResolvedValue(null)
  callAIMock.mockResolvedValue('{"history":"H","facts":[],"tips":""}')
  await generateStopDetail(stop, 'London Trip', 'London')
  const opts = callAIMock.mock.calls[0][1]
  expect(opts?.maxTokens).toBe(2000)
  expect(opts?.model).toBeUndefined() // keeps Sonnet default (no override)
})
```
- [ ] **Update the existing `generateStopDetail` mocks** that return `…,"notice":"",…` — drop `notice` from those JSON strings (it's harmless but the shape no longer carries it; the assertions `expect(out.notice)…` at the AI-fail test must be removed). The all-empty assertion becomes `expect(out).toEqual({ history: '', facts: [], tips: '' })`.
- [ ] **Run — fails** (still 700).
- [ ] **Implement:** `enrich.ts:185` → `await callAI(textMessage(prompt), { maxTokens: 2000 })`.
- [ ] **Run — passes:** `cd app && npx vitest run src/trip/enrich.test.ts`. Expected: all enrich suites green.
- [ ] **Fix call-sites that read `result.notice`:** `StopDetail.tsx:134` and `Guide.tsx:341` patch `{ …, notice: result.notice }`. Since `result` no longer has `notice`, drop `notice: result.notice` from both patches (they keep `history`/`facts`/`tips`, and gain the richer fields in task 3). Add `hours: result.hours, price: result.price, goodFor: result.goodFor` to the `StopDetail.tsx` patch now (Guide doesn't render chips, but include them too for data parity). `cd app && npx tsc -b` must be clean.
- [ ] **Commit:** `fix(enrich): richer non-empty prompt, 2000 tokens, price enum, drop notice from shape`.

---

## Task 3 — `StopDetail.tsx`: render `facts[]` (back-compat) + hours/price/goodFor chips

**Files:** `app/src/trip/enrich.ts` (add a shared `factsList` helper), `app/src/trip/StopDetail.tsx`, `app/src/trip/StopDetail.test.tsx` (create if absent).

`StopDetail` already renders `facts[]` (329–353). The change: (a) when `facts` is empty, **fall back to the legacy `notice` string** so already-enriched stops keep content; (b) add a compact metadata chip row for `hours` / `price` / `goodFor`.

### 3.1 — shared `factsList(stop)` back-compat helper

- [ ] **Write the failing test** in `enrich.test.ts`:
```ts
import { factsList } from './enrich'

describe('factsList (facts[] with notice back-compat)', () => {
  it('returns facts[] when present', () => {
    expect(factsList({ name: 'X', facts: ['a', 'b'], notice: 'legacy' })).toEqual(['a', 'b'])
  })
  it('falls back to splitting legacy notice when facts is empty', () => {
    expect(factsList({ name: 'X', facts: [], notice: 'One fact. Another.' })).toEqual(['One fact. Another.'])
  })
  it('returns [] when neither is present', () => {
    expect(factsList({ name: 'X' })).toEqual([])
  })
})
```
- [ ] **Run — fails.**
- [ ] **Implement** in `enrich.ts` (reuses `coerceFacts`):
```ts
import type { Stop } from '../types'
/** The canonical Interesting-Facts list for a stop: facts[] if present, else the legacy notice string (back-compat). Pure. */
export function factsList(stop: Pick<Stop, 'facts' | 'notice'>): string[] {
  if (stop.facts && stop.facts.length) return stop.facts
  return coerceFacts(stop.notice)
}
```
- [ ] **Run — passes.**

### 3.2 — render chips + use `factsList`

- [ ] **Write the failing render test** `app/src/trip/StopDetail.test.tsx`. Render `StopDetail` inside a `MemoryRouter` with an outlet context stub (mirror existing component tests; mock `generateStopDetail`). Two cases:
```ts
it('renders facts from the legacy notice string when facts[] is empty', () => {
  // stop: { name, notice: 'Legacy fact one. Legacy fact two.' }, no facts
  expect(screen.getByText(/Legacy fact one/)).toBeInTheDocument()
})
it('renders hours / price / goodFor chips when present', () => {
  // stop: { name, hours: 'Daily 9-5', price: '$$', goodFor: 'Foodies' }
  expect(screen.getByText('Daily 9-5')).toBeInTheDocument()
  expect(screen.getByText('$$')).toBeInTheDocument()
  expect(screen.getByText('Foodies')).toBeInTheDocument()
})
```
(If wiring a full `useOutletContext` stub is heavy, factor the chip row + facts section into a small pure presentational component — e.g. `StopMeta({ stop })` and reuse `factsList` — and test that component directly. Prefer the pure-component split; it's the anti-slop-friendly, testable shape.)
- [ ] **Run — fails.**
- [ ] **Implement** in `StopDetail.tsx`:
  - Replace the facts source: change `hasContent` to also consider the legacy notice via `factsList`, and render `factsList(stop)` instead of `stop.facts ?? []` in the Interesting-facts `<ul>` (329–353). Update the section guard to `(generating || factsList(stop).length > 0)`.
  - Add a chip row under the meta line (near 213), edit-gate-agnostic (read-only display), lucide icons + token classes, ≥ no interactive target needed (static chips), `aria-label`s:
```tsx
{(stop.hours || stop.price || stop.goodFor) && (
  <div className="flex flex-wrap items-center gap-1.5 mt-2" aria-label="Stop details">
    {stop.hours && (
      <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-semibold text-muted">
        <Clock size={12} aria-hidden="true" />{stop.hours}
      </span>
    )}
    {stop.price && (
      <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-semibold text-muted" aria-label={`Price level ${stop.price}`}>
        {stop.price}
      </span>
    )}
    {stop.goodFor && (
      <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-semibold text-muted">
        <Heart size={12} aria-hidden="true" />{stop.goodFor}
      </span>
    )}
  </div>
)}
```
  - Import `Clock` and `Heart` from `./icons` (add re-exports there if missing — central lucide re-export file).
- [ ] **Run — passes:** `cd app && npx vitest run src/trip/StopDetail.test.tsx src/trip/enrich.test.ts`. Then `cd app && npx tsc -b` clean.
- [ ] **Commit:** `feat(stop-detail): render facts[] with notice back-compat + hours/price/goodFor chips`.

---

## Task 4 — Guide `StoryTabs`: render `facts[]` (with notice back-compat) — keep both surfaces identical

**Files:** `app/src/trip/enrich.ts` (add `factsBody`), `app/src/trip/Guide.tsx`, `app/src/trip/guide/ArrivalView.tsx`, `app/src/trip/enrich.test.ts`, `app/src/trip/guide/StoryTabs.test.tsx`.

Guide's middle tab body is the `notice` **prop** string. We keep `StoryTabs`'s prop name `notice` (no churn to its tests / `CurrentStopCard`), but **change what feeds it**: derive the body from `factsList(stop)` joined into a paragraph, falling back to the legacy `notice` string. This makes Guide render the **same** canonical `facts[]` as Plan.

### 4.1 — `factsBody(stop)` helper (facts[] → prose body, notice fallback)

- [ ] **Write the failing test** in `enrich.test.ts`:
```ts
import { factsBody } from './enrich'

describe('factsBody (facts[] joined for the Guide tab, notice fallback)', () => {
  it('joins facts[] into newline-separated paragraphs', () => {
    expect(factsBody({ name: 'X', facts: ['A.', 'B.'] })).toBe('A.\n\nB.')
  })
  it('falls back to the legacy notice string when facts is empty', () => {
    expect(factsBody({ name: 'X', facts: [], notice: 'Legacy body.' })).toBe('Legacy body.')
  })
  it('returns empty string when neither present', () => {
    expect(factsBody({ name: 'X' })).toBe('')
  })
})
```
- [ ] **Run — fails.**
- [ ] **Implement** in `enrich.ts`:
```ts
/** The Guide "Interesting Facts" tab body: facts[] joined as paragraphs, else the legacy notice string. Pure. (renderProse turns \n\n into <p>.) */
export function factsBody(stop: Pick<Stop, 'facts' | 'notice'>): string {
  const list = factsList(stop)
  return list.length ? list.join('\n\n') : (stop.notice ?? '').trim()
}
```
- [ ] **Run — passes.**

### 4.2 — feed `factsBody` into the Guide tab body at every site

- [ ] **Update `Guide.tsx`:**
  - Line 394: `const notice = factsBody(stop ?? { name: '' })` (import `factsBody` from `./enrich`). (Keep the local var name `notice` so the JSX props at 434/674 are untouched.)
  - Peek site (≈751): `notice={factsBody(peekStop)}`.
  - Prev site (≈777): `notice={factsBody(prevStop)}`.
- [ ] **`ArrivalView.tsx`** receives `notice` as a prop from Guide (line 674) — already covered by the Guide change; no edit needed there beyond confirming it forwards the same string.
- [ ] **Render-parity test** — add to `StoryTabs.test.tsx` (or a new `guide/facts-parity.test.tsx`) a check that the Guide body and Plan list read the **same** source:
```ts
import { factsBody, factsList } from '../enrich'
it('Guide tab body and Plan facts list derive from the same facts[]', () => {
  const stop = { name: 'X', facts: ['One.', 'Two.'] }
  expect(factsList(stop)).toEqual(['One.', 'Two.'])
  expect(factsBody(stop)).toBe('One.\n\nTwo.')          // same source, two presentations
})
it('both fall back to legacy notice identically', () => {
  const legacy = { name: 'X', facts: [] as string[], notice: 'Legacy.' }
  expect(factsList(legacy)).toEqual(['Legacy.'])
  expect(factsBody(legacy)).toBe('Legacy.')
})
```
The existing `StoryTabs` tests (prop `notice`, label "Interesting Facts") **stay green unchanged** — we did not touch `StoryTabs.tsx`.
- [ ] **Run — passes:** `cd app && npx vitest run src/trip/enrich.test.ts src/trip/guide/StoryTabs.test.tsx`. Then `cd app && npx tsc -b` clean.
- [ ] **Commit:** `feat(guide): render canonical facts[] in StoryTabs (notice back-compat) — Plan/Guide parity`.

---

## Task 5 — Per-stop hourly weather strip on `StopDetail`

**Files:** `app/src/trip/useHourlyWeather.ts` (new), `app/src/trip/useHourlyWeather.test.ts` (new), `app/src/trip/StopHourlyWeather.tsx` (new), `app/src/trip/StopDetail.tsx`.

Open-Meteo hourly, same source as `useWeather`. Cache **by coord+date** (never persisted into trip data). Shown only when the stop has coords and the day has a date.

### 5.1 — `useHourlyWeather` hook (mirrors `useWeather`)

- [ ] **Write the failing test** `app/src/trip/useHourlyWeather.test.ts` — mock `fetch`; assert the query key is `['weather-hourly', lat, lng, date]` (coord+date, position-independent), that it's disabled without coords/date, and that a malformed payload yields `[]` (never throws). Use `@tanstack/react-query`'s `QueryClientProvider` + `renderHook` like existing hook tests.
- [ ] **Run — fails.**
- [ ] **Implement** `useHourlyWeather(coords, date)`:
```ts
import { useQuery } from '@tanstack/react-query'
export interface HourPoint { time: string; temp: number; code: number }
export function useHourlyWeather(coords: { lat: number; lng: number } | null, date: string | null) {
  const enabled = !!coords && !!date
  const lat = coords?.lat, lng = coords?.lng
  const query = useQuery({
    queryKey: ['weather-hourly', lat, lng, date] as const,   // coord+date, NOT day index
    enabled, staleTime: 60 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000, retry: 1,
    queryFn: async (): Promise<HourPoint[]> => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&hourly=temperature_2m,weather_code&timezone=auto&start_date=${date}&end_date=${date}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`weather ${res.status}`)
      const json: unknown = await res.json()
      const h = (json as { hourly?: Record<string, unknown[]> }).hourly
      const times = h?.time, temps = h?.temperature_2m, codes = h?.weather_code
      if (!Array.isArray(times) || !Array.isArray(temps) || !Array.isArray(codes)) return []
      return times.map((t, i) => ({ time: String(t), temp: Number(temps[i]), code: Number(codes[i]) }))
        .filter(p => Number.isFinite(p.temp) && Number.isFinite(p.code))
    },
  })
  return { hours: query.data ?? [], loading: enabled && query.isLoading }
}
```
- [ ] **Run — passes.**

### 5.2 — `StopHourlyWeather` strip + mount in `StopDetail`

- [ ] **Write a failing render test** for `StopHourlyWeather` (pure presentational: takes `hours: HourPoint[]`, renders a horizontal scroller of hour · temp · icon; renders nothing when empty). Assert it shows e.g. a "14:00" / "21°" cell for a stub, and renders nothing for `[]`.
- [ ] **Run — fails.**
- [ ] **Implement** `StopHourlyWeather.tsx`: a horizontal, scrollable token-themed strip; reuse `weatherFromCode` from `./icons` for the glyph; `prefers-reduced-motion` safe (no animation needed); `aria-label="Hourly weather"`. Optionally thin to daytime hours (e.g. 7:00–22:00) for a calmer strip.
- [ ] **Mount in `StopDetail.tsx`:** compute coords (`stop.lat ?? stop.coords?.lat`, etc.) and the day's date via `dayDate(trip, day)` (import from `./helpers`); call `useHourlyWeather(coords, date)`; render `<StopHourlyWeather hours={hours} />` near the map/meta region. The strip self-hides when there are no coords or no date (hook disabled → `[]`).
- [ ] **Run — passes:** `cd app && npx vitest run src/trip/useHourlyWeather.test.ts src/trip/StopHourlyWeather.test.tsx`. Then `cd app && npx tsc -b` clean.
- [ ] **Commit:** `feat(stop-detail): per-stop hourly weather strip (Open-Meteo, coord+date cached)`.

---

## Task 6 — Day-utilization summary (derived helper + UI)

**Files:** `app/src/trip/day-utilization.ts` (new), `app/src/trip/day-utilization.test.ts` (new), `app/src/trip/DayRail.tsx` and/or the Plan day header (`Itinerary.tsx`).

Pure derived value: "<n> stops · ~<h>h planned", with an `overloaded` flag past a threshold. No new persisted data; default per-kind duration when `stop.duration` is missing.

- [ ] **Write the failing test** `app/src/trip/day-utilization.test.ts`:
```ts
import { dayUtilization, OVERLOAD_MINUTES } from './day-utilization'
import type { Stop } from '../types'

describe('dayUtilization', () => {
  it('sums explicit durations (minutes) and counts stops', () => {
    const stops: Stop[] = [{ name: 'a', duration: 90 }, { name: 'b', duration: 30 }]
    const u = dayUtilization(stops)
    expect(u.stops).toBe(2)
    expect(u.minutes).toBe(120)
    expect(u.hours).toBe(2)         // rounded for display
    expect(u.overloaded).toBe(false)
  })
  it('applies a per-kind default when duration is missing', () => {
    // 'eat' default and 'do' default differ; assert the documented defaults
    const u = dayUtilization([{ name: 'm', kind: 'eat' }, { name: 'museum', kind: 'do' }])
    expect(u.minutes).toBe(DEFAULT_EAT + DEFAULT_DO) // import the consts you define
  })
  it('flags overloaded past the threshold (~10-12h)', () => {
    const stops: Stop[] = Array.from({ length: 8 }, (_, i) => ({ name: `s${i}`, duration: 100 }))
    expect(dayUtilization(stops).overloaded).toBe(true) // 800 min > OVERLOAD_MINUTES
  })
  it('handles an empty day', () => {
    expect(dayUtilization([])).toEqual({ stops: 0, minutes: 0, hours: 0, overloaded: false })
  })
})
```
- [ ] **Run — fails.**
- [ ] **Implement** `day-utilization.ts` (pick sensible defaults; `OVERLOAD_MINUTES = 11 * 60`):
```ts
import type { Stop, StopKind } from '../types'
export const DEFAULT_DO = 90, DEFAULT_EAT = 60, DEFAULT_STAY = 0
export const OVERLOAD_MINUTES = 11 * 60
const DEFAULTS: Record<StopKind, number> = { do: DEFAULT_DO, eat: DEFAULT_EAT, stay: DEFAULT_STAY }
function stopMinutes(s: Stop): number {
  if (typeof s.duration === 'number' && Number.isFinite(s.duration) && s.duration > 0) return s.duration
  return DEFAULTS[(s.kind ?? 'do') as StopKind] ?? DEFAULT_DO
}
export interface DayUtilization { stops: number; minutes: number; hours: number; overloaded: boolean }
export function dayUtilization(stops: readonly Stop[]): DayUtilization {
  const minutes = stops.reduce((sum, s) => sum + stopMinutes(s), 0)
  return { stops: stops.length, minutes, hours: Math.round(minutes / 60), overloaded: minutes > OVERLOAD_MINUTES }
}
```
(If `stop.duration` semantics elsewhere are hours not minutes, confirm against any existing writer before committing the unit; the spec/types comment it as a bare `number` — document the chosen unit in the helper JSDoc and keep tests consistent.)
- [ ] **Run — passes.**
- [ ] **UI:** render a calm summary line in the Plan day header (and/or under the active `DayRail` chip): `{u.stops} stops · ~{u.hours}h planned`, with the `overloaded` state adding a gentle cue (token color, lucide `TriangleAlert`, `aria-label="This day looks full"`). Token classes only; reduced-motion friendly; no layout shift (reserve the line height like `WeatherGlance` does). No persisted data.
- [ ] **Run the suite + typecheck:** `cd app && npx vitest run src/trip/day-utilization.test.ts` then `cd app && npx tsc -b`.
- [ ] **Commit:** `feat(plan): derived day-utilization summary (stops + ~hours, overloaded cue)`.

---

## Task 7 — Day-level `completed` remappers in `itinerary-helpers` (tested)

**Files:** `app/src/trip/itinerary-helpers.ts`, `app/src/trip/itinerary-helpers.test.ts` (extend existing).

Mirror the stop-level remappers at the **day** level. `completed` keys are `"<day>-<stop>"`; reordering/inserting/removing a day shifts the `day` component.

- [ ] **Write the failing tests** (extend the existing file):
```ts
import { remapCompletedAfterDayReorder, remapCompletedAfterDayDelete, remapCompletedAfterDayInsert } from './itinerary-helpers'

describe('remapCompletedAfterDayReorder', () => {
  it('remaps the day component via the new day order, keeps stop index', () => {
    // order[newDayIndex] = oldDayIndex ; e.g. moving day 0 -> 2 with 3 days
    // completed ['0-1','2-0'] under order [1,2,0] -> day0->2, day2->1
    expect(remapCompletedAfterDayReorder(['0-1', '2-0'], [1, 2, 0])).toEqual(['2-1', '1-0'])
  })
})
describe('remapCompletedAfterDayDelete', () => {
  it('drops the removed day keys and shifts higher days down', () => {
    expect(remapCompletedAfterDayDelete(['0-0', '1-2', '2-1'], 1)).toEqual(['0-0', '1-1'])
  })
})
describe('remapCompletedAfterDayInsert', () => {
  it('shifts days at/after the insert index up by one', () => {
    expect(remapCompletedAfterDayInsert(['0-0', '1-1'], 1)).toEqual(['0-0', '2-1'])
  })
})
```
(Insert at the **end** is a no-op for existing keys — add that assertion too.)
- [ ] **Run — fails:** `cd app && npx vitest run src/trip/itinerary-helpers.test.ts`.
- [ ] **Implement** in `itinerary-helpers.ts`, reusing the private `parseKey` and `completedKey`:
```ts
/** After reordering days, remap the day component of each completed key. `order[newDay] = oldDay`. */
export function remapCompletedAfterDayReorder(completed: readonly string[] | undefined, order: readonly number[]): string[] {
  if (!completed?.length) return []
  const oldToNew = new Map<number, number>()
  order.forEach((oldDay, newDay) => oldToNew.set(oldDay, newDay))
  const out: string[] = []
  for (const key of completed) {
    const p = parseKey(key); if (!p) { out.push(key); continue }
    const nd = oldToNew.get(p.day)
    if (nd !== undefined) out.push(completedKey(nd, p.stop))
  }
  return out
}
/** After deleting `removedDay`, drop its keys and shift higher days down by one. */
export function remapCompletedAfterDayDelete(completed: readonly string[] | undefined, removedDay: number): string[] {
  if (!completed?.length) return []
  const out: string[] = []
  for (const key of completed) {
    const p = parseKey(key); if (!p) { out.push(key); continue }
    if (p.day === removedDay) continue
    out.push(completedKey(p.day > removedDay ? p.day - 1 : p.day, p.stop))
  }
  return out
}
/** After inserting a day at `insertDay`, shift days at/after it up by one. */
export function remapCompletedAfterDayInsert(completed: readonly string[] | undefined, insertDay: number): string[] {
  if (!completed?.length) return []
  const out: string[] = []
  for (const key of completed) {
    const p = parseKey(key); if (!p) { out.push(key); continue }
    out.push(completedKey(p.day >= insertDay ? p.day + 1 : p.day, p.stop))
  }
  return out
}
```
- [ ] **Run — passes.** Then `cd app && npx tsc -b` clean.
- [ ] **Commit:** `feat(itinerary): day-level completed remappers (reorder/delete/insert)`.

---

## Task 8 — `DayRail` editable: add / remove / reorder days + edit title & note (wired with invariants)

**Files:** `app/src/trip/DayRail.tsx`, a new `app/src/trip/DaySettingsSheet.tsx` (title/note editor), and the parent that owns `save`/`activeDay` (`Itinerary.tsx` / `PlannerLayout` context). Add `app/src/trip/day-mutations.ts` (new) for the **pure** data transforms so they're unit-tested before wiring UI.

The UI churn is risky; isolate the data transforms as pure functions first, test them (including the invariants), then wire `DayRail` to call them through the lifted `save`.

### 8.1 — pure day-mutation transforms (TripData → TripData)

- [ ] **Write the failing test** `app/src/trip/day-mutations.test.ts` for `addDay`, `removeDay`, `reorderDays`, `setDayMeta`:
```ts
import { addDay, removeDay, reorderDays, setDayMeta } from './day-mutations'
import type { TripData } from '../types'

const base: TripData = {
  days: [
    { title: 'D1', stops: [{ name: 'a' }] },
    { title: 'D2', stops: [{ name: 'b' }, { name: 'c' }] },
    { title: 'D3', stops: [] },
  ],
  completed: ['0-0', '1-1', '2-0'.replace('2-0','1-0')], // = '0-0','1-1','1-0'
}

it('addDay appends an empty day and leaves completed untouched (append index = end)', () => {
  const out = addDay(base)
  expect(out.days).toHaveLength(4)
  expect(out.days[3].stops).toEqual([])
  expect(out.completed).toEqual(base.completed)
  expect(out).not.toBe(base)              // immutable
})
it('removeDay drops the day and remaps completed', () => {
  const out = removeDay(base, 0)          // removing day 0 shifts 1->0
  expect(out.days.map(d => d.title)).toEqual(['D2', 'D3'])
  expect(out.completed).toEqual(['0-1', '0-0']) // old '1-1'/'1-0' -> '0-1'/'0-0'
})
it('reorderDays moves a day and remaps completed', () => {
  const out = reorderDays(base, 0, 2)      // order becomes [1,2,0]
  expect(out.days.map(d => d.title)).toEqual(['D2', 'D3', 'D1'])
  // day0 stops -> position 2 ; completed day0 -> day2
  expect(out.completed).toContain('2-0')
})
it('setDayMeta edits title/note immutably, drops empty note', () => {
  const out = setDayMeta(base, 1, { title: 'New', note: '' })
  expect(out.days[1].title).toBe('New')
  expect('note' in out.days[1]).toBe(false)
  expect(out.days[1].stops).toBe(base.days[1].stops) // untouched stops referenced
})
```
(Use a clean inline `completed` rather than the `.replace` trick in real code — that line is illustrative; write `completed: ['0-0','1-1','1-0']`.)
- [ ] **Run — fails.**
- [ ] **Implement** `day-mutations.ts` using `moveItem` + the day-level remappers from task 7:
```ts
import type { TripData, Day } from '../types'
import { moveItem, remapCompletedAfterDayReorder, remapCompletedAfterDayDelete } from './itinerary-helpers'

export function addDay(data: TripData): TripData {
  const day: Day = { title: `Day ${data.days.length + 1}`, stops: [] }
  return { ...data, days: [...data.days, day] }       // append → existing completed keys unaffected
}
export function removeDay(data: TripData, index: number): TripData {
  if (index < 0 || index >= data.days.length) return data
  return { ...data, days: data.days.filter((_, i) => i !== index), completed: remapCompletedAfterDayDelete(data.completed, index) }
}
export function reorderDays(data: TripData, from: number, to: number): TripData {
  if (from === to) return data
  const days = moveItem(data.days, from, to)
  // Build order[newIndex] = oldIndex from the same move applied to indices.
  const order = moveItem(data.days.map((_, i) => i), from, to)
  return { ...data, days, completed: remapCompletedAfterDayReorder(data.completed, order) }
}
export function setDayMeta(data: TripData, index: number, meta: { title?: string; note?: string }): TripData {
  if (index < 0 || index >= data.days.length) return data
  const days = data.days.map((d, i) => {
    if (i !== index) return d
    const next: Day = { ...d }
    if (meta.title !== undefined) next.title = meta.title
    if (meta.note !== undefined) {
      if (meta.note.trim()) next.note = meta.note
      else delete next.note
    }
    return next
  })
  return { ...data, days }
}
```
- [ ] **Run — passes:** `cd app && npx vitest run src/trip/day-mutations.test.ts`.

### 8.2 — wire editable `DayRail` (edit-gated UI)

- [ ] **Implement UI** (no new pure logic — calls 8.1 via the lifted `save({ data })`):
  - `DayRail` gains `canEdit` + the save plumbing (pass `trip`, `canEdit`, and an `onMutate` that clones + saves, or thread `save` from the outlet context). When `canEdit`:
    - **Add day** button (append) → `save({ data: addDay(trip.data) })`.
    - **Remove day** → `ConfirmDialog` ("Remove Day N?") → `save({ data: removeDay(trip.data, i) })`; then keep selected-day stable (task 9 invariant 3).
    - **Reorder days** via `@dnd-kit` (same primitives as `StopList` reorder) → `save({ data: reorderDays(trip.data, from, to) })`; selected day follows (invariant 3).
    - **Edit title + note** → open `DaySettingsSheet` (focus-trap + esc + restore, labelled inputs, ≥44px targets) → `save({ data: setDayMeta(trip.data, i, { title, note }) })`.
  - View-only users (`!canEdit`) see the existing read-only chips — **no controls**.
  - Anti-slop: lucide icons (`Plus`, `Trash2`, `GripVertical`, `Pencil`), token classes, `prefers-reduced-motion` on dnd transitions, no layout-shift hover.
- [ ] **Run the full suite + build:** `cd app && npm test && npx tsc -b && npm run build`. Expect green + clean + a successful build (the one pre-existing chunk-size warning is fine).
- [ ] **Commit:** `feat(day-rail): edit-gated add/remove/reorder days + title/note editor`.

---

## Task 9 — The four Day-Reorder Invariants as explicit tests

**Files:** `app/src/trip/day-reorder-invariants.test.ts` (new). These lock the spec's audit (design §"Day Reorder Invariants", line 209) so regressions are caught, not discovered.

- [ ] **Invariant 1 — `completed` keys remap.** Already exercised by task 7/8 tests; add a focused assertion via the public `reorderDays`/`removeDay`/`addDay`:
```ts
it('INV1: completed keys follow their day across reorder/delete/insert', () => {
  const data = { days: [{title:'A',stops:[{name:'a'}]},{title:'B',stops:[{name:'b'}]},{title:'C',stops:[{name:'c'}]}], completed: ['0-0','2-0'] }
  expect(reorderDays(data, 0, 2).completed.sort()).toEqual(['1-0','2-0'].sort()) // A:0->2, C:2->1
  expect(removeDay(data, 0).completed).toEqual(['1-0'])                          // drop A's key, C 2->1
  expect(addDay(data).completed).toEqual(['0-0','2-0'])                          // append → unchanged
})
```
- [ ] **Invariant 2 — reservations travel with the stop, never day-indexed.** Assert reservations live on `stop.reservation` and move with the day's stops; assert there is **no** day-indexed reservation state anywhere:
```ts
it('INV2: reservations live on the stop and travel with it; no day-indexed reservation state', () => {
  const data = {
    days: [
      { title: 'A', stops: [{ name: 'a', reservation: { status: 'reserved' as const } }] },
      { title: 'B', stops: [{ name: 'b' }] },
    ],
    completed: [] as string[],
  }
  const out = reorderDays(data, 0, 1)
  // stop a moved to day index 1, its reservation rode along untouched
  expect(out.days[1].stops[0].reservation?.status).toBe('reserved')
  // no top-level/day-level reservation map exists on TripData/Day
  expect((out as Record<string, unknown>).reservations).toBeUndefined()
  expect((out.days[1] as Record<string, unknown>).reservations).toBeUndefined()
})
```
- [ ] **Invariant 3 — selected-day stability.** Add a pure `followDayAfter(...)` helper (in `itinerary-helpers.ts`) that maps a selected day index through a reorder/delete/insert, and test it; then have `DayRail`/parent call it after each mutation to update `activeDay` (via `setActiveDay`) so viewing Day 3 when Day 2 is removed lands on the right content, not a stale index. Test:
```ts
import { followDayAfterReorder, followDayAfterDelete } from './itinerary-helpers'
it('INV3: selected day follows the same day across reorder/delete', () => {
  // viewing day 0; it moves to index 2 under order [1,2,0]
  expect(followDayAfterReorder(0, [1, 2, 0])).toBe(2)
  // viewing day 2; day 1 removed -> now at index 1; viewing the removed day clamps sensibly
  expect(followDayAfterDelete(2, 1)).toBe(1)
  expect(followDayAfterDelete(1, 1)).toBe(1) // removed day → stay at same slot (now next day), clamped by caller
})
```
Implement the two helpers mirroring the remap math (`followDayAfterReorder(sel, order)` = `order.indexOf(sel)`; `followDayAfterDelete(sel, removed)` = `sel > removed ? sel-1 : Math.min(sel, lastIndex)` — caller clamps to `days.length-1`). Wire the call in the parent after `removeDay`/`reorderDays`.
- [ ] **Invariant 4 — weather cache is position-independent.** Assert both weather hooks key by coord+date, never day index:
```ts
it('INV4: weather cache keys are coord+date, never day index', () => {
  // useWeather: queryKey ['weather', lat, lng, date]; useHourlyWeather: ['weather-hourly', lat, lng, date]
  // A reorder changes which DATE a position maps to (helpers.dayDate is position-derived),
  // so a coord+date key naturally re-fetches the right forecast and never serves a stale day index.
})
```
This invariant is a **confirm/guard**: `useWeather.ts:36` already uses `['weather', lat, lng, date]` and task 5's hook uses `['weather-hourly', lat, lng, date]` — both position-independent. The test documents and guards it (e.g. import the queryKey-builder if you factor one out, or assert via a small exported `weatherKey(lat,lng,date)` / `hourlyWeatherKey(...)` helper added to the hooks for testability). If either hook is found keyed by day index, **fix it here**.
- [ ] **Run — passes:** `cd app && npx vitest run src/trip/day-reorder-invariants.test.ts src/trip/itinerary-helpers.test.ts`.
- [ ] **Commit:** `test(day-reorder): lock the four reorder invariants (completed/reservations/selected-day/weather-key)`.

---

## Final verification (before deploy)

- [ ] `cd app && npm test` — full suite green (526 baseline + all new tests).
- [ ] `cd app && npx tsc -b` — clean.
- [ ] `cd app && npm run build` — succeeds (one pre-existing chunk-size warning is acceptable).
- [ ] Manual smoke (dev): generate enrichment on a small/local stop → Story/Facts/Experience are non-empty; the **same facts** show in Plan `StopDetail` bullets and the Guide "Interesting Facts" tab; chips show when present; hourly strip appears for a coord+dated stop; day-utilization line shows and flags an overloaded day; add/remove/reorder a day and confirm done-state + selected day stay correct.
- [ ] Deploy: `cd app && npm run build` then `npx wrangler deploy` (from repo root). Smoke `/`, `/trips`, `/trip/x/guide`, `/trip/x/trip` return 200.

---

## Definition of done

- [ ] **Enrichment richness fixed:** `maxTokens` is 2000; the prompt asks for useful content in every section (no "leave empty"); Wikipedia is framed as background, not an authoritative gate; Sonnet retained (no model override).
- [ ] **Field-duplication bug fixed:** `notice` is dropped from the prompt and the generated `StopDetailContent` shape; `facts[]` is the one canonical Interesting-Facts field; **Plan `StopDetail` and Guide `StoryTabs` render the same `facts[]`**; legacy `notice` is still read (back-compat) via `factsList`/`factsBody` when `facts[]` is empty.
- [ ] **Richer fields:** `hours` / `price` (normalized enum) / `goodFor` are generated, parsed, normalized (`normalizePrice`), and rendered as chips on `StopDetail`; unmappable price → empty, never arbitrary text.
- [ ] **Per-stop hourly weather:** strip shows for coord+dated stops; cached by coord+date; never persisted into trip data.
- [ ] **Day utilization:** derived "<n> stops · ~<h>h planned" with an overloaded cue; no new persisted data.
- [ ] **Day management:** `DayRail` is edit-gated editable — add/remove/reorder days + edit title/note; immutable via `save`; view-only users see no controls.
- [ ] **All four Day-Reorder Invariants hold and are explicitly tested:** completed-key remap; reservations travel with the stop (no day-indexed reservation state); selected-day stability; weather cache keyed by coord+date.
- [ ] **Conventions honored:** immutable saves (clone, never mutate cache); `canEdit`-gating; additive JSONB back-compat; lucide icons only; CSS-var token theming (light+dark); a11y (≥44px, aria, labelled inputs, focus-trap+esc on sheets); `prefers-reduced-motion`.
- [ ] `npm test` green · `npx tsc -b` clean · `npm run build` succeeds · committed per task with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer on branch `main` · deployed.

---

## Self-review (writing-plans)

**Spec coverage (design §Tier 3 → tasks):**
- §3a enrichment fix → **Task 2** (maxTokens 2000, grounding rewrite, Wikipedia reframe, drop `notice`) + **Tasks 3–4** (render `facts[]` identically, `notice` back-compat). ✓
- §3b richer fields + price enum → **Task 1** (types), **Task 2** (`normalizePrice`, prompt, parse), **Task 3** (chips). ✓
- §3c per-stop hourly weather → **Task 5**. ✓
- §3d day-utilization summary → **Task 6**. ✓
- §3e day management → **Tasks 7–8**; §"Day Reorder Invariants" → **Task 9**. ✓
- Data model (design line 224): `hours`/`price`/`goodFor` added (Task 1); `notice` deprecated read-only (Tasks 1–4); `coordinateSource`/`locationEditedAt`/`bookingRecommendation`/`travelerContext` are **Tier 1/Tier 2** — correctly **out of scope** here.
- Testing (design line 235): enrich prompt/parse incl. facts/notice back-compat **and** price normalization (Tasks 2–4); day-utilization sum (6); day-level remappers + the four invariants (7,9); render parity (3,4). ✓

**Placeholder scan:** no `TODO`/`...`/`<placeholder>` — every task ships real, runnable code and concrete `cd app && npx vitest run <file>` commands with expected output.

**Type/naming consistency:** the **Field-naming contract** table is the single source of truth; `facts` (array) / `price` (enum `'$'|'$$'|'$$$'|'$$$$'`, alias `PriceLevel`) / `notice` (deprecated, read-only) are named identically across Tasks 1–4 and 9. `StopDetailContent` drops `notice` and gains optional `hours`/`price`/`goodFor` consistently in Tasks 2–4. `PriceLevel` is defined once (Task 1) and imported by `enrich.ts` (Task 2). Helpers `factsList` (array, for Plan bullets) and `factsBody` (string, for Guide tab) both derive from the same `facts[]` with identical `notice` fallback — the parity guarantee. Day-level remapper names (`remapCompletedAfterDay{Reorder,Delete,Insert}`) mirror the existing stop-level names; `followDayAfter{Reorder,Delete}` are the selected-day analogs. Weather keys (`['weather', …]`, `['weather-hourly', …]`) are coord+date in both hooks (Invariant 4).

**Risk notes for the implementer:**
- Confirm the unit of `stop.duration` (minutes assumed in Task 6) against any existing writer before committing; document the choice in the helper.
- Several existing tests reference `notice` in the *generated* shape (`enrich.test.ts` lines 47/52/62/67/71, the `parseStopDetail notice` block, and `generateStopDetail` JSON mocks). Task 2 must update/remove those in the same commit so the suite stays green. `StoryTabs`'s own tests keep the `notice` **prop** and stay untouched (we only change what feeds it, in `Guide.tsx`).
