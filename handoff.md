# Voyager — Handoff / Resume Here

> Read **`CLAUDE.md`** (same folder) first for the project overview, stack, commands, architecture, and conventions. This file is the **current state**: what's done, what's pending, and what's next. **Last updated: 2026-06-22.**

## TL;DR

Voyager is a premium travel-planning PWA. Work is now on branch **`main`** (the `voyager-redesign` branch was consolidated into `main` and deleted), local at `C:\Users\edwar\travel`, repo `github.com/edwardvth/travel` (a fork of `magakh/travel` — never push to `upstream`), live at **https://voyager.edwardvth.workers.dev**. App is in `app/` (Vite + React 18 + TS + Tailwind + Supabase + Cloudflare Workers). **Live Supabase project: `wnpanbjzmcsvhfyjdczv`** (NOT the stale `gvhtvarqgzjhbjzupdlv` in old docs). Build method: subagent-driven (opus) with spec → plan → build, commit per task, push, deploy.

Resume: `cd app && npm install && npm run dev`. Verify: `cd app && npm test && npx tsc -b && npm run build` (**526 tests** green). Deploy: `cd app && npm run build` then `npx wrangler deploy` from repo root.

## ▶ NEXT UP (the focus for the next chat): Trip Planning (Plan tab) feature-parity

**Goal:** bring the **Plan** tab (the planner) to feature-parity with the **old `travel-guide.ai` app (`Trip.html`)** — "all the same/similar main functionality so it's a premium, truly useful product" — but rebuilt in **Voyager's UI/UX** (three-tab Plan·Guide·Trip, anti-slop, token theming, premium/editorial). Not a port of Trip.html's markup; a re-expression of its capabilities in Voyager's design language.

**Start by analyzing the reference + the current state, then spec → plan → build:**
- **Reference (what to match):** `Trip.html` at the repo root (882 KB legacy single-file app — the old travel-guide.ai). It's a rich planner: AI day/place suggestions, photo→landmark vision identification, GPS walking tour, reservations, maps, weather, day management, sharing, etc. Read it to enumerate the planning features Voyager's Plan tab is missing or does more thinly. The gesture/AI maths is plain readable JS.
- **Current Voyager Plan tab (`app/src/trip/`):** `Itinerary.tsx` (Plan split view = stop list + map), `StopList.tsx` + `StopRow.tsx` (dnd-kit reorderable rows, mark-done, delete, reservations), `AddStop.tsx` (AI place suggest + add-by-name), `suggest.ts` (`suggestDay`/`suggestPlaces` → `callAI`), `ChangeLocation.tsx`, `TripMapView.tsx` (Leaflet + CARTO split-view map), `StayCard.tsx`, `WeatherGlance.tsx` (Open-Meteo), `DayRail.tsx`, `StopDetail.tsx`, `StopPhotos.tsx`, plus helpers (`helpers.ts`, `reservation.ts`, `hotel.ts`, `walk.ts`, `landmark.ts`/`landmark-context.ts`, `enrich.ts`, `photo.ts`).
- **The audit (`docs/superpowers/specs/2026-06-22-voyager-stop-minimap-and-offline-design.md` was for Guide; for Plan there's no spec yet)** — start fresh: use the **brainstorming** skill to scope parity (what to port, what to leave), then **writing-plans**, then **subagent-driven-development**.
- **Sub-task already queued:** restyle the **Plan map** (`TripMapView`) to match the **Guide minimap** look (claret pins/path, hidden chrome, premium framing) — see `StopMinimap.tsx` for the target style. Fold this into the Plan workstream.

**AI is required for Plan suggestions** — see "Backend / AI status" below; make sure the `ai-proxy` deploy is done before testing AI features.

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

## Backend / AI status — ⚠️ AI needs the ai-proxy slug fixed (pending operator)

**Root cause of the AI 403:** the **`ai-proxy` edge-function slug has the wrong function deployed — the trip-invite *emailer* (Resend), which contains no Anthropic call at all**, so it can't return AI results: an AI request (`{messages,...}`) has no `trip_id`, the trip lookup fails, and it returns `403 forbidden` (no Anthropic ever hit; logs show only boot/shutdown). Confirmed by probing the slugs: `send-invite` 404s (doesn't exist), so the invite code is living under `ai-proxy`. *(To re-verify: Dashboard → Edge Functions → `ai-proxy` → Code; if it's Resend/email code it must be replaced; if it calls `api.anthropic.com` it's fine and only the profile/key below matter.)*

**Fix is committed to the repo** (`supabase/functions/ai-proxy/index.ts` — the real Claude proxy; gate mirrors the old app: `role === 'founder'` = unlimited, `credits > 0` = family & friends (1 credit/call), else 403; shared `ANTHROPIC_API_KEY`, passes Anthropic's response through). **Pending operator steps for AI:**
1. **Deploy the Claude proxy to the `ai-proxy` slug** on `wnpanbjzmcsvhfyjdczv` — `npx supabase login` then `npx supabase functions deploy ai-proxy --project-ref wnpanbjzmcsvhfyjdczv` (or paste the repo file in Dashboard → Edge Functions → ai-proxy). **This is required** — it replaces the email code that can't do AI.
2. Set secret **`ANTHROPIC_API_KEY`** (a current/valid key) on the project.
3. Ensure the owner's Voyager **`profiles.role = 'founder'`** (Table Editor) — this project's profiles are separate from the old site's.

The client (`app/src/trip/ai.ts` → `callAI`) already calls `ai-proxy` correctly; nothing to change client-side.

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
npm test        # expect 526 passing
npx tsc -b      # clean
npm run build   # succeeds (one pre-existing chunk-size warning is fine)
```
