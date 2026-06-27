# Voyager Home — Phase 3: Progressive Command Pill (Design Spec)

- **Date:** 2026-06-27
- **Status:** Approved (brainstormed with owner via visual companion; revised with owner's determinism amendments 2026-06-27) — ready for implementation planning
- **Branch:** `home-pill-phase-3` (worktree off `main`)
- **Parent spec:** `docs/superpowers/specs/2026-06-24-voyager-home-context-redesign-design.md` (§7 "Trip creation — progressive command pill", §10 Phasing). This document **finalizes and, in two places, revises** that parent for the Phase-3 build.
- **Builds on (shipped & live):** State C cinematic launchpad + State B cockpit home (tags `cinematic-launchpad`, `state-b-cockpit-home`), suite at **734**.

---

## 1. Problem & goal

The "Where to next?" pill renders in the State-C hero, but its `onSubmit` just opens the legacy `NewTripSheet` (a 2-step modal sheet). Phase 3 turns the pill into the app's **sole, progressive trip-creation flow** — type a city, pick a date range inline, and **materialize directly into the planner** — and retires `NewTripSheet`.

**The pill's animation quality is "the magic layer."** If it feels like a form, it feels like flight-booking software. The interaction must read as one evolving sentence and the materialization as one continuous gesture.

This phase also **restructures the home** per owner direction (§5): the pill hero becomes the permanent top of a single unified home in both states, and the upcoming-trip cockpit becomes a section beneath it.

## 2. Non-goals

- No backend changes, no schema migration (all additive JSONB / existing edge functions).
- No change to the planner, Guide, or Trip internals (we only *land* in the planner's existing Plan view).
- No new global nav. The field-globe shader work is untouched.
- Not redesigning the trip gallery / `TripGrid` / tiles (reused as-is for "Your travels").

## 3. The pill interaction model (the four beats)

One single, centered, evolving pill — **never a row of fields, never a multi-step wizard**. Tokens already entered render as **chips** (the structured look the owner approved over plain evolving text).

1. **Intent.** Resting pill: animated "Where to next?" typewriter placeholder + claret CTA. (This is today's `HeroSearchPill`, essentially unchanged at rest.)
2. **Destination.** User types a city; **Photon autocomplete** suggestions overlay *below* the pill (absolute, never shifting layout). The destination **commits** per §3.2 and **collapses into a chip**. Reuses the autocomplete logic of `DestinationInput` / `usePlaceSearch`, restyled for the dark glassy pill.
3. **Dates.** Once a destination commits, the **anchored range calendar** opens directly below the pill (attached to the sentence, not a page modal) as the next step: **1st click = start, 2nd click = end**; soft claret range **band**, **gold** hover edge. Picking the end date snaps the calendar closed and renders the range as a **gold chip** (`Jul 14 → Jul 18`). The calendar also offers **"Don't know dates yet"** (§3.3).
4. **Confirm.** The full sentence reads `[Kyoto, Japan]  [Jul 14 → Jul 18]  (Plan it →)`. A **restrained gold success pulse** fires. Commit on **Enter** or tapping the CTA, which freezes the pill into its creating state (§3.4).

**Guardrails:** always one centered sentence; the calendar belongs to the sentence; motion implies physics (breathing expand, gentle snap) — not panel slides. A **destination is required** to confirm; **dates resolve through the calendar or the explicit "Don't know dates yet" action** (§3.3) — never a silent empty submit.

### 3.1 Cover prefetch on select (resolves the photo-timing constraint)

A brand-new trip has **no cover at creation**; covers resolve async (Wikipedia / `place-photo` chain) and can take seconds or fail. So:

- **The moment a destination commits** (§3.2), trigger the **destination cover prefetch**: a **fire-and-forget cache warm** that **reuses the same underlying cover-resolution and cache mechanism that backs `useBackfillCoverImage`** (the shared service/helper behind it). **Do not invoke React hooks imperatively** — the warm goes through the plain helper/service, keyed by destination. This happens *seconds* before the user finishes picking dates.
- By confirm-time the cover is **often already cached**, so the materialization seed can show the real photo. If it is **not** ready, the seed falls back to the **instant branded claret gradient** (zero network) and the real photo resolves in the planner afterward (where a skeleton→photo fade is normal).
- **The materialization never awaits the photo.** It reads the cache **synchronously, cache-only** (never triggers a blocking fetch); cached → use it, otherwise → gradient.

### 3.2 Destination commit behavior

The destination step should prefer **structured autocomplete data**, because the selected destination powers coordinates, geo backfill, cover/video cache keys, and future reuse.

- If the user **clicks an autocomplete suggestion**, commit that suggestion as the destination.
- If the user **types a destination and presses Enter without manually selecting a suggestion**, automatically commit the **top Photon autocomplete result**. Example: typing `Kyoto` with first result `Kyoto, Japan` commits `Kyoto, Japan` (with its structured metadata), not raw `Kyoto`.
- If autocomplete is **still loading** when Enter is pressed, **wait briefly** for the first result before committing. If **no usable result** is returned, then — and only then — allow a **raw-text destination fallback**. Raw-text fallback still allows trip creation, but geo/photo/video backfills remain best-effort and must not block the flow.
- The **destination chip displays the clean committed label**, usually `City, Country` when available.

### 3.3 Unknown dates / "Don't know dates yet"

After a destination commits, the range calendar opens as the next step. The bottom of the calendar includes a secondary action: **"Don't know dates yet."**

Clicking it closes the calendar, renders a subtle **`Dates TBD`** state within the pill, and enables the final **Plan it →** CTA. If the user chooses this path:

- create an **undated trip**,
- store **no real `start` or `end` dates**,
- initialize the planner with **five generic days** (`Day 1 … Day 5`) instead of calendar dates.

If the user chooses an actual date range, use those dates normally.

### 3.4 Trip creation loading state

Once the user presses **Plan it →**, **freeze the pill into a creating state.** While `useCreateTrip` is pending:

- disable the CTA,
- disable Enter submission,
- prevent additional edits to the pill,
- show a subtle inline creating indicator.

**Double submits must be impossible.** If creation fails: **preserve the user's destination and date selections**, display a **restrained inline error**, and **do not navigate away**.

### 3.5 Pill reset & cancellation behavior

**Esc** closes overlays before leaving the pill, in priority order:

1. autocomplete,
2. calendar,
3. blur pill.

**Removing the destination chip** returns the pill to destination entry. After **successful creation**, reset the pill to its resting state once the user returns Home (§5.1 / §10).

### 3.6 Mobile calendar

On small screens the calendar **remains visually anchored to the pill** but may expand into a **full-width floating panel constrained to the viewport**. It must **not** become a modal sheet or introduce a background scrim. The interaction should still feel like one evolving sentence, not a wizard.

### 3.7 Date representation

Date chips display **local calendar dates** — e.g. `Jul 14 → Jul 18`, or `Jul 14`. Store dates using the **same representation expected by `buildNewTripPayload`** (the `YYYY-MM-DD` strings it parses). **Avoid UTC conversions** that could shift a displayed date by one day.

## 4. Materialization — "Seed-card flight" (the magic layer)

On **confirm**, the trip is committed via the existing **`useCreateTrip`** and the app **navigates to the new trip's Plan view** (`/trip/:id`). The transition is a continuous shared-element-style morph (chosen over a shape-morph and a calm dissolve after prototyping):

**Choreography (full-motion path):**
1. The hero **headline + subcopy fade and shrink away first** (clearing the seed's flight path — this fixed an overlap the owner flagged).
2. The confirmed **pill crossfades into a small "seed card"** (cover + destination name + date range / `Dates TBD`) at the pill's center. The seed is at rest pose so the fade-in triggers **no transform animation** (avoids a velocity-break stutter).
3. The home **dims and settles** (slight scale-down) and the **seed lifts in one single, uninterrupted transform** up to where the planner header will be.
4. The **planner eases in behind** while the seed is still arriving; the seed **dissolves on the header it becomes**, and **Day 1 unfurls** (rows / "Add your first stop" stagger in).

### 4.1 Materialization ownership (implementation contract)

`MaterializeOverlay` must **not rely on local component state that disappears during navigation.** Instead it owns a small **transition controller** containing:

- seed payload (destination label, date range / TBD, title),
- source bounds (the pill's measured rect),
- fallback cover / gradient (and the cache-read photo if present),
- transition status.

The overlay **begins before navigation**, **survives the route change**, and **hands off once the planner has mounted**. If the planner destination **cannot be measured within a short window after mount**, gracefully fall back to the **reduced-motion dissolve**.

**Reduced motion / fallback (built regardless):** `prefers-reduced-motion`, no-portal/measure failure, or any abort → a **calm confident dissolve**: success beat, fast (~250ms) dim-and-dissolve to the planner, planner plays a tasteful entrance (header fades down, Day 1 staggers).

**Invariant:** the animation is **cosmetic**. `useCreateTrip` commit + navigation is the source of truth; if the trip is created, the user **must** end up in the planner regardless of whether the morph played.

## 5. Unified home architecture (restructure)

> **Owner decision (revises the parent spec's two-separate-layouts framing):** the home is now **one layout**. The "Where to next?" hero + pill is the **permanent top** in both states. `selectFocusTrip` decides only whether a **middle section** renders.

Top → bottom:

1. **Hero + pill** — the cinematic "Where to next?" hero (clip-driven video, eyebrow, headline, the working pill). **Always present**, both states.
2. **Your next journey** *(State B only — when `selectFocusTrip(trips) !== null`)* — the focus trip as a **full-width section with its own destination video** as the section background, a glass status line (countdown · "still to arrange" · weather, from the existing `cockpitModel`), and an **"Open →"** primary action into the trip's Plan view. This **replaces** the shipped "Welcome back" cockpit *hero*; the cockpit content is **demoted to this section**. (Deliberate trade: creation is the front door even when a trip is upcoming.)
3. **Your travels** — the existing trip gallery (`TripGrid` / tiles), grouped/ordered per §5.2.

**Consequence for the codebase:** `Dashboard` stops early-returning two fully separate components. Instead it renders one stacked page: `CinematicHero` (with the live pill) → optional `UpcomingJourney` section → travels. `CinematicLaunchpad` and `CockpitHome` are **refactored/merged** into this single composition (their reusable pieces — masked video hero, field-globe background, travels list, cockpit model — are retained; the cockpit *card-as-hero* framing is dropped). `selectFocusTrip` / `cockpitModel` / `home-groups` view-models are reused (with the §5.2 ordering refinement).

### 5.1 Header "+ New trip" visibility rule & global behavior

The header **"+ New trip"** button is **redundant whenever the hero pill is on screen** (the pill *is* the create surface).

- **Hidden (smooth fade/slide out)** while the hero pill is in view.
- **Shown (smooth fade in)** once the user scrolls **past** the hero (e.g., into "Your next journey" / "Your travels").
- Driven by an **IntersectionObserver** on the hero pill. Same rule in both states.

**Global behavior:**
- **Already on Home:** clicking "+ New trip" **smoothly scrolls to the hero pill and focuses it** — which brings the hero into view and thus fades the button away.
- **On any other route:** clicking "+ New trip" **navigates to Home first**; after the hero mounts, **automatically scroll to and focus the pill.**
- **No modal or sheet ever appears.**

### 5.2 Ordering of undated trips

Trips created through **"Don't know dates yet"** are **future planned trips**, not past. Within **Your travels**, ordering is:

1. **Upcoming trips with dates** (soonest first),
2. **Upcoming trips with unknown dates** (`Dates TBD`),
3. **Past trips.**

Example: `Paris — next week` · `Hong Kong — next month` · `Kyoto — Dates TBD` · — · `Past Trips`.

This keeps undated trips visible while never letting them sort above trips with real dates. Refines the existing `home-groups` view-model (`isUndatedTrip` already distinguishes them) so undated upcoming trips group **below dated upcoming and above past**.

## 6. Two mounts → one surface (global replacement)

| Entry point | Behavior after Phase 3 |
|---|---|
| State C / State B hero | **Inline pill** (primary surface, always at the top of the home) |
| Header **"+ New trip"** | **Scrolls to + focuses the hero pill** (navigating Home first if elsewhere); never a sheet/overlay (§5.1) |
| In-gallery "add trip" affordances (if any) | Same: scroll to + focus the hero pill |
| `NewTripSheet` | **Retired / deleted** (§7.1) |
| `useCreateTrip` | **Kept** — the pill commits through it |

> This **revises** the parent spec's §7.3 "command-overlay (Cmd-K-style, page dims behind a scrim)". The owner explicitly rejected a dimming overlay: **no scrim, no background transition.** Because the pill hero is now permanently at the top of the home, summoning it is simply **scroll-to-and-focus** — there is nothing to overlay. The single `openCreateTrip` indirection is repointed accordingly (it focuses the pill instead of opening a sheet).

## 7. Components, files & API seams

**New**
- `CommandPill` — the progressive pill (intent → destination → dates → confirm). Owns its own state machine; emits an `onCommit({ destination, start?, end?, datesTBD })`. Supersedes `HeroSearchPill`'s submit-only behavior (built as an evolution of `HeroSearchPill`, reusing its glassy treatment + typewriter). Handles commit/loading/error/reset per §3.2–3.5.
- `RangeCalendar` — anchored two-click range picker (start/end, claret band, gold hover) with the **"Don't know dates yet"** action, dark-glass styled, keyboard + a11y, mobile per §3.6. Pure date logic extracted to a tested helper (`lib/range-calendar.ts`: clamping, which-click-sets-what, end<start swap, band membership; local-date formatting per §3.7).
- Cover prefetch helper — a fire-and-forget cache-warm reusing the cover service behind `useBackfillCoverImage` (no imperative hooks; §3.1).
- `MaterializeOverlay` + its transition controller (portal; §4.1) — seed-card flight, reduced-motion aware, navigation-surviving.
- `UpcomingJourney` — the State-B "next journey" full-width video section (consumes `cockpitModel(focus)`).
- `useHeroPillInView` — IntersectionObserver hook driving the "+ New trip" fade.

**Reused / unchanged**
- `useCreateTrip`, the cover service behind `useBackfillCoverImage` / `place-photo`, `useBackfillDestinationGeo`, `usePlaceSearch` (Photon), `selectFocusTrip`, `cockpitModel`, `home-groups` (with §5.2 refinement), `TripGrid` / tiles, `CinematicHero` shell + `HeroVideoStage` + `FieldGlobe`, `buildNewTripPayload`.

**Refactored/merged**
- `Dashboard`, `CinematicLaunchpad`, `CockpitHome` → one unified stacked home composition (§5).

### 7.1 Retirement acceptance criteria

`NewTripSheet` is **completely removed**. There are:

- **no remaining imports**,
- **no remaining routes**,
- **no remaining modal entry points**,
- **no remaining code paths that create trips outside `CommandPill`.**

`CommandPill` is the **sole trip-creation surface** throughout the application. Until the retirement phase, `NewTripSheet` remains **untouched** (the new pill never submits into it — §11).

## 8. Data shapes

No migrations. Creation flows `{ slug:'', title, subtitle:'', start, end, destination, notes:'' }` into `useCreateTrip` → `buildNewTripPayload`:

- **title** defaults from the committed destination label (the pill collects no separate title field),
- **dated path:** `start`/`end` are the calendar's local `YYYY-MM-DD` strings (§3.7); `buildNewTripPayload` derives `numDays` + `config.startDate`,
- **undated path ("Don't know dates yet"):** `start`/`end` empty ⇒ `buildNewTripPayload`'s 5-generic-day initialization (`Day 1 … Day 5`), no `config.startDate`. *(Today it defaults to 4; the undated path standardizes on **five** generic days per §3.3 — adjust the empty-dates default accordingly, keeping dated behavior unchanged.)*

Cover + destination-geo backfills fire-and-forget exactly as `NewTripSheet` did today.

## 9. Accessibility & motion

- `prefers-reduced-motion`: pill expansions eased without elasticity; materialization → calm dissolve (§4.1); "+ New trip" fade becomes an instant toggle.
- Pill input is a labelled combobox; autocomplete is full keyboard (↑/↓/Enter/Esc), `role=listbox/option`, `aria-activedescendant` (mirrors `DestinationInput`). Enter commits the top result per §3.2.
- `RangeCalendar`: focusable grid, arrow-key navigation, Enter to pick, Esc to close, ≥44px targets, `aria-selected` on range ends, labelled month nav, labelled "Don't know dates yet" action.
- No layout shift: autocomplete and calendar are absolute overlays; the pill grows in place.
- Focus management: on materialize, focus moves into the planner (its existing entry focus). On "+ New trip", focus moves to the pill input (after Home mounts if navigating in). Esc priority per §3.5.

## 10. Testing

- **Pure logic (unit):** `range-calendar` (first/second click assignment, end<start swap, band membership, month clamping, **local-date formatting with no UTC day-shift** §3.7); `buildNewTripPayload` dated vs **undated → five generic days** (§8); creation routes through `useCreateTrip` (existing tests stay green).
- **Destination commit (§3.2):** click-suggestion commits it; Enter-without-selection commits the **top Photon result**; Enter-while-loading waits then commits; no usable result → raw-text fallback; chip shows the clean label.
- **Pill state machine:** intent → destination (chip) → dates (calendar open) → confirm; destination required; **"Don't know dates yet"** → `Dates TBD` + enabled CTA + undated payload.
- **Loading/error (§3.4):** pending freezes CTA + Enter + edits (no double submit); failure preserves selections, shows inline error, no navigation.
- **Reset/cancel (§3.5):** Esc priority (autocomplete → calendar → blur); removing destination chip returns to destination entry; post-create reset on return Home.
- **Cover prefetch (§3.1):** committing a destination warms the cache exactly once via the service (not a hook); materialization reads cache-only and falls back to gradient when cold (no blocking fetch).
- **Home composition:** `selectFocusTrip === null` → no "Your next journey" section; non-null → section present; travels list excludes the featured trip (existing).
- **Undated ordering (§5.2):** dated-upcoming (soonest first) → undated-upcoming → past.
- **"+ New trip" rule (§5.1):** hidden when hero-pill sentinel intersects, shown when not (observer mocked); off-Home click navigates Home then focuses the pill; never opens a sheet.
- **Materialization invariant (§4.1):** commit + navigation happen even under reduced motion / overlay-skipped / unmeasurable-planner path.
- **Retirement (§7.1):** `NewTripSheet` removed; no imports/routes/modal entry points; `CommandPill` the only creation path.
- Keep `npx tsc -b` clean and the full suite green (≥ 734, plus the new units).

## 11. Build phases (for the implementation plan)

Bite-sized, subagent-driven, commit-per-task, spec + code-quality review between tasks:

1. **`RangeCalendar` + pure date logic** (`lib/range-calendar.ts`, tested) — two-click range, end<start swap, band, local-date formatting (§3.7), "Don't know dates yet" action, mobile panel (§3.6), a11y. Standalone, dark-glass styled.
2. **`CommandPill`** — evolve `HeroSearchPill` into the four-beat state machine: destination commit (§3.2) + chip, "When?", calendar mount, `Dates TBD` (§3.3), confirm with loading/error (§3.4), Esc/reset (§3.5). Emits `onCommit`. **During intermediate phases `CommandPill` may emit into a temporary development handler or story harness — it must never submit into `NewTripSheet`.** The production path is always `CommandPill → useCreateTrip → MaterializeOverlay → Planner`; `NewTripSheet` stays untouched until §7.1.
3. **Cover prefetch on commit** (§3.1) — fire-and-forget cache warm via the cover service (no imperative hooks); seed reads cache-only.
4. **`MaterializeOverlay`** (§4 / §4.1) — portal transition controller, seed-card flight + reduced-motion dissolve; wire confirm → `useCreateTrip` → navigate, overlay survives the route change and hands off on planner mount (graceful fallback if unmeasurable). Now the pill's real production commit path.
5. **Unified home composition** (§5) — merge `Dashboard` / `CinematicLaunchpad` / `CockpitHome` into the stacked layout; add `UpcomingJourney`; apply undated ordering (§5.2); repoint `openCreateTrip` to focus the pill.
6. **"+ New trip" visibility + global behavior** (§5.1) — `useHeroPillInView` + header fade + scroll-to-focus + off-Home navigate-then-focus.
7. **Retire `NewTripSheet`** (§7.1) — delete + remove imports/routes/modal entry points; verify `CommandPill` is the sole creation path; final holistic review; suite green; `tsc -b` clean.

## 12. Open / deferred

- Exact `RangeCalendar` visual polish (cell sizing, two-month vs one-month on desktop) — tune in build.
- Seed-card flight precise curve / durations — tune in build against the approved prototype feel (v3 choreography).
- Whether "Your next journey" video reuses `useDestinationClip` verbatim or a calmer single-clip — decide in build (default: reuse).
- Multiple simultaneously-imminent upcoming trips beyond the focus trip — out of scope (parent spec already defers).
- Capturing the selected place's lat/lng from Photon at commit (to skip a later geocode) — out of scope; the parser currently keeps the label only.
