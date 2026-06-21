# Voyager — Handoff / Resume Here

> Read **`CLAUDE.md`** (same folder) first for the project overview, stack, commands, architecture, and conventions. This file is the **current state**: what's done, what's next, and known issues. Last updated: **2026-06-19**.

## TL;DR

Voyager is a premium travel-planning PWA. All work is on branch **`voyager-redesign`** (not merged to main), local at `C:\Users\edwar\travel`, repo `github.com/edwardvth/travel`, live at **https://voyager.edwardvth.workers.dev**. The app is in `app/` (Vite + React + TS + Tailwind + Supabase + Cloudflare Workers). Build method: subagent-driven (opus) with reviews + commit per task.

To resume: `cd app && npm install && npm run dev`. To deploy: `cd app && npm run build` then `npx wrangler deploy` from the repo root (one-time `npx wrangler login` first).

## Shipped & live (in order)

- **Phase 1** — Landing + Auth + Dashboard (trips list, new-trip sheet, sharing). Tag `phase-1-complete`.
- **Hero refinement** — cinematic/explorer video hero, typewriter, splash. Tag `phase-a-hero`.
- **Phase 2 — Planner (Option C)** — the day-by-day planner with a split map+itinerary, Do/Eat/Stay categories, weather glance (Open-Meteo), walk-time connectors, Stay card, per-stop reservations, photo gallery, change-location. Tag `phase-2-planner-c`.
- **Phase 3 — Three-tab nav refactor** — `Plan · Guide · Trip`. Removed Bookings/Map/Settings tabs; "Reserved" reservation language; Guide aspirational teaser; Trip dashboard (Stay · Upcoming · Still to arrange · Trip Details · Manage); global account settings menu (AI/units/theme) replacing the in-Voyage Settings tab. Tag `phase-3-nav-refactor`.
- **Landmark images** (`feat(images)` commits `9f1487c`, `ef81441`) — free Wikipedia/Wikimedia photos: per-activity image on add, trip cover on the home page, plus a one-time Dashboard backfill (with abbreviation expansion) that persists `config.coverImage` for existing trips.
- **Fix** (`e54c6c2`) — AI history/facts/tips were showing literal `<strong>`/markdown; now rendered as safe inline emphasis via `trip/richtext.ts` (`formatInline`).

Everything above is committed, pushed to `voyager-redesign`, and deployed to the live URL.

- **New-trip flow + destination-driven covers** (`5d7f6a0`, `a305408`, `5b01746` — **pushed, NOT yet deployed**) — spec `docs/superpowers/specs/2026-06-20-voyager-new-trip-flow-and-destination-covers.md`. Fixes the "stl → suitcase" cover bug at the root:
  - New-trip flow is now **Title · Destination · Notes** (dates on step 2); the technical "Trip ID" and "Subtitle" fields are gone — the slug/id is auto-derived from the title (`slugify`) with a bounded collision-retry in `useCreateTrip`.
  - **Destination** is captured via a **Photon (komoot) autocomplete** (`lib/photon.ts`, `data/usePlaceSearch.ts`, `components/DestinationInput.tsx` — no API key, debounced, cached, full a11y) and stored in `config.destination` (additive JSONB; **no migration**). Editable later in the "Edit trip…" sheet.
  - `destinationOf()` now prefers `config.destination`; the `expandDestination` abbreviation map is **deleted**. Covers query the real city.
  - **Manual "Change cover" override** in *Manage this trip* — Upload (`resizeToDataUrl` → `config.coverImage`) + Reset to automatic. Manual always wins.
  - **Secret hygiene:** `sanitizeConfig()` strips `anthropicKey`/`aiKey` on every persist (creation + autosave), so trips self-scrub and the client can never write a per-trip key again. Notes back-compat: `tripNotes()` falls back to legacy `config.travelerNotes`.

## Specs & plans (read these to understand decisions)

- `docs/superpowers/specs/2026-06-19-voyager-nav-refactor-design.md` — the Plan/Guide/Trip architecture + the 6 product principles + the locked decisions (Reserved language, Trip-not-a-planner guardrail, projection model, minimal account stopgap).
- `docs/superpowers/plans/2026-06-19-voyager-nav-refactor.md` — the NR1–NR7 implementation plan (already executed).
- `docs/superpowers/plans/2026-06-19-voyager-planner-C.md` — the Phase-2 planner plan.
- `docs/IMPLEMENTATION.md` — the build tracker / acceptance criteria / phase gates (if present).

## Known issues / bugs

1. **~~Landmark cover auto-pick can be wrong (the "stl → suitcase" case).~~** ✅ **RESOLVED** (`5d7f6a0`+`a305408`+`5b01746`, pushed, pending deploy). Root cause wasn't a missing relevance threshold — the trip never captured a **destination**, so covers searched the literal title ("stl"). Fixed structurally: creation now captures a real destination (Photon autocomplete → `config.destination`), `destinationOf` prefers it, the abbreviation hack is gone, and a manual cover override is the final-say fallback. **No relevance guard was needed** (the destination field + manual override solve it cleanly).
   - **Existing trips still show the old cover** until their destination is set (Edit trip…) or the cover is overridden/reset — see the operator cleanup below.

2. 🔴 **SECURITY — wide-open RLS + leaked API keys** (pre-existing; see memory `voyager-rls-ownership-gap`).
   - `trips` RLS is fully permissive (`qual=true`, incl. an "allow anon delete") — ownership is enforced only in client code, not the DB. Hardening is **entangled with the legacy `Trip.html`** (invite links + `/<slug>` URLs rely on anonymous public read), so it needs its own spec + a decision on the Trip.html sharing future before any policy change. **Do not flip the policies naively** — it breaks sharing/legacy URLs.
   - **Leaked keys:** existing trips had plaintext `config.anthropicKey` (publicly readable). The app now strips `anthropicKey`/`aiKey` on every save (`sanitizeConfig`), but the already-leaked keys must be **rotated at console.anthropic.com** and bulk-stripped from the DB (operator SQL in the spec). Status: **pending operator action.**

## Next up (suggested priority)

0. **Operator cleanup (do now):** rotate the leaked Anthropic keys, then run the bulk `config - 'anthropicKey'` / `config - 'aiKey'` strip (SQL in the spec). Optionally set `config.destination` on existing trips (or just open each in Edit trip… and pick a destination) so their covers re-resolve. **Deploy** the new-trip/cover work to the live URL (`cd app && npm run build && npx wrangler deploy`) — it's pushed but not yet deployed.
1. **~~Manual trip-cover override + landmark relevance guard~~** — ✅ done (shipped to branch; see above). Superseded by the destination-driven approach.
2. **Security: RLS ownership hardening + Trip.html sharing decision** — own spec/task (see memory `voyager-rls-ownership-gap`). Decide whether to migrate sharing fully into the React app (token → React route → membership) and retire Trip.html's anonymous read, then scope owner/member/founder/`share_token`-scoped policies. Backfill NULL `owner_id`s first.
3. **~~Phase 3 — the *real* Guide~~** — ✅ **BUILT** (pushed to branch through `c9b86c7`; **pending operator backend + deploy**). Reframed from "navigation" to a **living itinerary with context** — *Guide tells you why a place matters, not how to get there.* Image-forward Today checklist → current-stop card (hero photo + live distance/ETA/heading chip + Listen + Story/Notice/Experience) → soft geofence arrival (non-blocking banner, ~5s auto-open) → story → Mark complete → next. Navigation delegated to the device maps app (no embedded map). ElevenLabs narration via the cached `narrate` edge function (Web-Speech fallback); selectable cross-device voices via `profiles.settings`. **LOCKED:** no map, narration never auto-plays, ambient discovery deferred. Spec `docs/superpowers/specs/2026-06-20-voyager-guide-premium-modern.md`, plan `docs/superpowers/plans/2026-06-20-voyager-guide-premium-modern.md`.
   - **Status: DEPLOYED + LIVE.** Frontend shipped to the live URL. The TTS edge function is deployed under the **auto-generated slug `hyper-function`** (the client points at it via `NARRATE_FN_SLUG` in `narrate.ts`) on project **`wnpanbjzmcsvhfyjdczv`** (the live one — NOT `gvhtvarqgzjhbjzupdlv`). ElevenLabs narration works; `ELEVENLABS_API_KEY` secret is set.
   - **Guide v2 shipped** (`docs/superpowers/plans/2026-06-20-voyager-guide-v2.md`): real Web-Audio amplitude equalizer + speed toggle (0.75×–2×, local), full day navigation (‹ date › + neighbors + day picker + Add Day→confirm→Plan), non-linear browsing (all stops; reopen completed; un-complete reversible), fixed Story HTML rendering (`renderProse`), tab relabel Notice→"Interesting Facts", Wikipedia-first layered enrichment (extract → metadata → grounded AI, never hallucinate) + ordered hero-image queries.
   - **Guide v2.1 shipped + live:** collapsible "Completed Stops" section beneath the progress header; robust hero-image chain (uploaded → Wikipedia pageimages → **Wikimedia Commons** (free) → **Google Places Photos** (`place-photo` edge fn, `GOOGLE_PLACES_API_KEY` secret) → placeholder). Google Places is **live + verified** (commercial stops like restaurants/cafés now resolve real photos; `place-photo` Storage cache returns `X-Cache: HIT` on repeats, so ~1 Google fetch per place). No client-side key.
   - **Remaining operator steps:** (a) **redeploy the `narrate`/`hyper-function`** with the cache fix in `supabase/functions/narrate/index.ts` (adds the `apikey` header so the Storage cache actually persists — currently `X-Cache` stays MISS so repeats re-synthesize, working but spends quota); (b) if cross-device voice sync is wanted, run `docs/supabase/2026-06-20-guide-migration.sql` on `wnpanbjzmcsvhfyjdczv` (note: narration **speed** is intentionally per-device localStorage, not synced). The `narration` storage bucket already exists.
3. **Full account/settings page** — only a minimal stopgap shipped (AI model/key, units, theme in the `AccountMenu`). Subscription, privacy, help, and a proper settings surface are stubbed "coming soon."
4. **Wikimedia attribution** (optional/legal-nicety) — a single "Cover photos via Wikimedia Commons" line in an About/footer if covers stay.
5. **Merge `voyager-redesign` → main** when the user is ready to make the redesign the canonical branch.

## Explicitly out of scope / deferred (decided, don't build without asking)

- Free-standing (non-stop) reservations — future logistics are modeled as new **stop types** first (principle 4).
- Expense tracking, document vault, passport/boarding-pass upload — excluded by design.

## Working agreements (how the user likes to work)

- Wants to **see things visually** before deciding; iterative; values disciplined **spec → plan → build**.
- **Anti-slop is non-negotiable:** SVG icons only (no emoji), token theming light+dark, a11y. Apply the stop-slop, ui-ux-pro-max, and 21st.dev Magic MCP skills/tools for UI.
- Build via **subagent-driven-development** with **opus** implementers, review, and **commit per task**; **push at checkpoints** so work is safe/revertible.
- Keep everything committed + pushed to GitHub. Tag milestones. Redeploy to Cloudflare so the live URL stays current.

## Quick health check after pulling

```bash
cd app
npm install
npm test        # expect ~294 tests passing
npx tsc -b      # clean
npm run build   # succeeds (one pre-existing chunk-size warning is fine)
```
