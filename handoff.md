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

## Specs & plans (read these to understand decisions)

- `docs/superpowers/specs/2026-06-19-voyager-nav-refactor-design.md` — the Plan/Guide/Trip architecture + the 6 product principles + the locked decisions (Reserved language, Trip-not-a-planner guardrail, projection model, minimal account stopgap).
- `docs/superpowers/plans/2026-06-19-voyager-nav-refactor.md` — the NR1–NR7 implementation plan (already executed).
- `docs/superpowers/plans/2026-06-19-voyager-planner-C.md` — the Phase-2 planner plan.
- `docs/IMPLEMENTATION.md` — the build tracker / acceptance criteria / phase gates (if present).

## Known issues / bugs

1. **Landmark cover auto-pick can be wrong** (the "stl → suitcase" case). The Wikipedia search accepts the **first result's thumbnail with no relevance threshold**, so a weak query (an abbreviation, or a non-landmark stop name) can resolve to a generic article (e.g. a luggage/travel image) instead of the city's landmark. Root cause is in `trip/landmark.ts` + `trip/landmark-context.ts` (`fetchLandmarkImage` / `coverImageQueries`).
   - **Recommended fix (next):** (a) add a small **relevance guard** — only accept a Wikipedia page that looks place-like (e.g. has geo-coordinates `prop=coordinates`, or whose title fuzzy-matches the query), and skip generic pages; and (b) add a **manual "Change cover" override** on the trip (a small affordance to pick/replace the cover, storing `config.coverImage`) so the user always has the final say. The manual override is the higher-value, more reliable fix.

## Next up (suggested priority)

1. **Manual trip-cover override + landmark relevance guard** (fixes the suitcase issue above). Small, user-visible, high value.
2. **Phase 3 — the *real* Guide** (currently a teaser): live walking companion — Google-Maps-style turn-by-turn to the next stop, walking directions, arrival narration / audio, "what's nearby," optional wander mode. This is the signature experience. Boundary already decided: *Guide moves you; Trip reassures you.*
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
