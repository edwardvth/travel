# Voyager Home — Context-Driven Redesign (Design Spec)

- **Date:** 2026-06-24
- **Status:** Approved + revised after design review (three independent reviews converged) — ready for implementation planning
- **Branch:** `dashboard-redesign`
- **Supersedes:** the first-pass bento dashboard already on this branch (its gallery/tile work is **reused**, not discarded — see §11)

---

## 1. Problem

The logged-in home page lists trips as photo cards. It reads as a **trip directory**, not a **home** — but Voyager is a deliberately thin app (sit down, plan a trip, leave), so a heavy SaaS dashboard would be fake. We still need a place to see and open trips. This spec answers: *what should the home page do, and what belongs in it?*

## 2. Decision (north star)

**The home page adapts to the user's mindset, derived from existing trip data:**

- **State B — Active home ("cockpit"):** an upcoming trip exists → *"help me reconnect with my next journey."*
- **State C — Launchpad:** no upcoming trip (past-only or brand-new) → *"help me start imagining the next one."*

These are two **intentions**, not two layouts. The split rides existing `splitTrips`/`isPastTrip` — no new data, honoring *one data model, many lenses* and YAGNI (surface only what the thin app can already back).

## 3. Goals / Non-goals

**Goals**
- A premium, calm, **editorial** home — never a productivity dashboard.
- Give someone with an upcoming trip a reason to open the app *between* sessions.
- Make "start a trip" feel like one thought (the command pill).
- Equal craft on mobile and desktop.

**Non-goals**
- No global Plan/Guide/Trip nav (those stay per-trip).
- No new backend. No metrics, counts, streaks, or invented features.
- Not a redesign of planner/Guide/Trip.

## 4. The focus trip — `selectFocusTrip(trips)`

State B needs *one* trip to focus on. This is a **pure, testable function**, not inlined `upcoming[0]`, because the heuristic will evolve and the naive version is wrong (a dateless trip sorts as far-future; a trip happening *right now* should beat one that merely starts sooner on paper).

**Precedence:** `active (start ≤ today ≤ end)` → `soonest dated upcoming` → `undated upcoming` → `null`.

`null` (no upcoming) selects **State C**. Everything else selects **State B** with that trip.

## 5. State B — Active home (cockpit)

### 5.1 What the cockpit IS — and is NOT

- **IS:** a single editorial **trip-overview surface** — *the trip itself, seen from above the day before you leave*, with a few contextual annotations layered onto it.
- **IS NOT:** a dashboard, a grid of independent widget cards, a metrics panel, or a to-do app. **There is one card.** Everything else is an annotation *on* it, never a sibling tile competing for attention.

> Rule: if you can describe the cockpit as "N cards," it's wrong. It is one surface plus a status line.

### 5.2 The surface + its annotations (hierarchy & grouping contract)

Ranked, with actionable vs informational called out:

1. **Identity — the surface itself** *(informational + PRIMARY action).* Cover photo, serif name, date range. **The entire card is tappable → opens the trip to Plan.**
2. **Countdown — an eyebrow on the cover** *(informational).* "In 7 days" / "Day 3 of 18." The emotional anchor; not a module.
3. **Readiness line — one horizontal status string** layered on the cover, hairline-separated, a *single visual unit*: e.g. **"Day 1 · 3 to arrange · 28°."** Contains:
   - **Day preview** *(informational)* — "Day 1" before, "Today" during.
   - **Still to arrange** *(ACTIONABLE — the one secondary deep-link → the trip's Trip view).* Count of un-reserved stops (`allReservations`, status `to_reserve`).
   - **Weather** *(informational, decorative)* — inline glyph + temp (`useWeather`/`WeatherGlance`).
4. **Trip spark — optional evocative line on the cover** *(informational).* A trip note or "first stop: Republic Square." Keeps the surface editorial, not operational. Ship light or omit; never required.

**Dropped from v1:** the planning-**progress** bar/text. Three reviews converged that it tips the cockpit "operational," and "still to arrange" already carries the planning signal. Re-evaluate only if testing shows people miss it. (Decision: **A**, 2026-06-24.)

**Desktop** may expand the readiness line into a single **attached panel** (shared container, internal hairline dividers) that reads as *part of the trip card* — never floating tiles. **Two actions total** on the whole surface: card→Plan (primary), "still to arrange"→Trip (secondary). No third tap target.

### 5.3 Render states (driven by `tripPhase`) + graceful degradation

| | **Unplanned upcoming** (no stops) | **Before** (planned) | **During** (active) |
|---|---|---|---|
| Countdown | "In N days" | "In N days" | **"Day N of M"** |
| Body | **"Start planning →"** primary nudge; *no readiness line* | full readiness line | readiness line, **today** dominant |
| Day preview | — | Day 1 | **Today** |
| Weather | dates forecast (if geo) | dates forecast | **today's** conditions |
| Still to arrange | — | visible, actionable | only if items remain, else gone |

**Graceful omission (every annotation is optional and reflows when absent — the cockpit never shows an empty slot):**
- No dates (`startDate` empty) → no countdown; show "Add dates."
- No resolved geo (`destinationGeo`) → no weather.
- No reservations → no "to arrange."
- After the trip ends it leaves `upcoming` → drops to the Past gallery automatically (no post-trip cockpit).

The **unplanned** state matters because the pill creates *empty* trips that instantly become the focus trip (see §7). The common early case must look intentional, not like a dashboard of nothing.

### 5.4 Mobile collapse (explicit priority ladder)

No standalone widget cards on mobile. In order:
1. Cover + name + countdown — **dominant** (~55–60% of the first viewport).
2. **One** readiness line (wraps to max two lines).
3. "Still to arrange" is the **only** element allowed to be its own tappable affordance.
4. Weather → inline glyph + temp inside the line, never a card.
5. (Progress already dropped.)

### 5.5 Below the cockpit

The trip **gallery** (the bento/`TripTile` work already on this branch) with the Upcoming/Past segmented toggle and its tab-switch animation. Reused, not rebuilt.

## 6. State C — Launchpad

Shown when `selectFocusTrip` returns `null`. Reuses the landing page's DNA (editorial headline + destination entry) with a bespoke ambient background and the new creation flow.

- **Hero:** eyebrow "PLAN · WALK · REMEMBER", serif "Where to next?", subcopy, the **command pill** (§7) centered, over the **field-globe background** (§8, optional — static fallback by default).
- **Below — "Past voyages":** the trip gallery for past trips.
- **Empty-state strategy (resolved):**
  - **Brand-new (`trips.length === 0`):** show the **Plan / Walk / Remember** value trio beneath the hero — the lone pill is too cold an introduction for someone who's never seen the product.
  - **Past-only (`past.length > 0`):** **hide the trio** (condescending to a returning user); lead with "Past voyages." Headline "Where to next?" still works.

## 7. Trip creation — progressive command pill

Today's `NewTripSheet` (2-step sheet: "Where to?" → "When are you going?") is re-imagined as a single evolving pill and becomes the app's **sole** creation flow.

### 7.1 Interaction model
1. **Intent:** centered "Where to?"; user types a destination (reuses `DestinationInput` autocomplete). Pill expands *horizontally in place* → `Kyoto   When?`. Never a row of fields.
2. **Dates:** focusing "When?" lifts the pill and opens an **anchored range calendar** below, still centered. First click = start, second = end; soft range band, gold/claret hover. Snaps closed on completion.
3. **Confirm:** `Kyoto   Jul 14 → Jul 18   ✓`, restrained success pulse; commit on Enter/tap or short auto-advance.
4. **Materialize → the planner.** *(Resolved — all three reviews agreed.)* The pill morphs (seed-card animation allowed) and lands in the **planner** (Plan view of the new trip, ready for Day 1). Rationale: the user just expressed intent to *plan*; the trip is empty, so a fresh cockpit would render the hollow "unplanned" state. The cockpit is something a trip **earns by being planned** — next visit, this now-populated upcoming trip drives State B. Commit goes through existing `useCreateTrip`.

### 7.2 Guardrails
- Never a multi-row form; always a single centered evolving sentence.
- Calendar belongs to the sentence, not the page (attached, not modal-heavy).
- Motion implies physics (breathing expand, soft elasticity, gentle snap) — not panel slides or wizard steps.
- **The pill's animation quality is the magic layer**; if weak, it feels like flight-booking software. Built deliberately in its own phase.

### 7.3 Two mounts, global replacement
Same component, two modes: **inline** (State C hero) and **command-overlay** (summoned elsewhere — page dims behind a scrim, optional faint field-globe behind for continuity, pill animates to center; Cmd-K-style).

| Entry point | After |
|---|---|
| "+ New trip" header button | command-overlay pill (State C: focuses the hero pill instead) |
| In-gallery "add trip" tiles | command-overlay pill |
| State C launchpad hero | **inline** pill (primary surface) |
| `NewTripSheet` | **retired / deleted** |
| `useCreateTrip` | **kept** — the pill commits through it |

All triggers go through a single **`openCreateTrip(prefill?)`** indirection introduced in Phase 1 (routes to `NewTripSheet` in P1, to the pill/overlay in P3) so retiring the sheet touches one place, not every call site.

## 8. Field-globe shader (State C background — OPTIONAL enhancement)

A non-literal fragment-shader **atmosphere** — never a recognizable globe/map; a sense of global travel through light, noise, flow. **Strictly subordinate** to pill, headline, gallery.

**Status: optional, gated on Phase 1 proving the launchpad works on headline + pill + typography + spacing alone.** It must **never block shipping**; the spec's own success test is "users don't comment on it." Built behind a `<HomeBackground variant>` boundary; the **static fallback** (low-opacity gradient + faint noise) is the default and the reduced-motion / no-WebGL path.

- Base near-black (`#050507 → #07060A`), edge vignette, optional ~2–4% claret center warmth.
- Curved flow field via sine/cosine UV distortion implying lat/long curvature — **never a full sphere outline**. Low-freq simplex/perlin noise, drift 0.02–0.05.
- Rare bezier route arcs (opacity ≤ 0.05–0.12), soft glow, 8–20s lifecycle, **never >2–3 at once**.
- Near-imperceptible UV rotation (~1 cycle / 2–4 min) blended with noise.
- 2–3 depth layers, minimal parallax. Palette: near-black, desaturated blue-gray, restrained claret, *extremely* rare gold specks. No bright blue/neon/starscape.
- Non-interactive. 60fps mid-range mobile; fragment shader over geometry; limit overdraw (mobile Safari); no heavy post stacks.

## 9. Header (shared, minimal, state-aware)

```
Voyager ◦───────────────── [☀ theme] [+ New trip] [ E account ]
```
Logo = home link; theme toggle; "+ New trip"; account menu. **State-aware "+ New trip":** State B → command-overlay pill; State C → focus the hero pill. Deliberately **no** global search / counts / streaks. **Deferred nicety (not v1):** a tiny "live" dot by the logo during an active trip, linking to the cockpit.

## 10. Phasing

- **Phase 1 — Structure (the product):** two-state home, the **cockpit as a single annotated surface** with its three render states + graceful degradation, `selectFocusTrip`, gallery, state-aware header, `openCreateTrip()` indirection. State C ships with the **static fallback backdrop** and the **existing `NewTripSheet`**. A complete, premium home. *P1 owns the cockpit's final hierarchy — it must not ship a widget stack that P3 has to undo.*
- **Phase 2 — Field-globe shader (OPTIONAL, gated):** swapped in behind the already-present fallback, only if P1 validates the launchpad. Never on the critical path.
- **Phase 3 — Progressive command pill:** pill + range calendar + command-overlay + seed-card→planner materialization; retire `NewTripSheet` (just reroute `openCreateTrip`).

## 11. Components, files & API seams

**New**
- `selectFocusTrip(trips): Trip | null` — pure.
- `cockpitModel(trip): { phase, countdownLabel, dayPreview?, toArrange?, weatherRef?, spark? }` — derived view-model; UI stays dumb, heuristics stay testable/replaceable. *Thin functions, not a configurable "widget registry" — that's the dashboard trap.*
- `Cockpit` (single-surface) + `Launchpad` (State C hero).
- `<HomeBackground variant>` + static fallback (shader in P2).
- `CommandPill` + `RangeCalendar` + seed-card (P3).
- `openCreateTrip(prefill?)` indirection (P1).

**Reused:** bento gallery / `TripTile` (serves "trips below" in B and "Past voyages" in C), `DestinationInput`, `useWeather`/`WeatherGlance`, `allReservations`, `useCreateTrip`, `splitTrips`/`isPastTrip`.

**Retired:** `NewTripSheet` (P3).

## 12. Data shapes

No migrations. All additive / already present: reservations (`stop.reservation`), weather (live fetch from `destinationGeo`), days/stops (`data.days`), dates (`config.startDate`/`numDays`). State + focus selection are pure-derived.

## 13. Accessibility & motion
- `prefers-reduced-motion`: shader → static fallback; pill → eased, no elasticity; tab/cockpit transitions already gated.
- No-WebGL / load failure → static fallback (same path).
- Command-overlay: focus-trap + Esc + focus restore (matches `Sheet`). ≥44px targets, aria on icon-only controls, labelled pill input.
- No layout shift; reserve space / fade.

## 14. Testing
- Unit: `selectFocusTrip` precedence (active / soonest-dated / undated / none); `cockpitModel` derivations per phase incl. **degraded** inputs (no dates, no geo, no stops, no reservations); pill range logic; create still routes through `useCreateTrip` (existing tests stay green).
- Visual/perf (shader): manual + a fallback-render test (no WebGL → fallback present).

## 15. Open / deferred decisions
- **State C past-only headline/copy** variant (vs brand-new) — defer to P1 build.
- **Multiple simultaneously-imminent trips** beyond the active>soonest rule — defer.
- **Cockpit "then…" teaser** for a second upcoming trip — defer.
- **Trip-spark** exact content (note vs first stop vs cover focus) — defer; optional in v1.
- **Logo "live" dot** — defer.
- Shader parameter tuning, calendar styling, seed-card curve — defer to their phases.

## 16. Success criteria
- A user with an upcoming trip lands on a glanceable, single-surface cockpit they'd open between sessions — not a widget grid.
- A user with no upcoming trip lands on a calm launchpad and can start a trip in one fluid gesture, landing in the planner.
- The home reads as Voyager's front door, not a bare directory.
- The shader (if shipped) is felt, not noticed; the pill feels like the app's signature moment.
