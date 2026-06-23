# Voyager — Suggest Day Parity Restoration (design)

> **Status:** Design for review. · **Date:** 2026-06-23 · **Branch:** `main`
> Read `CLAUDE.md` (principles, stack, conventions), `handoff.md` (current state), and the parent initiative spec `docs/superpowers/specs/2026-06-22-voyager-plan-parity-design.md` first.
> This is a **planning document**. No implementation until approved. After approval it gets a step-by-step plan (`docs/superpowers/plans/2026-06-23-voyager-suggest-day-parity.md`) built via subagent-driven-development.

---

## North star

> ### "Suggest a day" should generate a **complete, realistic travel day** — a scheduled, meal-anchored morning→evening arc — not a short list of attractions.

A spun-off, focused workstream within the **Plan-tab parity** initiative. The owner flagged that Voyager's "Suggest a day" feels thin (~4 stops) versus the old travel-guide.ai, which consistently produced full days. This restores that density while keeping Voyager's **single-prompt architecture** and design language — the smallest set of changes that gets there.

## What the investigation found (evidence)

Verbatim comparison of `Trip.html` (legacy = travel-guide.ai) vs `app/src/trip/suggest.ts`:

- **Legacy density was multi-feature, and its day-builder prompts were far richer.** The primary day-builder was **"Fill empty slots with AI"** (`doFillItinerary`, ~`Trip.html:11379`) running on an **8000-token** budget with: a **9am–midnight time window**, explicit **meal anchors** (*"breakfast ~9-10am, lunch ~12-2pm, dinner ~6-8pm"*, `~L11392`), **geographic clustering**, and rich per-stop output (`time`, `duration`, `type_label`, `history`, `todo`). A **multi-day optimizer** (`~L11920`) re-balanced meals/museums (*"breakfast 9-10:30 AM, lunch 12-2 PM, dinner 7-9:30 PM"*, `~L11971`). Place search returned **6** results (`~L10258`), each carrying `duration`, `tips`, `hours`, `priceLevel`, `goodFor`. Durations came from a **rule-based lookup table** (coffee 45 / lunch 75 / dinner 90 / museum 90 / park 60 / walk 30 min, `~L4580`) with an AI fallback. Traveler context was injected into **every** prompt (`travelerCtxLine()`, `~L2357`).
- **Voyager's `suggestDay` collapsed all of that** into one thin call: *"Plan a single, coherent day of **4** real, notable stops … a sensible mix"* (`suggest.ts:48–57`), **no `time`, no `duration`, no meal anchors, no traveler context, maxTokens 1500**.

| Lever | Legacy | Voyager today |
|---|---|---|
| Stops per day | filled to the time window (~6–8) | **4** |
| Meal anchors | ✅ explicit times in prompt | ❌ "lunch spot" hint |
| `time` per stop | ✅ AI-assigned | ❌ |
| `duration` per stop | ✅ AI + rule-based lookup | ❌ |
| Morning→evening window | ✅ 9am–midnight enforced | ❌ textual hint |
| Traveler context | ✅ every prompt | ❌ |
| Token budget | up to 8000 | 1500 |

The gap is not subtle: **Voyager asks for a short list; legacy assembled a scheduled, meal-anchored, duration-aware full day.**

**The decisive lever was the time window, not the meal anchors.** Legacy never targeted a stop count — it filled gaps across a **~9am–midnight** window (`~L11127`) / **10am–10:30pm** in the optimizer (`~L11961`), filling every gap ≥45 min (`~L11155–11164`), with **no count cap**. Stops were a *consequence* of filling the day by duration. Derived from that model (3 meals ≈ 3.5h + attractions ~90 min + transit), dense capitals (Paris/Tokyo/Rome) land ~**8–11+** stops, slower places (e.g. Yerevan) ~**6–8**. So the right objective is **day-completeness, not a stop quota.**

---

## Scope — the smallest changes that restore full days

Keep ONE prompt (Voyager architecture). No gap-fill engine, no multi-day optimizer rebuild.

### 1. Rewrite `buildSuggestDayPrompt` into a *complete-day* prompt
A day-planner persona that returns a **complete, realistic day**:
- **Completeness over count — fill the day window; durations govern.** The objective is a *realistically full travel day*, not a stop quota. Schedule from the morning (~8–9am) through the evening (dinner and usually an evening pick, ~9–10pm+), and use each stop's `duration` plus realistic transit to judge when the day is genuinely full — **keep adding worthwhile stops until it is, and do not stop at an arbitrary number.** Stop count is a **consequence, not the goal**: a dense capital (Paris, Tokyo, Rome) naturally fills with more, a slower place (a small town, Yerevan) with fewer. In practice this usually lands around **6–11 stops**, but that's an observed range to sanity-check against, never a target the model should satisfy and stop at. (Mirrors legacy exactly — it filled a ~9am–midnight / 10am–10:30pm window by duration, no count cap.)
- **Morning→evening skeleton with explicit meal anchors:** coffee/breakfast (~8–9:30) · a morning highlight · **lunch (~12–1:30)** · one or two afternoon stops · an optional break/coffee · **dinner (~7–8:30)** · an optional evening pick.
- **Walkable & geographically coherent** (stronger than "cluster nearby"): the itinerary should *feel walkable* — consecutive stops generally stay within the **same district or adjacent districts** unless there's a compelling reason to travel farther; cluster nearby places and avoid backtracking.
- **Varied, intentional pacing (variety guard):** alternate activity types where possible; **avoid repetitive runs of similar stops** (e.g. museum → museum → museum) unless a place is genuinely exceptional. The day should feel varied, not monotonous.
- **Notable-not-touristy bias** — real, characterful places (insider as well as marquee), the way legacy read.
- **Assign `time` and `duration` per stop** (realistic, e.g. coffee 45m, museum 90m, dinner 90m) so the day arrives **scheduled**.
- Keep the existing JSON-array contract + robust parser; keep the "real places, accurate coords or omit" guard.

### 2. Capture `time` + `duration` + `mealAnchor` from the model
Extend the parser (`toStop` in `suggest.ts`) to read `time` (string, e.g. `"10:00 AM"` → `Stop.time`), `duration` (e.g. `"90 min"` → `Stop.duration` minutes via a new `normalizeDuration`), and the new optional **`mealAnchor`** (validated to `'breakfast' | 'lunch' | 'dinner'` → `Stop.mealAnchor`; anything else dropped). `time`/`duration` already exist on `Stop`; `mealAnchor` is one small **additive** field (see Data model). Stops arrive scheduled *and* meal stops are self-identifying — feeding **Tier 3's day-utilization** and **Tier 2a's Optimize Day** (which otherwise has to regex stop names to find meals, exactly as legacy did).

The JSON contract becomes:
```json
[{"name":"...","type":"e.g. Cafe / Museum / Restaurant / Park","address":"street, city","lat":0.0,"lng":0.0,"time":"9:00 AM","duration":"45 min","mealAnchor":"breakfast","note":"1 short sentence"}]
```
`mealAnchor` is set only on the three main meal stops; all other stops omit it.

### 3. Shared `defaultDuration` helper (one helper, three consumers)
A pure `app/src/trip/duration.ts` → `defaultDurationMinutes(stop)` mirroring legacy's lookup (coffee/breakfast 45 · lunch/brunch 75 · dinner/restaurant 90 · museum/gallery 90 · theatre 150 · park 60 · walk 30 · default 60), keyed off `kind`/`type`/name. Fills any stop the model leaves without a duration. **Reused by Tier 2c (duration suggestions) and Tier 3d (day-utilization).**

### 4. Token budget
`suggestDay` **maxTokens 1500 → 4000**. The larger budget exists to **prevent truncation of a richer, full-day itinerary** — it is **not** an instruction to generate unnecessarily verbose content (a full day of structured stops is ~450–700 tokens of real output; you pay only for what's generated). The ceiling simply guarantees a complete day is never cut off mid-JSON.

### 5. Traveler-context hook (thin; full feature is Tier 2d)
The prompt builders accept an optional `travelerContext?: string` (added to `SuggestContext`) and fold it in when present. The caller reads it opportunistically from `trip.config` (via the existing `[k:string]:unknown` index signature, guarded as a string) — **no `TripConfig` change here**. Until Tier 2d ships the field + the UI to set it, this is simply inert. Legacy injected traveler context into every prompt; this leaves the hook so days tailor the moment Tier 2d lands.

### 6. (Tiny) `suggestPlaces` 5 → 6 results
Match legacy's 6-result search. Trivial; same parser.

### 7. Model: Opus 4.7 for day generation; enrichment stays Sonnet 4.6
Day generation is the heaviest reasoning task in the planner (completeness, geography, variety, scheduling), so **`suggestDay` runs on Claude Opus 4.7 (`claude-opus-4-7`)** — passed via `callAI`'s `model` option. It fires only on an explicit "Suggest a day" click (not per-stop), so the higher Opus cost is bounded. Everything else stays on the default **Sonnet 4.6 (`claude-sonnet-4-6`)**: `suggestPlaces` (lighter single-place search) and — explicitly — **stop enrichment** (`enrich.ts` Story/Facts/Experience, the Tier 3 work) remain Sonnet. The `ai-proxy` forwards only `{ model, max_tokens, messages }` (no `temperature` / `thinking` / `budget_tokens`), so Opus 4.7's adaptive-thinking-only request surface needs no other change.

---

## Out of scope (related legacy features — *not* needed for full "Suggest a day")

Called out so we don't imply parity we didn't build:
- **Gap-fill an existing day** (legacy `doFillItinerary`) — filling time holes around *existing* stops is a separate feature; a possible future addition.
- **Multi-day optimize** (legacy cross-day rebalancing) — already the **Tier 2 stretch**.
- **Magic landmark tour** — out (Guide-adjacent discovery).
- **Per-stop `hours` / `priceLevel` / `goodFor` from suggestions** — that enrichment depth lives in **Tier 3b**; this workstream sets only `time` + `duration`.

## Data model & back-compat

**One small additive field.** `Stop.time` (string) and `Stop.duration` (number, minutes) already exist; we now populate them from suggestions. New optional **`Stop.mealAnchor?: 'breakfast' | 'lunch' | 'dinner'`** — additive, no migration — marks a stop as a meal so downstream logic (especially **Tier 2a Optimize Day**) identifies meals from a field instead of a name regex. Reads stay back-compat (older suggested stops simply lack `time`/`duration`/`mealAnchor`). The `defaultDuration` helper covers any stop missing a duration so downstream consumers always have a number.

## Relationship to the tiers

- **Generation vs. ordering stay separate:** `suggestDay` *generates* a scheduled day; **Tier 2's deterministic "Optimize this day"** later *re-sequences* it. No overlap, no conflict.
- **`defaultDuration` is the shared dependency** that makes Tier 2c and Tier 3d concrete.
- **Traveler context**: the typed `TripConfig.travelerContext` field + the UI to set it remain **Tier 2d**; this spec only consumes it if present.

## Where it slots

Run **before Tier 3** — AI is live now (Phase 0 resolved 2026-06-23), this is the highest-visible parity gap the owner flagged, and it's a contained change to `suggest.ts` + one shared helper. Revised order: Phase 0 ✅ → Tier 1 ✅ → **Suggest Day Parity** → Tier 3 → Tier 2.

## Testing

- **Pure, unit-tested (vitest):** `normalizeDuration` ("90 min"/"1h 30m"/"45m"/bare number/garbage → minutes|undefined); `toStop` now capturing `time`+`duration`+`mealAnchor` (and dropping an out-of-enum `mealAnchor`); `defaultDurationMinutes` per kind/type; `parseSuggestions` still robust. Prompt-builder assertions: `buildSuggestDayPrompt` frames a **full-day window / completeness (NOT a hard stop count)** — assert the "fill the whole day / until genuinely full / not an arbitrary number" language — plus meal-anchor language, the **walkable / same-or-adjacent-district** clustering language, the **variety guard** ("alternate" / "repetitive"), the `time`/`duration`/`mealAnchor` fields, and folds `travelerContext` when supplied. (Model choice — Opus 4.7 for `suggestDay` — is a `callAI` option on the network boundary, not unit-tested.)
- Suite stays green (`cd app && npm test`); `tsc -b` clean; `npm run build`; deploy.
- **Manual smoke:** "Suggest a day for me" on an empty day → a full, scheduled, meal-anchored day (~6–10 stops) with times + durations and coherent geography.

## Open decisions (resolved)

- **Generation objective:** **completeness-driven, NOT count-driven** (owner-approved 2026-06-23, after a legacy re-review). Fill a realistic morning→evening window using durations; stop count is a consequence (observed ~6–11, never a target). Supersedes the earlier "6–10 stops / 8–12h" framing; matches legacy's window-fill behavior. *Implementation note:* done via prompt instruction (single call, no gap-fill engine); a cheap "completeness top-up" second call is a possible future stretch if days under-fill in practice.
- **Meal anchors:** add optional `mealAnchor` to the response + `Stop` (strengthens Tier 2a's meal detection; nearly free while the schema is already changing).
