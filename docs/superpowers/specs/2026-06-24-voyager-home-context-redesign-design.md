# Voyager Home — Context-Driven Redesign (Design Spec)

- **Date:** 2026-06-24
- **Status:** Approved (brainstorm) — ready for implementation planning
- **Branch:** `dashboard-redesign`
- **Supersedes:** the first-pass bento dashboard already on this branch (its gallery/tile work is **reused**, not discarded — see §10)

---

## 1. Problem

The logged-in home page lists trips as photo cards. It reads as a **trip directory**, not a **home** — but Voyager is a deliberately thin app (sit down, plan a trip, leave), so inventing a heavy SaaS dashboard would be fake. We still need a place to see and open trips. The question this spec answers: *what should the home page actually do, and what belongs in it?*

## 2. Decision (north star)

**The home page adapts to context.** It is one of two states, chosen by whether the user has an upcoming trip:

- **State B — Active home ("cockpit"):** shown when `upcoming.length > 0`. A live cockpit for the next trip, with the trip gallery below.
- **State C — Launchpad:** shown when `upcoming.length === 0` (past-only, or brand-new). An editorial "Where to next?" hero built around a trip-creation pill over an ambient shader background, with past trips below.

State selection reuses the existing `splitTrips()` / `isPastTrip()` logic. No new data is required for the split.

This honors the project principles: *one data model, many lenses*; *global stuff lives at the home/account level*; and YAGNI (we surface what the thin app can already back, nothing invented).

## 3. Goals / Non-goals

**Goals**
- A home that feels premium and editorial, not a busy dashboard.
- Give people with an upcoming trip a reason to open the app *between* planning sessions (cockpit).
- Make "start a new trip" feel like a signature interaction (the command pill).
- Equal care on mobile and desktop.

**Non-goals**
- No global Plan/Guide/Trip navigation (those remain per-trip).
- No new backend services. Everything here runs on existing data (`trips`, reservations, weather, day/stops).
- Not a redesign of the planner, Guide, or Trip views.

## 4. State B — Active home (cockpit)

The hero becomes a **cockpit for `upcoming[0]`** (the soonest upcoming trip). Tapping the cockpit opens that trip. Below the cockpit sits the **trip gallery** (the bento/tile work already on this branch) with the Upcoming/Past segmented toggle and its tab-switch animation.

### 4.1 Cockpit widgets (confirmed set)

All buildable on existing data — no new backend.

| # | Widget | Content | Data source |
|---|--------|---------|-------------|
| 1 | **Countdown** | "In 7 days" before; "Day 3 of your trip" during. The most home-y signal. | `config.startDate` + `numDays` |
| 2 | **Identity** | Cover photo, serif name, date range, stop count. The hero card itself. | trip + `TripTile` |
| 3 | **Still to arrange** | Count of un-reserved stops; tappable → jumps to the trip's **Trip** view. The one *actionable* nudge. | `allReservations()` (status `to_reserve`) |
| 4 | **Day preview** | Before trip: "Day 1 · Republic Square + 5 stops". During: today's day. Tappable → **Plan**. | `data.days` + `dayStops` helpers |
| 5 | **Weather glance** | Forecast for destination/dates. | `useWeather` / `WeatherGlance` |
| 6 | **Planning progress** | *Positive* framing — "12 of 15 days planned". **Hidden once the itinerary is complete** so it reads as momentum, never a chore/nag. | derived from `data.days` |

Excluded by decision: on-hero quick-action buttons (tapping the card already opens the trip).

### 4.2 Layout
- **Desktop:** wide cockpit — left = identity (cover, countdown eyebrow, name, dates); right column = stacked widgets (day preview, still-to-arrange, weather, progress). Gallery below.
- **Mobile:** cockpit card with identity on the cover and widgets as compact rows beneath; gallery (single column) below.
- Reduced-motion respected; no layout shift (reserve space / fade).

## 5. State C — Launchpad

Shown when there is no upcoming trip. Reuses the marketing landing page's DNA (editorial headline + a destination entry pill) but with a bespoke ambient background and the new creation flow.

### 5.1 Structure
- **Hero:** eyebrow "PLAN · WALK · REMEMBER" (mono), serif headline "Where to next?", subcopy, and the **progressive command pill** (§6) centered. Background = the **field-globe shader** (§7).
- **Below:** "Past voyages" — the trip gallery (tiles) for past trips.
- **Brand-new user (zero trips):** hero only. Optionally the landing's Plan/Walk/Remember value trio beneath; final call at build time.

## 6. Trip creation — progressive command pill

The current `NewTripSheet` (a 2-step sheet: "Where to?" → "When are you going?") is **re-imagined as a single evolving command pill** and becomes the app's sole creation flow.

### 6.1 Interaction model
1. **Intent entry (collapsed):** centered pill, "Where to?". User types a destination (reuses `DestinationInput` autocomplete). Pill expands *horizontally in place* — never becomes a row of form fields. It reads as one evolving sentence: `Kyoto   When?`.
2. **Date selection:** focusing "When?" lifts the pill (z + soft shadow) and opens an **anchored range calendar** directly below, still centered. First click = start, second = end, with a soft range band and gold/claret hover glow. On completion the calendar snaps closed and the pill updates.
3. **Confirmation:** pill becomes `Kyoto   Jul 14 → Jul 18   ✓` with a restrained success pulse. Commit via Enter/tap, or auto-advance after a short pause.
4. **Materialization:** instead of a hard navigation, the pill morphs into the trip (the "trip seed card" → planner/cockpit). **Target of this morph is deferred to Phase 3 design** (see §11). Commit goes through the existing `useCreateTrip`.

### 6.2 Guardrails (from the interaction spec)
- The pill **never becomes a multi-row form**; always centered, single evolving sentence.
- The calendar belongs to the *sentence*, not the page — it feels attached, not modal-heavy.
- Motion implies physics (breathing expansion, soft elasticity, gentle snap), **not** UI panel slides or wizard steps.
- The pill's animation quality *is* the magic layer. If it's weak, the system feels like flight-booking software — so it is built deliberately, in its own phase, not rushed.

### 6.3 Two mounts, global replacement
The same pill component renders in two modes:
- **Inline** — lives in the State C hero.
- **Command-overlay** — summoned elsewhere: page dims behind a scrim (optionally a faint field-globe fades in behind for continuity), the pill animates to screen center, runs the same flow, materializes the trip. (Cmd-K-style palette pattern.)

**"Replace globally" scope** (verified — trip creation only ever happens from home; nothing in planner/Guide/Trip creates trips):

| Entry point | After |
|---|---|
| "+ New trip" header button | command-overlay pill |
| In-gallery "add trip" tiles ("Plan your next escape" / "Add another trip") | command-overlay pill |
| State C launchpad hero | **inline** pill (primary surface) |
| `NewTripSheet` | **retired / deleted** |
| `useCreateTrip` | **kept** — the pill commits through it |

In State C the "+ New trip" header button is redundant (pill is in the hero), so it **focuses/scrolls to the hero pill** rather than opening an overlay.

## 7. Field-globe shader (State C background)

A non-literal, fragment-shader **atmosphere** — never a recognizable globe or map. Goal: a sense of global travel/motion through light, noise, and flow. It must stay strictly **subordinate** to the pill, headline, and gallery.

- **Base:** near-black gradient (`#050507 → #07060A`), subtle edge vignette, optional ~2–4% claret warmth near center.
- **Field:** procedural curved flow field via sine/cosine UV distortion implying lat/long curvature — **curvature implied, never a full sphere outline**. Low-frequency simplex/perlin noise, very slow drift (0.02–0.05) modulating brightness/line density ("breathing").
- **Route arcs:** rare thin bezier-like arcs (opacity ≤ 0.05–0.12), soft glow, 8–20s fade lifecycle, **never more than 2–3 at once**.
- **UV drift:** near-imperceptible global rotation (~1 cycle / 2–4 min) combined with noise so it never reads as a spinning object.
- **Depth:** 2–3 layers (haze / mid field lines / rare arcs) with minimal parallax.
- **Palette:** near-black, desaturated blue-gray, restrained claret, *extremely* rare warm-gold specks. Avoid bright blues, neon, high-contrast starscape.
- **Motion rule:** everything "barely moving" — if the motion is noticed first, it's too strong.
- **Non-interactive:** no cursor/scroll/zoom/drag response. Interaction belongs to the pill.
- **Performance:** 60fps on mid-range mobile; prefer fragment shader over geometry; limit overdraw (mobile Safari); no heavy post stacks. **Fallback:** static low-opacity gradient + faint noise texture (also the Phase-1 placeholder and the reduced-motion / no-WebGL path).
- **Success:** users don't comment on it; it adds depth without attention; it makes the pill feel "placed in space."

## 8. Header (shared, minimal, state-aware)

Unchanged minimal set — there is nothing global left to add without inventing structure:

```
Voyager ◦───────────────── [☀ theme] [+ New trip] [ E account ]
```

- Logo = home link. Theme toggle. "+ New trip". Account avatar/menu.
- **State-aware "+ New trip":** State B → command-overlay pill; State C → focus the hero pill.
- Deliberately **not** adding global search / counts / streaks (fights the editorial minimalism + YAGNI).
- **Deferred nicety (not v1):** when a trip is actively in progress, a tiny "live" dot by the logo linking to the cockpit.

## 9. Phasing

Ship value early; de-risk the two "magic" pieces in their own phases.

- **Phase 1 — Structure:** two-state home (B cockpit / C launchpad), cockpit widgets, gallery, state-aware header. State C ships with the **static fallback backdrop** and the **existing creation flow** wired to the pill's eventual spot. A complete, premium home.
- **Phase 2 — Field-globe shader:** the real fragment-shader background, swapped in behind the already-present fallback.
- **Phase 3 — Progressive command pill:** the pill, range calendar, command-overlay, trip-seed-card materialization; retire `NewTripSheet`.

## 10. Components & files

**New**
- Home state selector (B vs C) — small wrapper in `routes/Dashboard.tsx` (or a `Home` route) off `splitTrips`.
- `Cockpit` + cockpit widget pieces (countdown, still-to-arrange, day-preview, progress) — compose existing `WeatherGlance`.
- `Launchpad` (State C hero).
- `FieldGlobe` shader background + static fallback (Phase 2).
- `CommandPill` + `RangeCalendar` + `TripSeedCard` (Phase 3).

**Reused**
- The bento gallery / `TripTile` (already on this branch) — serves both "trips below" (B) and "Past voyages" (C).
- `DestinationInput` (pill destination step), `useWeather`/`WeatherGlance`, `allReservations`, `useCreateTrip`, `splitTrips`/`isPastTrip`.

**Retired**
- `NewTripSheet` (Phase 3, once the pill is the create flow).

## 11. Open / deferred decisions
- **Trip-seed-card target (Phase 3):** does the pill morph into the **full planner** (fastest to value) or into **State B home** with the new trip as the freshly-materialized cockpit (most cinematic)? Decide at Phase 3 design.
- **State C brand-new-user body:** hero only vs hero + Plan/Walk/Remember value trio. Decide at Phase 1 build.

## 12. Data shapes

No migrations. Everything additive / already present: reservations (`stop.reservation`), weather (live fetch), day/stops (`data.days`). State selection is pure-derived from existing fields.

## 13. Accessibility & motion
- `prefers-reduced-motion`: shader → static fallback; pill → instant/eased without elasticity; tab + cockpit transitions already gated.
- No-WebGL / load failure → static fallback (same path as reduced-motion).
- Command-overlay: focus-trap + Esc + focus restore (matches existing Sheet conventions). ≥44px touch targets, aria on icon-only controls, labelled pill input.
- No layout shift; reserve space and fade.

## 14. Testing
- Unit: state selection (B vs C) across upcoming/past/empty; cockpit derivations (countdown, still-to-arrange count, progress, day preview); pill date-range logic; create commit still routes through `useCreateTrip` (existing tests stay green).
- The shader is visual/perf — manual + a basic fallback-render test (no WebGL → fallback present).

## 15. Success criteria
- A user with an upcoming trip lands on a glanceable cockpit they'd open between sessions.
- A user with no upcoming trip lands on a calm, inviting launchpad and can start a trip in one fluid gesture.
- The home no longer reads as a bare directory; it reads as Voyager's front door.
- The shader is felt, not noticed; the pill feels like the app's signature moment.
