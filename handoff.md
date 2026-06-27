# Voyager — Handoff / Resume Here

> Read **`CLAUDE.md`** (same folder) first for the project overview, stack, commands, architecture, and conventions. This file is the **current state**: what's done, what's pending, and what's next. **Last updated: 2026-06-27.**

## TL;DR

Voyager is a premium travel-planning PWA. Work is now on branch **`main`** (the `voyager-redesign` branch was consolidated into `main` and deleted), local at `C:\Users\edwar\travel`, repo `github.com/edwardvth/travel` (a fork of `magakh/travel` — never push to `upstream`), live at **https://voyager.edwardvth.workers.dev**. App is in `app/` (Vite + React 18 + TS + Tailwind + Supabase + Cloudflare Workers). **Live Supabase project: `wnpanbjzmcsvhfyjdczv`** (NOT the stale `gvhtvarqgzjhbjzupdlv` in old docs). Build method: subagent-driven (opus) with spec → plan → build, commit per task, push, deploy.

Resume: `cd app && npm install && npm run dev`. Verify: `cd app && npm test && npx tsc -b && npm run build` (**734 tests** green). Deploy: `cd app && npm run build` then `npx wrangler deploy` from repo root.

## ▶ NEXT UP: Home redesign — Phase 3 (Progressive command pill)

The home redesign's **State C (cinematic launchpad + field-globe) and State B (cinematic cockpit home + searchable "Your travels") are SHIPPED & LIVE** (2026-06-27; tags `cinematic-launchpad`, `state-b-cockpit-home`). The remaining home piece is **Phase 3 — the progressive command pill**.

- **What it is** (already drafted in `docs/superpowers/specs/2026-06-24-voyager-home-context-redesign-design.md` §7 "Trip creation — progressive command pill" + the §Phases list): the "Where to next?" search pill becomes the real trip-creation flow — type a **city** (Photon autocomplete) → focusing **"When?"** opens an **anchored range calendar** (1st click = start, 2nd = end) → **materialize into the planner** (Plan view of the new empty trip, ready for Day 1) via a seed-card morph, committing through **`useCreateTrip`**. Then **retire `NewTripSheet`** by rerouting the single **`openCreateTrip(prefill?)`** indirection (added in Phase 1) to the pill/overlay — one place, not every call site.
- **The pill's animation quality is "the magic layer"** — build it deliberately; if weak it feels like flight-booking software.
- **Current state:** the pill already renders in `CinematicHero` (State C hero), but its `onSubmit` just calls `openCreateTrip` → opens the old `NewTripSheet`. State B (`CockpitHome`) has no pill (it has the cockpit card). Phase 3 makes the pill the actual progressive creation surface and retires the sheet.
- **Method:** the interaction + animation aren't fully specced → **brainstorm/finalize the design first**, then writing-plans → subagent-driven-development. Read the two home specs + the State-B spec/plan (below) before designing.

**Loose end carried from State B (PARKED):** the **starfield** behind "Your travels" (`app/src/components/ui/stars.tsx`) is live but **untuned**. It now renders correctly (the root-cause bug was a **0-height container** — `size-full`'s `height:100%` fought `absolute inset-0` and resolved to 0 against the auto-height section; fixed by dropping `size-full`). It just wants a brightness/density/`STARS_MASK` fade pass. Knobs: `STARS_MASK` + the globe→stars split in `CockpitHome`/`CinematicLaunchpad`, and `StarLayer` count/size/`speed` in `ui/stars.tsx`.

## Queued after Phase 3: Plan-tab parity — Tier 3 → Tier 2

The **Plan-tab feature-parity** initiative is fully scoped (spec + plans written, approved, pushed). **Phase 0 (AI), Tier 1, and Suggest Day Parity are done & live.** The **queued planned work is Tier 3 then Tier 2** (below).

- **Parent spec:** `docs/superpowers/specs/2026-06-22-voyager-plan-parity-design.md` (owner-approved). Re-expresses legacy `Trip.html` capabilities in Voyager's UI. Locked principle: **the map orients, never navigates** (no Google-Maps clone, no OSRM).
- **Plans:** `docs/superpowers/plans/2026-06-22-voyager-plan-parity-{phase-0-ai-reliability, tier-1-map-location, tier-3-content-and-days, tier-2-ai-planning}.md` + `docs/superpowers/plans/2026-06-23-voyager-suggest-day-parity.md`. Build via **subagent-driven-development**.
- **Build order (locked):** Phase 0 ✅ → Tier 1 ✅ → Suggest Day Parity ✅ → **Tier 3** → **Tier 2**.

**✅ Phase 0 — AI reliability — DONE (2026-06-23).** AI works in the live app. The `ai-proxy` slug was redeployed with the real Claude proxy and the `ANTHROPIC_API_KEY` was rotated (the old one was the leaked-then-revoked key → `invalid x-api-key`). Verified: unauthenticated probe returns `401` (new proxy; emulator returned 403) and "Suggest a day" generates for the founder. See memory `voyager-ai-proxy-fix` for the response-code diagnostic ladder. No app-code changes were needed.

**✅ Suggest Day Parity — DONE & LIVE (2026-06-23).** See "Shipped & live" below. `trip/duration.ts` is now available for Tier 2c (duration suggestions) and Tier 3d (day-utilization); `Stop.mealAnchor` is available for Tier 2a (Optimize Day meal detection).

**▶ Tier 3 — Stop content & day structure.** Enrichment fix (maxTokens 700→2000, keep Sonnet, "shorten-don't-empty / never fabricate", Wikipedia=background-not-gate, **merge `facts[]`/`notice` → keep `facts[]`, drop `notice`, back-compat read**; shared by Plan+Guide); richer fields (hours / `price` enum / goodFor); per-stop hourly weather; day-utilization summary (uses `trip/duration.ts`); **day management** (DayRail is read-only today) + the 4 Day-Reorder Invariants.

**▶ Tier 2 — AI planning power (last).** Deterministic-first Optimize Day (AI breaks ties); What-to-Book w/ `bookingRecommendation{confidence,reason}`; duration suggestions (uses `trip/duration.ts`); `travelerContext` typed `TripConfig` field + UI, folded into PLANNING prompts only (never enrichment).

**Parked:** photo→landmark vision ID. **Next batch after this initiative:** shared per-location enrichment cache (trip-agnostic). **Out:** GPS auto-tour (Guide's), trip story, JSON export, in-app navigation.

## Shipped & live (this redesign, in order)

All committed + pushed to `main` and deployed to the live URL unless noted.

- **Phase 1** — Landing + Auth + Dashboard (trips list, new-trip sheet, sharing). Tag `phase-1-complete`.
- **Phase 2 — Planner (Option C)** — day-by-day split map+itinerary, Do/Eat/Stay, weather glance, walk-time connectors, Stay card, reservations, photo gallery, change-location. Tag `phase-2-planner-c`.
- **Phase 3 — Three-tab nav refactor** — `Plan · Guide · Trip`; global account settings menu. Tag `phase-3-nav-refactor`.
- **New-trip flow + destination covers** — Title·Destination·Notes; Photon autocomplete → `config.destination`; manual cover override; `sanitizeConfig` strips secret keys on every save.
- **Guide (Phase 3) "Premium Modern" living companion** — image-forward current-stop card, geolocation live chip, soft-arrival geofence, ElevenLabs narration (`hyper-function` slug) + Web-Speech fallback, Story/Facts/Experience tabs, Wikipedia/Commons/Google-Places hero chain (`place-photo` slug).
- **Guide realtime fix** — `mergeRealtimeTrip` last-write-wins (no more clobbering optimistic edits).
- **Guide swipe deck** — Tinder-style swipe-to-progress: swipe-left = done+next, swipe-right = back+uncheck; deck peeks (next from below, prev from top), stable hero slot, ghost throw. Pure commit logic in `guide/swipe.ts` (tested).
- **Code-splitting** — lazy planner routes (`PlannerLayout`/`Itinerary`/`Guide`/`Trip`/`StopDetail`) via `trip/lazyRoutes.ts`, `ChunkErrorBoundary` (chunk-vs-crash + Reload), preload-on-intent on the tab bar, Suspense skeletons. Entry chunk **829 KB → 604 KB (−27%)**. Spec + plan in `docs/superpowers/`.
- **Stop Minimap (Phase 1)** — orientation minimap in the Guide hero (`StopMinimap.tsx`): user dot + destination pin + stylized curved path (`minimap-geom.ts`), photo↔map toggle that expands the hero to a **1:1 square**, **pinch+pan with a gesture-ownership lock** (touching the map disables the swipe deck via `mapLock`, pointer-lifecycle driven), **+/−** zoom + badge/chip kept above the map. Fits the view once (respects manual zoom). Reverses the old "no embedded map in Guide" lock → now "no *navigation* map; orientation minimap OK." Spec: `docs/superpowers/specs/2026-06-22-voyager-stop-minimap-and-offline-design.md`; plan: `docs/superpowers/plans/2026-06-22-voyager-stop-minimap-phase-1.md`.
- **Plan-tab parity — Tier 1 (Map & location foundation)** — 2026-06-22, 7 tasks, suite 526→557. (1) **Restyled `TripMapView`** to the Guide-minimap aesthetic: computed `--sig-btn` claret pins + `drop-shadow`, hidden `zoomControl`, refined dashed rounded polyline, **muted** multi-day ramp (`map-style.ts` `dayColor`), gold Stay pin kept. (2) **Removed Plan navigation** — `StopDetail` no longer has the "Navigate" Google-Maps link or the static-map peek (guarded by `stopdetail-no-nav.test.ts`); Plan exposes no external maps (Guide keeps its Directions hand-off). (3) **Shared geocoder** `lib/geocode.ts` (Photon, never-throws) fills coordinates for typed / AI-coordless stops fire-and-forget (`useGeocodeBackfill`), so every stop earns a pin + walk connector. (4) **Coordinate provenance** stamped at the single mapping site (`location.ts`): `coordinateSource:'ai'|'geocoder'` (origin) + `locationEditedAt` (edit history, distinct); **stale-write guard** `canApplyGeocode` (last-write-wins) discards a geocode result after a relocate. **No OSRM** — walk times stay haversine. Spec/plan: `docs/superpowers/{specs,plans}/2026-06-22-voyager-plan-parity-*`. *Minor known edge (benign): the geocode backfill matches its target stop by name+address, so two coordless same-named stops in one day could resolve in either order — both get the same correct coords.*
- **Plan-tab parity — Suggest Day Parity** — 2026-06-23, 5 tasks, suite 557→570, deployed (version `54aad055`). "Suggest a day" now generates a **complete, scheduled day** instead of a thin 4-stop list. (1) `suggestDay` prompt reframed to be **completeness/window-driven** (fill a morning→evening day by duration; stop count is a consequence, not a target ~6–11), with **meal anchors**, **walkable same/adjacent-district clustering**, and a **variety guard** (no museum→museum runs). (2) Stops arrive **scheduled + meal-tagged**: `toStop` captures `time` + `duration` (`normalizeDuration`) + new additive `Stop.mealAnchor?:'breakfast'|'lunch'|'dinner'`. (3) New shared **`trip/duration.ts`** (`normalizeDuration`/`defaultDurationMinutes`/`ensureDurations`) — the single source Tier 2c + Tier 3d reuse; every suggested stop is guaranteed a duration. (4) **`suggestDay` runs on Opus 4.7** (`claude-opus-4-7`), maxTokens 1500→4000 (truncation headroom); enrichment + `suggestPlaces` stay Sonnet 4.6; `suggestPlaces` 5→6 results. (5) Traveler-context hook: builders fold `ctx.travelerContext`; `Itinerary` reads `trip.config.travelerContext` opportunistically (typed field + UI remain Tier 2d). Spec/plan: `docs/superpowers/{specs,plans}/2026-06-23-voyager-suggest-day-parity*`.
- **Plan time editing (editable stop times in the Plan list)** — 2026-06-23, branch `plan-time-edit` merged to `main` + deployed (version `c567ac01`). Tap a stop's mono **time pill** in the Plan list to edit its time inline. **Desktop (≥768px):** anchored popover (`TimeEditor.tsx`) — native `<input type="time">` + `−30/−15/+15/+30` nudge chips + Clear + **Reset to <suggested>**. **Mobile (<768px):** a floating, animated (fade+pop via framer-motion `AnimatePresence`) centred modal (`TimeModal.tsx`) over a dimmed-but-visible backdrop, with a **3D wheel picker** (`TimeWheelPicker.tsx` — hour·minute·AM/PM) + the same nudges/clear/reset; `useMediaQuery` picks the surface. Shared `trip/time.ts` (`toInputTime`/`fromInputTime`/`nudgeTime`, moved out of StopDetail). New additive **`Stop.suggestedTime`** (the AI's original time, captured in `toStop`; legacy stops snapshot on first editor-open) drives the **Reset** button (shows only after the time is changed). Edit-gated, immutable save, suite 570→577. *Not a tier — an ad-hoc feature; Tier 3 is still next.*
- **Auth sign-in redesign (parallel session)** — commits `19aa127` + `defe712` landed on `main` from a concurrent session (cinematic claret/gold sign-in, touch-responsive card tilt in `routes/Auth.tsx`); now also live via this deploy. *(Not my work — flagged so it's accounted for. There was also an uncommitted WIP edit to `guide/CurrentStopCard.tsx` in the working tree from that session; it was preserved/untouched and NOT deployed.)*
- **Home redesign — State C (cinematic launchpad) + State B (cinematic cockpit home)** — 2026-06-26/27, tags `cinematic-launchpad` + `state-b-cockpit-home`, suite → **734**. The Dashboard now early-returns one of **two full-bleed cinematic homes** (the old in-`AppShell` cockpit/grid path is removed; `components/Cockpit.tsx` deleted): **State C** (no upcoming trip) = "Where to next?" hero → night-Earth globe + "Your travels" glass cards; **State B** (has a trip) = featured-trip **cockpit card** over a destination video + a **searchable "Your travels"** (search + Tiles/Detailed toggle persisted per account; grouped Upcoming→Planning→Past). Key files: `components/CockpitHome.tsx` (State B), `CinematicLaunchpad.tsx` (State C), `CockpitCard.tsx`, `TravelsList.tsx` + `TravelTile.tsx`/`TripRow.tsx`, `lib/home-groups.ts` (featured/upcoming/planning/past view-model, tested), `lib/cockpit-model.ts`, `hero/useDestinationClip.ts` (curated clip → **Pexels** `pexels-video` edge fn → girl-walking fallback), `home/FieldGlobe.tsx` (now a **static** high-quality frame via the `staticFrame` prop — zero per-frame GPU cost), `components/ui/stars.tsx` (starfield — **untuned**, see loose end above), `components/home-style.tsx` (`HomeCredits` footer, shadows, `SoftBackdrop`). London cover pinned via `coverUrlOverrideFor` in `trip/cover-image.ts`. Pexels function deployed; new `video_cache` table (`docs/supabase/video-cache.sql` — run once if re-provisioning). Spec/plan: `docs/superpowers/{specs,plans}/2026-06-26-voyager-state-b-cockpit-home*` + `2026-06-26-voyager-cinematic-launchpad-design.md` + `2026-06-24-voyager-home-context-redesign-design.md` (the latter has the Phase-3 pill spec). **Preview explorations archived reference-only (not routed/compiled) under `app/src/routes/_home-explorations/` (tsconfig-excluded).**

## Backend / AI status — ✅ AI WORKING (resolved 2026-06-23)

AI is live in the production app (verified: "Suggest a day" generates for the founder). Two faults, both fixed:
1. The **`ai-proxy` slug had the wrong function** (the trip-invite Resend emailer, no Anthropic call → every request 403'd). Redeployed with the real Claude proxy (`supabase/functions/ai-proxy/index.ts`; gate: `role==='founder'` unlimited · `credits>0` 1/call · else 403; shared `ANTHROPIC_API_KEY`, passes Anthropic through).
2. The **`ANTHROPIC_API_KEY` secret held the old leaked-then-revoked key** → Anthropic returned `401 {authentication_error: invalid x-api-key}`. Rotated to a fresh `sk-ant-` key + redeployed.

**Diagnostic ladder (response codes), for next time:** `404`=slug not deployed · `401 unauthorized`=new proxy, no user session (the OLD emailer returned 403, so 401 here proves the right code is live) · `500`=`ANTHROPIC_API_KEY` missing · `403 no_ai_access`=deployed+key set, non-founder gate · `200`=working. **Gotcha:** a stray trailing newline/space in the `secrets set` value reproduces `invalid x-api-key`. To re-test validity of a key without spending tokens: `curl.exe -s -o NUL -w "%{http_code}" https://api.anthropic.com/v1/models -H "x-api-key: KEY" -H "anthropic-version: 2023-06-01"` (200=valid). The client (`app/src/trip/ai.ts` → `callAI`) was always correct.

**Separately (OPTIONAL, NOT an AI issue):** `supabase/functions/send-invite/index.ts` is preserved in the repo. The `send-invite` slug 404s, so invite *emails* don't send (trip *membership* still works via the `add_trip_member` RPC). Deploy it to a `send-invite` slug only if/when invite emails are wanted — unrelated to AI.

## Security status

- ✅ **Leaked Anthropic keys rotated** (operator) + scrubbed from trip `config` (`sanitizeConfig` strips on every save). No new leaks possible.
- ✅ **Anon `DELETE` policy dropped** on `trips` (deletes go through the owner-gated `delete_trip` RPC).
- ✅ **`profiles` privilege lock** — `revoke update (role, credits) on profiles from anon, authenticated;` ran, so users can't self-promote to founder / grant themselves credits. The AI gate is tamper-proof.
- ⚠️ **Accepted-open (by decision):** `trips` RLS still allows public **read/insert/update** (the legacy `Trip.html` anonymous `/<slug>` sharing relies on anon read; the owner uses it with a trusted person). Reads expose trip data (incl. reservation notes). Owner accepted this; closing it means retiring/auth-gating Trip.html sharing (its own future task). See memory `voyager-rls-ownership-gap`. Set an Anthropic monthly spend cap as a backstop.

## Specs & plans (read for decisions)

- `docs/superpowers/specs/` — `2026-06-19-voyager-nav-refactor-design`, `2026-06-20-voyager-guide-premium-modern`, `2026-06-22-voyager-code-splitting-design`, `2026-06-22-voyager-stop-minimap-and-offline-design`, the guide-swipe design brief, etc.
- `docs/superpowers/plans/` — matching implementation plans (code-splitting, minimap Phase 1, guide v2, etc.).
- `docs/design/UI consistency check/design_handoff_guide_swipe/` — the approved swipe-deck design reference (prototype + screens).

## Other pending workstreams (not the immediate focus)

- **Stop Minimap Phase 2** — the auto-discovery teaching morph (once per 24h "travel session", ~3.4s). Phase 3 — offline tiles. Specs already written.
- **Offline trip downloads + Service Worker / PWA** — roadmapped in the minimap/offline spec; the SW is the prerequisite (none exists yet). Code-splitting already eases SW precaching.
- **Full account/settings page** — only a minimal stopgap exists.
- **Merge to `upstream`** — never; this is a fork, stay on `origin/main`.

## Working agreements (how the owner likes to work)

- Wants to **see things visually**, iterate; values disciplined **spec → plan → build** (brainstorming → writing-plans → subagent-driven-development).
- **Anti-slop is non-negotiable:** lucide icons only (no emoji), CSS-var token theming (light+dark), a11y (≥44px targets, aria, focus rings), `prefers-reduced-motion`. Photography-first, premium/editorial.
- **Immutable saves** via the lifted `save({config?,data?})`; edit-gated by `canEdit`; back-compat reads of legacy fields.
- Commit per task with trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Push to `origin/main`. Redeploy to Cloudflare. Keep the test suite green.

## Quick health check after pulling

```bash
cd app && npm install
npm test        # expect 734 passing
npx tsc -b      # clean
npm run build   # succeeds (one pre-existing chunk-size warning is fine)
```
