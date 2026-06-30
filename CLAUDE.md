# Passage — Project Guide (CLAUDE.md)

> This file is auto-loaded by Claude Code. It's the evergreen guide to the project.
> For "what's done / what's next right now," read **`handoff.md`** (next to this file).

## What this is

**Passage** is a premium consumer **travel-planning PWA** (plan a travel day-by-day, with AI place suggestions, maps, photos, weather, walking times, and reservations). The user-facing journey object is called a **travel** (plural **travels**); note the code identifiers — the `Trip` type, `useTrips`, `/trips` routes, etc. — keep the legacy "trip" name. It was forked from a generic travel-itinerary app and rebuilt into a polished product. Design north stars: Uber's interaction quality + an editorial/aspirational travel brand.

- **Repo:** `github.com/edwardvth/travel` (a **fork** of `magakh/travel` — never push to `upstream`) · **Active branch:** `main` (the `voyager-redesign` branch was consolidated into `main` and deleted; all work is on `origin/main`).
- **Local path:** `C:\Users\edwar\travel` (Windows; shell is Git Bash / PowerShell).
- **Live:** https://voyager.edwardvth.workers.dev (Cloudflare Worker named `voyager`).
- The real app lives in **`app/`** (the Vite project). The repo root also has the legacy `Trip.html` single-file app (still served as a fallback for pretty `/<slug>` URLs).

## North star & product principles (don't violate these)

> **A travel is a collection of stops. Plan builds them, Guide brings them to life, and Manage keeps the commitments attached to them.**

In-travel navigation is **three intent-tabs**, each a traveler *mindset*, not a feature (visible labels: **Plan · Guide · Manage**):
- **Plan** — build the itinerary (day-by-day split view: stops list + map).
- **Guide** — live the travel (Phase-3 live walking companion; currently an aspirational *teaser* only).
- **Manage** — manage commitments (Stay · Upcoming · Still to arrange · Travel details · Manage). NOTE: this tab's route is still `/trip/:id/trip` and its component is `Trip.tsx` — only the visible label changed.

Principles:
1. A tab is a mindset, not a feature.
2. One data model, many lenses — Plan and Trip are read/write **projections** over the same `data`.
3. Inside a Voyage, every screen serves *this* trip; global stuff lives at the Dashboard/account level.
4. **The stop is the atomic object** — enrich stops; don't add parallel object systems. (Future logistics like transfers/trains = new stop *types*, not new objects.)
5. Duplication is allowed in UI, never in data.
6. **Trip is never a planning surface** — it reflects + manages; it never reorders/adds stops or edits the itinerary.

## Tech stack

- **Frontend (`app/`):** Vite + React 18 + TypeScript + Tailwind (CSS-variable token theming, dark + light), React Router (nested routes), TanStack Query, Framer Motion, **Leaflet** (OpenStreetMap tiles — no Google Maps), `@dnd-kit` (drag reorder), `lucide-react` (icons). Tests: **vitest**.
- **Backend:** **Supabase** — a `trips` table holding JSONB `config` + `data`; realtime via `postgres_changes`; RLS-scoped `trip_members`; edge functions `ai-proxy` (Claude proxy, founder/credits-gated, server-side key; `DEFAULT_MODEL=claude-sonnet-4-6`), `send-invite` (Resend), `hyper-function` (narration), `place-photo`, `pexels-video` (destination hero-video proxy; `PEXELS_API_KEY` server-side; `video_cache` table), `enrich-place` (**shared place-description cache** authority — service-role sole reader/writer of the `place_cache`/`place_cache_audit` tables; verifies via Google Place Details, generates via ai-proxy, stores history/facts/tips/notice/**good_for**; prompt `CURRENT_ENRICH_VERSION` bump = regenerate), `delete-account` (account deletion → `delete_account_data` RPC). The AI key is server-side, never in the client. **Live project ref: `wnpanbjzmcsvhfyjdczv`** (the `gvhtvarqgzjhbjzupdlv` in older notes is stale — deploying against it silently misses the live app). Edge-function source lives in `supabase/functions/`; one-off SQL in `supabase/sql/` + `docs/supabase/`.
- **Hosting:** **Cloudflare Workers** via `wrangler.jsonc` (worker name `voyager`). `worker.js` serves `app/dist` (ASSETS binding) + SPA fallback to `index.html`, and redirects legacy `/<slug>` → `Trip.html`. **No `_redirects` file** — Workers Assets rejects it (SPA fallback is handled in `worker.js`).

## Commands (run from `app/` unless noted)

```bash
cd app
npm install
npm run dev        # local dev server
npm test           # vitest run (full suite)
npx tsc -b         # typecheck (must be clean)
npm run build      # tsc -b && vite build → app/dist
npm run preview    # preview the production build
```

**Deploy** (from repo root, after `cd app && npm run build`):
```bash
npx wrangler deploy        # needs a one-time `npx wrangler login` (browser OAuth)
```
There is **no CI** — deploys are manual. After deploy, smoke-test routes return 200 (`/`, `/trips`, `/trip/x/guide`, `/trip/x/trip`).

## Design system / "anti-slop" rules (enforced on every UI change)

- **SVG icons only (lucide) — never emoji.** Consistent sizing.
- **Tokens, light + dark** (CSS vars): `--base`, `--ink`, `--muted`, claret signature (`--sig` / `bg-sig-btn` / `text-sig-link`), `--gold`, `--fill` / `--fill-hover`, `--hair`, `--raised`, `--overlay`. Use the Tailwind token classes (`bg-base text-ink`, `text-muted`, `border-hair`, `bg-fill`, etc.) — no hardcoded hex that breaks a theme.
- **Fonts:** Fraunces (serif, `font-serif`) for display; General Sans / Satoshi (sans) for body; JetBrains Mono (`font-mono`) for data.
- a11y: ≥44px touch targets, `aria-*` on icon-only buttons, labelled inputs, focus rings, focus-trap+esc+restore on sheets/menus, `prefers-reduced-motion`. No layout shift (reserve space / fade). Hover via color/opacity, not layout-shifting scale.
- The skills to apply for UI work: **stop-slop / anti-slop**, **ui-ux-pro-max**, and **21st.dev Magic MCP** (if connected — it wasn't during the build, so surfaces were hand-built to the same bar).

## How the code is organized (`app/src/`)

- `App.tsx` — routes. `/trip/:id` is the planner (`PlannerLayout`) with nested `index`=Plan (`Itinerary`), `guide`=`Guide`, `trip`=`Trip` (the dashboard), `stop/:day/:n`=`StopDetail`. Legacy redirects: `/bookings`→`/trip`, `/map`→Plan, `/settings`→`/trips`. **Public legal routes** (App Store): `/privacy-policy` + `/tos` (`routes/PrivacyPolicy.tsx`, `Terms.tsx`, `LegalLayout.tsx`) with `/privacy`→`/privacy-policy`, `/terms`→`/tos`. `worker.js` keeps these out of the legacy `/<slug>` redirect via its `reserved` set.
- **Auth & account** (`app/src/auth/`): `AuthProvider` (Google/Apple OAuth, magic link, `deleteAccount`), `redirect.ts` (`getAuthRedirectTo()` — web vs native `ai.mypassage.app://` deep link), `deleteAccount.ts` (`requestAccountDeletion` → `delete-account` edge fn → `delete_account_data` RPC). **Sign in with Apple is gated OFF** via `APPLE_SIGNIN_ENABLED=false` in `routes/Auth.tsx` until Apple Developer enrollment. In-app **account deletion** (Apple 5.1.1(v)) lives in `components/AccountSettings.tsx` (Danger zone + `DangerConfirm`). **App Store push = the "Mac implementation"; see `handoff.md`.**
- `routes/` — `Landing`, `Auth`, `Dashboard`, `ShareSheet`. **`Dashboard` owns the home's data/effects (auth guard, trips/profile, cover backfill, share/delete dialogs) and renders `components/HomePage.tsx`**. **`HomePage` LANDS on the focus trip when there is one** (`UpcomingJourney` — the former CockpitHome "State B": brand header + "Welcome back, {firstName}." + featured `CockpitCard` over its destination video), otherwise on the **"Where to next?" hero** (the live `CommandPill`); "Your travels" (`TravelsList`) sits below either, over the night-Earth globe. **With a trip, "+ New trip" rolls the "Where to next?" create hero DOWN into the page** (in flow, scroll on past it to the trip), and the trip beneath switches to `UpcomingJourney`'s compact `stacked` form. **Trip creation is the `CommandPill` (sole creation surface — `NewTripSheet` retired)** → `useCreateTrip` → navigate, with the `MaterializeOverlay` seed-card flight into the planner. `selectFocusTrip` (active-wins) picks the focus trip. `routes/_home-explorations/` = archived preview mockups (reference-only, **tsconfig-excluded**, not routed).
- `trip/` — the planner: `PlannerLayout` (3-tab shell + lifted day selection + lifted autosave), `Itinerary` (Plan split view), `StopList`/`StopRow`/`StopDetail`, `AddStop`, `Trip.tsx` (the Trip dashboard), `Guide.tsx` (teaser), `TripMapView` (reusable Leaflet map), `StayCard`, `StopPhotos`, `ChangeLocation`.
  - Helpers/data: `helpers.ts` (`dayDate`, `dayLabel`, `formatDayDate`, `dayStops`…), `reservation.ts` (reservation status/set/all + legacy `booking` read-compat), `hotel.ts`/`stay.ts`, `walk.ts` (haversine walk times), `suggest.ts` (AI place suggestions), `enrich.ts` (AI history/facts/tips), `richtext.ts` (`formatInline` — safe inline emphasis for AI prose), `landmark.ts` + `landmark-context.ts` (Wikipedia landmark images), `photo.ts` (resize→dataURL), `location.ts` (change-location), `icons.tsx` (central lucide re-exports + `stopKind`/`kindIcon`).
- `data/` — TanStack Query hooks: `useTrips` (+ `useDeleteTrip`, `useBackfillCoverImage`), `useProfile`, `useAccountSettings` (global AI/units/theme in localStorage), `useLandmarkImage`, `useLandmarkBackfill`, `useStopDescription` (+ `usePrefetchStopDescriptions`, `applyStopDescription`).
  - **Stop descriptions (Story/Facts/Experience + `goodFor`)** flow through `useStopDescription` → `runGenerate`: for **placeId stops** it consults the **shared cache first** (`lib/enrichClient.ts` `fetchPlaceDescription` → `enrich-place` edge fn → `place_cache` table) — a cross-trip HIT is instant + free, a MISS generates+caches server-side, and any non-ready result falls back to local `trip/enrich.ts` `generateStopDetail`. **By-name stops** (no placeId) always use local generation. The durable per-stop copy still lives in the trip JSONB (`applyStopDescription`). Pure cache types in `trip/placeCache/types.ts`. `hours`/`price` chips are **Google Place Details** (`trip/placeDetails.ts`), deliberately NOT cached (they change); only the AI text (incl. `goodFor`) is cached.
  - Both surfaces feed the cache: **Guide** uses `useStopDescription` (auto-generates on view); **`StopDetail`'s Generate/Re-generate button** routes through it too — first-time Generate = cache-first (`runGenerate`); a **founder** Re-generate force-writes the shared entry (`regeneratePlace(placeId, true)`); others re-pull the library. (Earlier `StopDetail` called `generateStopDetail` directly and never populated the cache — fixed.) **Only placeId stops ever appear in `place_cache`** (by-name stops generate locally, by design).
- `components/` — `AppShell`, `AccountMenu` + `AccountSettings`, `ui/` (Button, Input, Sheet, Segmented, Skeleton, IconButton, **`stars` = starfield background**), `ConfirmDialog`, `ThemeToggle`, `Logo`, `SplashIntro`.
  - **Cinematic home** (see `routes/` above): `HomePage` (lands on the trip or the "Where to next?" hero; "+ New trip" rolls the create hero down in flow), `CinematicHero` (shared hero — Landing passes `onSubmit`→`/auth`; the home passes `renderPill` to inject the `CommandPill`), `UpcomingJourney` (the trip landing — CockpitHome-style "Welcome back" + `CockpitCard`; a compact `stacked` form when it sits under the create hero), `TravelsList` (grouped sections) with `TravelTile`/`TripRow`, `CockpitCard`/`lib/cockpit-model.ts` (the featured-trip card), `home-style.tsx` (shared shadows, `SoftBackdrop`, `HomeCredits` footer). View-model: `lib/home-groups.ts` (`homeGroups`/`filterTrips`/`isUndatedTrip`, tested) + `lib/focus-trip.ts` (`selectFocusTrip`, active-wins).
  - **`components/home/`** (Phase-3 command pill): `CommandPill` (four-beat creation pill: destination + Photon autocomplete → anchored `RangeCalendar` or "Don't know dates yet" → confirm; emits `onCommit`), `RangeCalendar` (a11y date-range grid; pure logic in `lib/range-calendar.ts`), `MaterializeOverlay` + `materialize-controller.ts` (the "seed-card flight" that survives the home→planner route change — **mounted in `App.tsx` above `<Routes>`**; `PlannerLayout` calls `materialize.arrive()` on mount), `useHeroPillInView` (drives the "+ New trip" fade). Helpers: `lib/pill-resolution.ts` (strict resolved-place gate, unit-tested — the pill advances ONLY on a real autocomplete prediction, never raw typed text), `lib/cover-prefetch.ts` (hook-free `warmCover`/`peekCover`, warmed on destination commit). Spec/plan: `docs/superpowers/{specs,plans}/2026-06-27-voyager-home-pill-phase-3*`.
- `home/` — `FieldGlobe.tsx` (night-Earth WebGL2 background; `staticFrame` prop renders ONE high-quality frame, no animation loop), `useInViewActive` (one-animated-background coordination), `field-globe.glsl.ts`, `useEarthTexture`, `adaptive-quality`.
- `hero/` — the landing/home hero (cinematic video / explorer modes, typewriter) + `useDestinationClip.ts` (curated `wordClips` → Pexels `destinationVideo.ts` → girl-walking fallback for the State-B hero) + `HeroVideoStage`.

## Data shapes (all additive in JSONB — never a schema migration)

- `Stop { name; type?; time?; duration?; lat?; lng?; address?; coords?; note?; kind?:'do'|'eat'|'stay'; facts?[]; history?; tips?; image?; photos?:string[]; wikiTitle?; reservation?:{ status:'to_reserve'|'reserved'; time?; confirmation?; note? }; booking?(legacy) }`
- `Day { title; note?; stops: Stop[] }`
- `TripData { days: Day[]; completed: string[]; hotel?: Hotel|string|null; savedAt? }` — `completed` keys are `"<dayIndex>-<stopIndex>"`.
- `Hotel { name?; address?; note?; lat?; lng?; checkIn?; checkOut? }`
- `TripConfig { title?; subtitle?; startDate?; numDays?; dayLabels?[]; dayTitles?[]; units?; aiModel?; aiKey?; notes?; coverImage?; [k:string]:unknown }`

## Working conventions

- **Immutable saves only.** In the planner, persist via the lifted `save({ title?, subtitle?, config?, data? })` from the `PlannerOutletContext` (single debounced autosave instance in `PlannerLayout`; flush-on-unmount; optimistic). Never mutate cached `trip`/`data` in place — clone, then save.
- **Edit-gated:** all writes guarded by `canEdit`; view-only users (shared trips) see read-only state.
- **Back-compat:** read legacy fields (`stop.booking`, string `hotel`, missing `config`) gracefully; new fields are additive.
- **Specs & plans:** design specs in `docs/superpowers/specs/`, implementation plans in `docs/superpowers/plans/`. Build method = **subagent-driven-development** (an opus implementer per task, spec + code-quality review, commit per task, push at checkpoints, a holistic review at the end).
- **Git:** work on `main` (push to `origin/main` only — never `upstream`). Commit messages end with the Co-Authored-By trailer. Tags mark milestones (`phase-1-complete`, `phase-2-planner-c`, `phase-3-nav-refactor`).

## Gotchas

- **Deploy-clobber:** the live `voyager` worker is **last-`wrangler deploy`-wins for the whole app** — no per-feature layering. Deploying a branch that lacks a shipped feature will silently remove it from live (this is how the account-deletion/legal work briefly vanished). **Anything that must stay live MUST be on `main` before you deploy.** `main` is the source of truth; merge first, then build + deploy.
- Leaflet map: `attributionControl: false` (removes watermark); single instance reflowed via `invalidateSize` for the split view.
- Landmark images: Wikipedia `action=query&generator=search&prop=pageimages` with `origin=*` (CORS, no key). Accepts the first result's thumbnail — **no relevance threshold yet** (see `handoff.md` known issues).
- AI key/model/units are stored in the **global** account store (localStorage) now, not per-trip; nothing in the client reads them at runtime (the key is server-side in `ai-proxy`).
