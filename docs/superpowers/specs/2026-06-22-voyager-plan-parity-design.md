# Voyager — Plan Tab Feature-Parity Rebuild (design)

> **Status:** Design for review — single initiative, **3 tiers**. · **Date:** 2026-06-22 · **Branch:** `main`
> Read `CLAUDE.md` (principles, stack, conventions) and `handoff.md` (current state) first.
> This is a **planning document**. No implementation until the design is approved. After approval, each tier gets a step-by-step implementation plan via the writing-plans flow and is built with subagent-driven-development (commit per task, push `origin/main`, keep the ~526-test suite green, deploy to Cloudflare).

---

## North star (for this initiative)

> ### Bring the **Plan** tab to feature-parity with the legacy `Trip.html` (travel-guide.ai) planner — re-expressing its capabilities **natively in Voyager's design language**, not porting its markup.

The legacy single-file app was a rich planner; Voyager's Plan tab re-built a strong *subset* and quietly dropped several capabilities (real coordinates for typed places, AI planning assists, deeper stop content, day management) and regressed the AI enrichment into sparseness. This initiative closes those gaps while honoring Voyager's product principles:

- **The stop is the atomic object.** Enrich stops; never add a parallel object system.
- **One data model, many lenses.** Plan and Guide are projections over the same `data`; a shared helper fixed once improves both.
- **The map orients, never navigates.** Consistent with the Minimap spec: Voyager is *not* rebuilding Google Maps. No turn-by-turn, no routed navigation, no in-app directions.
- **Anti-slop is non-negotiable:** lucide icons only, CSS-var token theming (light + dark), a11y (≥44px targets, aria, focus rings), `prefers-reduced-motion`, photography-first/editorial.
- **Immutable saves** via the lifted `save({config?,data?})`; **edit-gated** by `canEdit`; **additive JSONB back-compat** (read legacy fields, never a schema migration).

---

## Scope at a glance

| Phase | Theme | Ships |
|---|---|---|
| **0** | AI reliability (platform) | Verify the `ai-proxy` deploy, `ANTHROPIC_API_KEY`, and the founder-credit bypass; update `handoff.md`; produce an operator runbook. **Gates everything below** — every AI feature depends on it. |
| **1** | Map & location foundation | Restyle `TripMapView` to the Guide-minimap aesthetic (orientation, not navigation); remove the "navigate the user" affordances; **real coordinates via a shared geocoder** so typed / AI-coordless stops still map and get walk times |
| **2** | AI planning power | "Optimize this day" (**deterministic-first**, AI breaks ties), "What should I book?" (**with confidence + reason**), stop-duration suggestions, traveler-context in planning prompts |
| **3** | Stop content & day structure | **Fix the Story / Interesting Facts / Experience enrichment** (richness regression + a field-duplication bug); richer enrichment fields (hours / price / "good for"); per-stop hourly weather; **day utilization summary**; **day management** (add / remove / reorder days, edit titles & notes) |

**Parked (not now):** photo→landmark vision identification (legacy gap F).
**Next batch (after this one):** a shared per-**location** enrichment cache — noted under Future Work, *not* built here.
**Explicitly out of scope:** GPS live auto-discovery walking tour (Guide's domain, partially shipped), trip story / blog generator, JSON export/import, any turn-by-turn / in-app navigation.

Phase 0 is a **platform/infrastructure gate**, not a feature — it's elevated above the tiers because if `ai-proxy` is broken, Suggest Places, Suggest Day, enrichment, Optimize Day, What-to-Book, and (degraded) duration suggestions are *all* broken. The three feature tiers are independent enough to spec, build, and ship in sequence. Recommended order: **Phase 0 first** (it gates every AI feature), then **Tier 1**, then **Tier 3**, then **Tier 2**. Each phase/tier is demoable on its own.

---

## Current state (what Plan already does, and the gaps)

**Has, at/above parity:** day split view (`Itinerary` + `TripMapView`, CARTO light/dark, numbered claret pins, day-color routes for "all", distinct Stay pin, popups); AI place suggestions (`AddStop` → `suggestPlaces`); AI "suggest a whole day" (`suggestDay`); per-stop enrichment (`enrich.ts`, Wikipedia-grounded); reservations (per-stop + the Trip tab); dnd-kit reorder, mark-done, delete; per-stop photos; change-location; per-**day** weather glance; haversine walk-time connectors.

**Gaps this initiative closes:**
- **B — coordinates are AI-only.** `AddStop` and `ChangeLocation` rely entirely on the model for lat/lng (`location.ts:placeFromSuggestion`). A typed name, or any suggestion where the model omits coords, gets **no pin and no walk times**. No geocoder fallback exists.
- **C — no AI planning assists.** No optimize-day, no "what to book", no duration suggestions, no traveler context in prompts. *And the AI itself is currently broken on Voyager* (see Tier 2).
- **D — thin stop content.** Enrichment is Story/Facts/Tips only — no hours / price / "good for"; weather is per-day, not per-stop.
- **E — `DayRail` is read-only.** No add / remove / reorder days; no editing day titles or notes from Plan.
- **Enrichment regression.** Story/Interesting-Facts/Experience come back sparse or empty vs. travel-guide.ai (diagnosed below).

---

# Phase 0 — AI Reliability Verification (platform gate)

## Intent

Every AI feature in this initiative — plus the *existing* Suggest Places, Suggest Day, and enrichment — depends on the `ai-proxy` edge function, which **works on travel-guide.ai but 403s on Voyager**. This is platform infrastructure, not a Plan feature, so it runs **before any tier begins** and gates everything downstream. Nothing here is app code; it's verification, documentation, and an operator runbook.

## Root cause (to confirm)

Standing theory (`handoff.md` → "Backend / AI status"): the **`ai-proxy` slug has the trip-invite *emailer* deployed instead of the Claude proxy**. An AI request (`{messages,…}`) carries no `trip_id`, the emailer's trip lookup fails, and it returns `403` — no Anthropic call ever happens (logs show only boot/shutdown). Confirm by probing the deployed slug / inspecting logs before declaring it fixed.

## Checklist

1. **Verify the deployed `ai-proxy`** is the real Claude proxy (`supabase/functions/ai-proxy/index.ts`), not the emailer, on project `wnpanbjzmcsvhfyjdczv`.
2. **Verify `ANTHROPIC_API_KEY`** secret is set and valid on that project.
3. **Verify the founder-credit bypass** — the gate mirrors legacy: `role === 'founder'` = unlimited, `credits > 0` = 1 credit/call, else `403`. Ensure the owner's `profiles.role = 'founder'`.
4. **Update `handoff.md`** with the confirmed, current explanation (replace the theory with the finding) and the resolution that was applied.
5. **Produce an operator runbook** — the exact deploy/secret/role steps (and how to re-verify) so this is recoverable without re-diagnosis:
   - `npx supabase functions deploy ai-proxy --project-ref wnpanbjzmcsvhfyjdczv`
   - set `ANTHROPIC_API_KEY`
   - confirm `profiles.role` / `credits`
   - smoke-test: a Suggest Places call returns results, not `403`/`429`.

## Smoke test matrix (exit gate)

Don't declare "AI works" after testing one endpoint — run the matrix so a half-working gate is caught:

| Check | Expected |
|---|---|
| Suggest Places | Returns places |
| Suggest Day | Returns an itinerary |
| Enrich Stop | Returns story / facts |
| Non-founder, zero credits | `403` (gate holds) |
| Founder account | Unlimited (no `403`/`429`) |

The client (`ai.ts:callAI`) is already correct — **no app code changes in Phase 0.** Exit criterion: the **full matrix** passes (not just one endpoint).

---

# Tier 1 — Map & location foundation

## Intent

Make the Plan map feel as premium as the Guide minimap, and make **every** stop mappable — without turning the map into a navigation surface.

## 1a. Restyle `TripMapView` to the minimap aesthetic

Bring `trip/TripMapView.tsx` to the `trip/guide/StopMinimap.tsx` design language:

- **Claret token pins** using `var(--sig-btn)` with a drop-shadow, in place of the current hardcoded `#8b2942` + per-day HSL ramp. For the **single-day** scope (the default Plan view) use the claret signature; for the **"all days" overview** keep a *muted, tasteful* per-day differentiation (low-saturation, not the current vivid HSL) so multi-day overviews stay legible.
- **Hidden chrome:** drop the visible `zoomControl` (the minimap hides it); keep `attributionControl: false` and `scrollWheelZoom: false` as today. Pinch/zoom + buttons-on-demand match the minimap's calm feel.
- **Refined path:** the route polyline adopts the minimap's softer treatment (claret, rounded caps, gentle dash) rather than the current heavy solid/dashed lines. Lines remain **straight point-to-point** (see 1c — no OSRM).
- Keep the existing responsive single-instance lifecycle, `ResizeObserver` reflow, escaped popups, and the distinct gold-glyph **Stay** pin.

This is the "queued sub-task" from `handoff.md`, folded in here.

## 1b. Remove the "navigate the user" affordances

Per the locked principle (*the map orients, never navigates*), remove the surfaces that imply Voyager is a maps app:

- **`StopDetail.tsx`:** remove the **"Navigate"** button (currently deep-links to `google.com/maps`) and the **Google static-map peek** (`staticmap.openstreetmap.de` image that links into Google Maps). Replace the peek with a small **non-interactive orientation thumbnail** consistent with the minimap look (or simply the pin context already shown in the Plan map), and drop the external nav CTA entirely.
- No other tab gains a navigation control. (Guide already hands off via its own "Directions" action — unchanged and out of scope here.)

**Locked (owner-approved):** the Plan tab keeps **no** "open in external maps" escape hatch. **Plan = designing, Guide = executing**; Guide retains its single Directions hand-off. Clear mental model, no navigation surface in Plan.

## 1c. Real coordinates via a geocoder fallback (gap B)

When a place is added or relocated and **no finite coordinates are present** (typed-by-name, or the model omitted lat/lng), resolve coordinates from a free geocoder so the stop still earns a map pin and walk-time connectors.

- **Shared platform helper `lib/geocode.ts`** (NOT `trip/geocode.ts`) — location resolution is a **platform utility, not a Plan utility**. The same data-model-many-lenses principle applies to location: Plan, Guide, destination search, the parked photo→landmark feature, and the future shared-location cache will all want it. `geocodePlace(query, near?) → { lat, lng, address? } | null`. Uses a free, key-less forward geocoder (**Photon** — already used by the new-trip destination autocomplete, `components/DestinationInput.tsx` — for consistency; Nominatim as the documented alternative). Biases the query with the trip destination (`destinationOf(trip)`) for disambiguation. Pure network boundary; never throws (returns `null` on miss/error). Unit-tested with mocked fetch.
- **Coordinate provenance (additive) — origin vs. edit-history kept separate:** stamp `stop.coordinateSource?: 'ai' | 'geocoder'` to record *where the numbers originated* (model-supplied vs. a Photon fill), and — **distinctly** — `stop.locationEditedAt?: string` (ISO timestamp) when a user manually relocates. These answer two different questions: *"where did these coordinates come from?"* vs. *"has a human touched this stop?"*. Conflating them into a `'user'` source loses the origin the instant a user nudges a stop, and breaks entirely after an AI→move→move→geocoder sequence. Both optional, no migration; stamped at the single mapping site (`location.ts:placeFromSuggestion`/`applyLocation`) so each is set in exactly one place. Invaluable for tracing "this stop is pinned in the wrong city."
- **Wiring:** `location.ts:placeFromSuggestion` and `applyLocation` stay the single source of the "suggestion → location" mapping. `AddStop.addStop` / `addTyped` and `ChangeLocation.pickTyped` call `geocodePlace` **only when coords are absent**, then merge the resolved coords (+ `coordinateSource: 'geocoder'`) before saving. AI-provided coords are always preferred (no extra call). Geocoding is **fire-and-forget-friendly** — it may resolve after the stop is saved, then patch immutably (same pattern as the existing landmark-photo backfill in `AddStop`).
- **Stale-write guard (last-write-wins, explicit):** an async geocoder result may patch a stop **only if** the stop *still lacks coordinates* **and** *still matches the unresolved location query that initiated the lookup* (same name/address). If the user relocated the stop — or it otherwise gained coords — while the lookup was in flight, the result is **discarded**. This kills the race: create → geocoder starts → user relocates → geocoder returns → stale result clobbers the user's choice.
- **No coords + geocoder miss** stays graceful exactly as today (the "No map pin for this one yet" copy in `ChangeLocation`, no connector in `StopList`).

**Walk times stay haversine.** Per the approved decision, we do **not** add OSRM. The existing `walk.ts` (calibrated, tested, offline-friendly) remains the engine for connector times; the map draws clean straight lines. This fits "not Google Maps", serves the future offline/PWA goal, and adds no rate-limited dependency.

---

# Tier 2 — AI planning power

> Depends on **Phase 0** (AI must be confirmed live). The reliability work that previously lived here is now Phase 0.

## 2a. "Optimize this day" — deterministic-first, AI breaks ties

**Architecture: the deterministic optimizer runs first; the AI only refines.** This is the most important architectural choice in Tier 2 — it works offline eventually, works when AI is unavailable, and is predictable, cheaper, and easier to test.

Flow:
1. **Deterministic optimizer** proposes an order from signals already on the data — **locked anchors** stay fixed (a reservation time, or a completed stop), then **geographic clustering** (haversine proximity via `walk.ts`), **stop duration**, and **meal timing** (eat-kind stops near mealtimes). Pure, fully unit-tested, no network.
2. **AI tie-break only:** the model receives *the current order* and *the deterministic proposed order* and is asked to improve **only if necessary** — never inventing, deleting, or relocating stops, always respecting the locked anchors. If AI is unavailable or unchanged, the deterministic result stands.

Applied immutably via `save`, `completed` keys remapped (reuse `itinerary-helpers.remapCompletedAfterReorder`). Edit-gated.

## 2b. "What should I book?" — with confidence + reason

Scans the itinerary and flags stops that **typically need a reservation** (timed-entry museums, popular restaurants, shows, ferries…). Each flag carries an **additive** `stop.bookingRecommendation?: { confidence: 'high' | 'medium' | 'low'; reason: string }` so the UI can explain itself — e.g. *"Likely requires booking — popular timed-entry museum"* — rather than feeling like an unexplained magic verdict. The user accepts a flag → it becomes a `reservation: { status: 'to_reserve' }` on that stop (reuses `reservation.ts`; no new object type), surfaced in Plan and the Trip tab's reservation lists (already wired to the same field). Edit-gated.

## 2c. Stop-duration suggestions

A per-stop "suggest a typical visit time" that fills `stop.duration` (rule-based fallback by type when AI is unavailable, mirroring legacy). Additive field; edit-gated. Feeds the Tier 3 day-utilization summary.

## 2d. Traveler context in planning prompts

A per-trip **traveler context**, stored in `config` (additive), folded into the **planning** prompts (`suggest.ts` suggestions, optimize-day, what-to-book) so output is tailored.

- **Exposed now:** a single freeform field `config.travelerContext?: string` (e.g. *"2 adults, foodies, hate crowds, moderate walking"*).
- **Structured room left for later (not surfaced now):** the data model also reserves `config.travelerProfile?: { groupSize?: number; pace?: string; accessibility?: string }`. We don't build UI for it yet, but leaving the shape means future prompts can use structure instead of re-parsing freeform text — which degrades into garbage quickly. Additive, no migration.

> **Boundary that protects the future location cache:** traveler context personalizes **planning** prompts only. It must **never** be folded into the encyclopedic **enrichment** prompt (`enrich.ts`), which stays trip-agnostic so a future shared per-location cache (Future Work) remains valid.

**Stretch (decide at plan stage):** multi-day optimize (cluster by location, balance museums/meals across days). Larger prompt + UX surface; not required for this tier to ship.

---

# Tier 3 — Stop content & day structure

## 3a. Fix the Story / Interesting Facts / Experience enrichment

**Diagnosis (why Voyager's output is sparse/empty vs. travel-guide.ai):** the port over-corrected toward anti-hallucination. Three root causes, plus a display bug:

1. **Token budget slashed.** Legacy used `max_tokens: 2500`; Voyager's `enrich.ts:185` passes `700` — at/under the real content size, so longer history truncated mid-JSON and the parse failed.
2. **"Leave the section EMPTY if unsupported."** `enrich.ts:102–105` explicitly instructs empty output when Wikipedia/solid knowledge doesn't back it. Legacy never did — it writes for any place. Small/local stops come back blank.
3. **Wikipedia made an authoritative gate.** `enrich.ts:88–93` injects the extract as "treat as authoritative facts" and gates generation on it; thin Wikipedia → thin output.
4. **Field-duplication display bug.** The one prompt returns **both** `facts[]` (array) and `notice` (string) for the *same* "Interesting Facts" idea. **Plan `StopDetail` renders only `facts[]`; Guide `StoryTabs` renders only `notice`.** So on either surface, half of what the model generated is silently dropped.

**Fix (locked decisions):**

- **`maxTokens` 700 → 2000.** Output for "2–3 short paragraphs + ~4 facts + a short experience" is ~450–700 tokens, so 2000 is comfortable headroom with **no truncation risk** (a high ceiling never forces longer text; you only pay for tokens generated).
- **Keep Sonnet** (`claude-sonnet-4-6`) — already the default in `ai.ts:13`; `enrich.ts` doesn't override it. Right quality/speed/cost balance for per-stop generation.
- **Grounding rule rewrite:** replace "leave empty if unsupported" with *"Always write something useful for every section. When less certain, keep it shorter and stick to what's well-established — but never invent specific dates, names, or numbers."* Preserves the no-fabrication guard while guaranteeing non-empty, useful prose.
- **Wikipedia stays in context as background, not a gate.** Reframe the source block from "treat as authoritative facts" to "use as helpful background, plus your own well-established knowledge." Keeps grounding when present; never blocks generation when thin/absent.
- **One prompt, strict JSON** (unchanged structure) — coherent set in one call; the robust brace-slice parser (`parseStopDetail`) stays, and the token bump removes the truncation that was breaking it.
- **Merge `facts[]` + `notice` into ONE canonical Interesting-Facts field.** Keep **`facts[]`** (array → bullets; matches legacy's 4-fact list), **drop `notice`** from the prompt and the generated shape. **Render `facts[]` identically in Plan `StopDetail` and Guide `StoryTabs`** (Guide maps the array to its tab body instead of reading the `notice` string). **Back-compat:** on read, fall back to the legacy `notice` string when `facts[]` is empty, so already-enriched stops keep their content.

Because `enrich.ts` is **shared** by Plan and Guide, this fix lands in both surfaces at once. The fix is covered by updates to `enrich.test.ts` (prompt rules, parsing, the facts/notice back-compat fallback) and a render check that both surfaces read the same field.

## 3b. Richer enrichment fields (gap D)

Add to the enrichment shape (additive, all optional): **opening hours** (`hours?: string`), **price level**, and a **"good for"** tag (`goodFor?: string`, e.g. "Romantic dinner", "Architecture lovers"). Generated by the same single prompt (extends the JSON schema), rendered as compact metadata chips on `StopDetail` (and available to Guide). Subject to the same "shorten/skip when unsure, never fabricate" rule — these may legitimately be empty.

**Price is a normalized enum, not a free string:** `price?: '$' | '$$' | '$$$' | '$$$$'`. The prompt asks for one of those tokens, and `parseStopDetail` **normalizes on the way in** — mapping common variants ("cheap"/"budget" → `$`, "moderate" → `$$`, "expensive"/"luxury" → `$$$$`, stray words → dropped) to the canonical symbols so the chip renders consistently forever. Anything unmappable becomes empty rather than arbitrary text. (Avoids the `"$"` / `"Cheap"` / `"Luxury"` mess that makes consistent rendering impossible later.)

## 3c. Per-stop hourly weather

`StopDetail` gains an hourly weather strip for the stop's day/time (Open-Meteo, same source as the per-day `WeatherGlance`), shown only when the stop has coords and the day has a date. Cached per coord+date like the existing weather path; never persisted into trip data.

## 3d. Day utilization summary

Once `stop.duration` exists (Tier 2c), surface a cheap, high-value glance per day: **"4 stops · ~6h planned"**, with a gentle **overloaded** cue past a threshold (e.g. >10–12h). It makes the duration data and Optimize-this-day tangible — you can *see* a day is overstuffed. Pure derived value (sum of stop durations with a sensible default per kind when a stop has none), shown in the day header / `DayRail`. No new persisted data. Reduced-motion friendly, token-themed.

## 3e. Day management (gap E)

`DayRail` is currently read-only. Add edit-gated controls to:
- **Add a day** (append), **remove a day** (with confirm), **reorder days** (dnd-kit, consistent with stop reorder).
- **Edit day title and note** (`day.title`, `day.note` already exist on the `Day` shape; `config.dayTitles`/`dayLabels` remain the label source).
- All mutations immutable via `save`. UI: add/reorder/edit affordances live in the day rail / a small day-settings sheet, in Voyager's token theming, ≥44px targets, focus-trapped sheet, reduced-motion friendly. View-only users see days but no controls.

### Day Reorder Invariants (audit — must hold after add / remove / reorder)

Day-index churn is the regression risk here. Every mutation must preserve all of these, each with a dedicated test:

1. **`completed` keys** — keys are `"<dayIndex>-<stopIndex>"`; remap them. Extend `itinerary-helpers` with tested **day-level** remappers mirroring the existing stop-level ones (`remapCompletedAfterReorder/Delete`).
2. **Reservations** — verified **safe**: reservations live *on the stop* (`stop.reservation`), not keyed by day index, so they travel with the stop automatically. The audit records this explicitly so a future change doesn't silently introduce day-indexed reservation state.
3. **Selected day stability** — the lifted `activeDay` (in `PlannerLayout`, mirrored to `?day=N`) must follow the *same day* across a reorder/insert/delete, not a stale index (e.g. viewing Day 3 when Day 2 is removed shouldn't silently jump to a different day's content).
4. **Weather cache** — must be keyed by **coord + date**, never by day index (per-day dates are derived by position from `config.startDate`, so a reorder changes which date a position maps to). Confirm `WeatherGlance`'s cache key is position-independent; fix if not.

The invariants section exists so these are explicitly tested rather than discovered as regressions.

---

## Data model (all additive JSONB — no migration)

- `Stop` gains (all optional): `duration?` (2c — already in the type), `hours?: string`, `price?: '$' | '$$' | '$$$' | '$$$$'` (normalized enum — see 3b), `goodFor?: string` (3b), `coordinateSource?: 'ai' | 'geocoder'` (**origin only** — 1c), `locationEditedAt?: string` (ISO timestamp of a manual relocate — **edit history, distinct from origin** — 1c), `bookingRecommendation?: { confidence: 'high' | 'medium' | 'low'; reason: string }` (2b). `notice?` is **deprecated** (still read for back-compat; no longer written).
- `TripConfig` gains: `travelerContext?: string`, and — reserved, not surfaced yet — `travelerProfile?: { groupSize?: number; pace?: string; accessibility?: string }` (2d).
- `Day.title?` / `Day.note?` are already in the shape; day management just makes them editable.
- Back-compat reads preserved everywhere (`stop.booking`, string `hotel`, missing `config`, legacy `notice`).

## Anti-slop & a11y (applies to every surface touched)

lucide icons only (no emoji); token classes (`bg-base`, `text-muted`, `border-hair`, `bg-sig-btn`, `--sig`/`--gold`) — no theme-breaking hex; Fraunces/General Sans/JetBrains Mono per role; ≥44px targets; `aria-*` on icon buttons; labelled inputs; focus rings; focus-trap + esc + restore on sheets; `prefers-reduced-motion`; no layout-shift hover (color/opacity only). Photography stays primary; maps/metadata are secondary glances.

## Testing

- **Pure logic unit-tested (vitest):** `lib/geocode.ts` (mocked fetch, miss/error → null), coordinate-provenance stamping (origin vs. `locationEditedAt`), and the **stale-write guard** (an in-flight geocoder result is discarded after a relocate); enrichment prompt/parse changes incl. facts/notice back-compat **and price normalization** (`enrich.test.ts`); the **deterministic** optimizer (ordering + locked-anchor respect, independent of AI); what-to-book selection + confidence shape; day-utilization sum; **day-level remappers + the four Day-Reorder Invariants** (completed keys, reservation-travels-with-stop, selected-day stability, position-independent weather key).
- **Render checks:** Plan `StopDetail` and Guide `StoryTabs` read the same `facts[]`; navigation affordances removed from `StopDetail`.
- The full suite (~526 today, growing with new tests) must stay green; `npx tsc -b` clean; `npm run build` succeeds before each deploy.

---

## Out of scope / parked / future

- **Parked — Photo→landmark vision identification (gap F):** big single feature; revisit after this initiative, with a Plan-vs-Guide placement decision.
- **Out — GPS live auto-discovery walking tour:** Guide's domain (partially shipped); not a Plan feature.
- **Out — Trip story / blog generator, JSON export/import:** a separate share concern / superseded by Supabase sharing.
- **Out — turn-by-turn / in-app navigation:** violates the orientation-not-navigation principle.
- **Future Work (NEXT batch, not built here) — shared per-location enrichment cache:** keyed by `wikiTitle` / normalized name+coords, storing a **trip-agnostic** canonical enrichment so the same landmark across trips/users is generated once. Per-trip per-stop caching already exists (enrichment persists onto the stop and is reused; AI runs once per stop or on explicit re-generate). The shared cache is an additional cost optimization with its own storage/keying/versioning logistics — specced separately. Tier 2's traveler-context boundary (2e) is designed now to keep that cache valid later.

## Open questions resolved

- **OSRM vs. haversine (Tier 1):** **Resolved — no OSRM.** Restyle + haversine walk times + straight lines.
- **External "open in maps" on Plan:** **Resolved — removed** (owner-approved). Plan = designing, Guide = executing.
- **Optimize-day architecture (Tier 2):** **Resolved — deterministic-first, AI breaks ties.**
- **Geocoder home:** **Resolved — `lib/geocode.ts`** (shared platform utility, not Plan-local).
- **Multi-day optimize (Tier 2):** **stretch**, decided at plan stage.

## Build sequencing (recommended)

1. **Phase 0** — AI-reliability verification + `handoff.md` + operator runbook (cheap; gates every AI feature).
2. **Tier 1** — map restyle + de-navigation + shared geocoder + coordinate provenance.
3. **Tier 3** — enrichment fix first (highest ROI, most visible), then richer fields, per-stop weather, day-utilization summary, day management (with the reorder-invariants audit).
4. **Tier 2** — planning assists (once AI confirmed live): deterministic-first Optimize Day, What-to-Book (with confidence), durations, traveler context.

Each phase/tier → its own writing-plans implementation plan → subagent-driven-development → commit per task → push `origin/main` → deploy.
