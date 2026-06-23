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

| Tier | Theme | Ships |
|---|---|---|
| **1** | Map & location foundation | Restyle `TripMapView` to the Guide-minimap aesthetic (orientation, not navigation); remove the "navigate the user" affordances; **real coordinates via a geocoder fallback** so typed / AI-coordless stops still map and get walk times |
| **2** | AI planning power + reliability | **Root-cause + document the AI break** (works on travel-guide.ai, 403 on Voyager); then "Optimize this day", "What should I book?", stop-duration suggestions, traveler-context in planning prompts |
| **3** | Stop content & day structure | **Fix the Story / Interesting Facts / Experience enrichment** (richness regression + a field-duplication bug); richer enrichment fields (hours / price / "good for"); per-stop hourly weather; **day management** (add / remove / reorder days, edit titles & notes) |

**Parked (not now):** photo→landmark vision identification (legacy gap F).
**Next batch (after this one):** a shared per-**location** enrichment cache — noted under Future Work, *not* built here.
**Explicitly out of scope:** GPS live auto-discovery walking tour (Guide's domain, partially shipped), trip story / blog generator, JSON export/import, any turn-by-turn / in-app navigation.

The three tiers are independent enough to spec, build, and ship in sequence. Recommended order: **Tier 2's AI-reliability investigation first** (cheap, unblocks Tiers 2 & 3), then **Tier 1**, then **Tier 3**. Each tier is demoable on its own.

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

> *Open confirmation for the plan stage:* whether to keep **any** "open in external maps" escape hatch at all. Default decision for this spec: **remove it from Plan** — the Plan tab is for building, not navigating. Guide retains its single Directions hand-off.

## 1c. Real coordinates via a geocoder fallback (gap B)

When a place is added or relocated and **no finite coordinates are present** (typed-by-name, or the model omitted lat/lng), resolve coordinates from a free geocoder so the stop still earns a map pin and walk-time connectors.

- **New helper `trip/geocode.ts`** — `geocodePlace(query, near?) → { lat, lng, address? } | null`. Uses a free, key-less forward geocoder (**Photon** — already used by the new-trip destination autocomplete, `components/DestinationInput.tsx` — preferred for consistency; Nominatim as the documented alternative). Biases the query with the trip destination (`destinationOf(trip)`) for disambiguation. Pure network boundary; never throws (returns `null` on miss/error). Unit-tested with mocked fetch.
- **Wiring:** `location.ts:placeFromSuggestion` and `applyLocation` stay the single source of the "suggestion → location" mapping. `AddStop.addStop` / `addTyped` and `ChangeLocation.pickTyped` call `geocodePlace` **only when coords are absent**, then merge the resolved coords before saving. AI-provided coords are always preferred (no extra call). Geocoding is **fire-and-forget-friendly**: if it resolves after the stop is saved, patch the stop immutably (same pattern as the existing landmark-photo backfill in `AddStop`).
- **No coords + geocoder miss** stays graceful exactly as today (the "No map pin for this one yet" copy in `ChangeLocation`, no connector in `StopList`).

**Walk times stay haversine.** Per the approved decision, we do **not** add OSRM. The existing `walk.ts` (calibrated, tested, offline-friendly) remains the engine for connector times; the map draws clean straight lines. This fits "not Google Maps", serves the future offline/PWA goal, and adds no rate-limited dependency.

---

# Tier 2 — AI planning power + reliability

## 2a. FIRST: root-cause and document the AI break

Every AI feature (suggestions, enrichment, and all of Tier 2) depends on the `ai-proxy` edge function, which **works on travel-guide.ai but 403s on Voyager**. The standing theory (`handoff.md` → "Backend / AI status"): the **`ai-proxy` slug has the trip-invite *emailer* deployed instead of the Claude proxy**, so an AI request has no `trip_id`, the trip lookup fails, and it returns `403` — no Anthropic call ever happens.

Task: **confirm the root cause** (probe the deployed slug / inspect logs), then **expand `handoff.md`** with a clear, current explanation and the exact operator remediation:
1. Deploy the real Claude proxy (`supabase/functions/ai-proxy/index.ts`) to the `ai-proxy` slug on project `wnpanbjzmcsvhfyjdczv`.
2. Set the `ANTHROPIC_API_KEY` secret.
3. Ensure the owner's `profiles.role = 'founder'` (the gate: founder = unlimited, `credits > 0` = 1/call, else 403).

The client (`ai.ts:callAI`) is already correct — nothing changes client-side. This sub-task is **investigation + documentation + operator steps**, not new app code, and it gates the rest of Tier 2/3 AI behavior at runtime.

## 2b. "Optimize this day"

A per-day action that asks the AI to reorder the day's stops into a sensible geographic/time flow, **respecting locked stops** (anything with a reservation time, or marked done). Returns a new order only; never invents, deletes, or relocates stops. Applied immutably via `save`, with `completed` keys remapped (reuse `itinerary-helpers.remapCompletedAfterReorder`). Pure ordering logic lives in a tested helper; the AI call is a thin boundary. Edit-gated.

## 2c. "What should I book?"

An action that scans the itinerary and flags stops that **typically need a reservation** (timed-entry museums, popular restaurants, shows, ferries…), surfacing them as suggested `reservation: { status: 'to_reserve' }` additions the user can accept. Reuses the existing reservation model (`reservation.ts`) — no new object type. Surfaced in Plan and reflected in the Trip tab's reservation lists (already wired to the same field).

## 2d. Stop-duration suggestions

A per-stop "suggest a typical visit time" that fills `stop.duration` (a rule-based fallback by type when AI is unavailable, mirroring legacy). Additive field; edit-gated.

## 2e. Traveler context in planning prompts

A per-trip free-text **traveler context** (group size, pace, dietary/accessibility notes), stored in `config` (additive), folded into the **planning** prompts (`suggest.ts` suggestions, optimize-day, what-to-book) so output is tailored.

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

Add to the enrichment shape (additive, all optional): **opening hours**, **price level** (`$`–`$$$$`), and a **"good for"** tag (e.g. "Romantic dinner", "Architecture lovers"). Generated by the same single prompt (extends the JSON schema), parsed by `parseStopDetail`, rendered as compact metadata chips on `StopDetail` (and available to Guide). Subject to the same "shorten/skip when unsure, never fabricate" rule — these may legitimately be empty.

## 3c. Per-stop hourly weather

`StopDetail` gains an hourly weather strip for the stop's day/time (Open-Meteo, same source as the per-day `WeatherGlance`), shown only when the stop has coords and the day has a date. Cached per coord+date like the existing weather path; never persisted into trip data.

## 3d. Day management (gap E)

`DayRail` is currently read-only. Add edit-gated controls to:
- **Add a day** (append), **remove a day** (with confirm), **reorder days** (dnd-kit, consistent with stop reorder).
- **Edit day title and note** (`day.title`, `day.note` already exist on the `Day` shape; `config.dayTitles`/`dayLabels` remain the label source).
- All mutations immutable via `save`, and must **remap `completed` keys** (which are `"<dayIndex>-<stopIndex>"`) when days are added/removed/reordered — extend `itinerary-helpers` with tested day-level remappers mirroring the existing stop-level ones.

UI: the add/reorder/edit affordances live in the day rail / a small day-settings sheet, in Voyager's token theming, ≥44px targets, focus-trapped sheet, reduced-motion friendly. View-only users see days but no controls.

---

## Data model (all additive JSONB — no migration)

- `Stop` gains (all optional): `duration?` (2d — already in the type), `hours?: string`, `price?: string`, `goodFor?: string`. `notice?` is **deprecated** (still read for back-compat; no longer written).
- `TripConfig` gains: `travelerContext?: string` (2e).
- `Day.title?` / `Day.note?` are already in the shape; day management just makes them editable.
- Back-compat reads preserved everywhere (`stop.booking`, string `hotel`, missing `config`, legacy `notice`).

## Anti-slop & a11y (applies to every surface touched)

lucide icons only (no emoji); token classes (`bg-base`, `text-muted`, `border-hair`, `bg-sig-btn`, `--sig`/`--gold`) — no theme-breaking hex; Fraunces/General Sans/JetBrains Mono per role; ≥44px targets; `aria-*` on icon buttons; labelled inputs; focus rings; focus-trap + esc + restore on sheets; `prefers-reduced-motion`; no layout-shift hover (color/opacity only). Photography stays primary; maps/metadata are secondary glances.

## Testing

- **Pure logic unit-tested (vitest):** `geocode.ts` (mocked fetch, miss/error → null), enrichment prompt/parse changes incl. facts/notice back-compat (`enrich.test.ts`), optimize-day ordering + locked-stop respect, what-to-book selection, day-level `completed` remappers.
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
- **External "open in maps" on Plan:** default **removed**; confirm at plan stage.
- **Multi-day optimize (Tier 2):** **stretch**, decided at plan stage.

## Build sequencing (recommended)

1. **Tier 2a** — AI-reliability investigation + handoff.md (cheap; unblocks all AI behavior).
2. **Tier 1** — map restyle + de-navigation + geocoder fallback.
3. **Tier 3** — enrichment fix first (most visible), then fields, per-stop weather, day management.
4. **Tier 2b–2e** — planning assists (once AI confirmed working).

Each tier → its own writing-plans implementation plan → subagent-driven-development → commit per task → push `origin/main` → deploy.
