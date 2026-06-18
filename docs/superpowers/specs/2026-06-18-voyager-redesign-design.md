# Voyager — Complete UI/UX Redesign · Design Spec

**Date:** 2026-06-18
**Status:** Approved (design) → ready for implementation plan
**Owner:** Dana
**Repo:** `edwardvth/travel` (local `C:\Users\edwar\travel`)

---

## 1. Summary

The existing app is a working travel product (forked from a family project) with a
generic, dark/Google-blue, AI-template aesthetic spread across large single-file HTML
pages. This project is a **complete UI/UX overhaul** that re-skins and re-architects the
front end into a premium, cohesive consumer product called **Voyager**, while preserving
the existing Supabase backend and all functionality.

The product is three experiences in one, and the design embraces that:

1. **Dream it** — an aspirational, editorial first impression and trip dashboard.
2. **Plan it** — a calm, confident itinerary planner.
3. **Do it** — a utilitarian, map-forward live walking-tour + landmark-identifier used
   on-the-go.

**Success metric (unchanged from brief):** a first-time user reacts with *"This is
surprisingly beautiful and intuitive for such a straightforward concept"* — closer to a
polished venture-backed startup than a CRUD app.

---

## 2. Goals & Non-Goals

### Goals
- A single cohesive design system (color, type, motion, components) applied across every
  surface, dark-primary with an equally premium light mode.
- Rethink UX per screen: fewer clicks, obvious primary actions, momentum, moments of
  delight, beautiful empty/loading states.
- Real page transitions and micro-interactions (the thing single-file HTML can't do well).
- Excellent on every device; layouts may differ per platform (not just scaled).
- Reuse the existing backend and AI features unchanged.

### Non-Goals
- **No backend/schema changes.** Supabase tables, RPCs, edge functions, auth, realtime,
  and the JSONB trip data shape stay as-is.
- No new product features in this initiative beyond UX affordances around existing ones.
- Final logo art and production domain are **not** blockers (see Open Items).

---

## 3. Decision Log (locked)

| Decision | Choice |
|---|---|
| Product name | **Voyager** |
| Logo | "Little traveler with a backpack" line mark from the Identity Board (`docs/design/`); usable now, may evolve. Finalized later via Claude Design. |
| Brand feel | **Hybrid**: aspirational/editorial for browse+plan → utilitarian/confident for live tools ("dream it → do it") |
| Theme | **Dark primary**, with a fully-designed, equally premium **light mode** |
| Platform | Excellent on all devices; per-platform layouts allowed (mobile-first authoring) |
| Scope | One design system across **all surfaces**, built in **phases** |
| Build strategy | **Phased modern rebuild** — new React front end, reuse Supabase backend |
| Type | **Fraunces** (display serif) + **General Sans/Satoshi** (UI) + **JetBrains Mono** (data) |
| Signature color | **Claret / brick-red** family (warm, harmonizes with gold Fraunces italics) |
| Component sourcing | Hand-crafted mockups are the visual contract; implement with shadcn/ui + 21st.dev Magic MCP themed to the tokens (MCP to be connected at build time) |

The approved mockups live in `.superpowers/brainstorm/` (gitignored) and the
**Voyager Identity Board** at `docs/design/Voyager Identity Board (standalone).html` is the
canonical visual reference.

---

## 4. Visual Identity / Design Tokens

Sourced from the Identity Board. These become the Tailwind theme + CSS variables.

### 4.1 Color — Dark (primary)
```
--base       #0A0A0C      app background
--raised     #141417      cards / raised surfaces
--overlay    #1B1B20      sheets / popovers
--ink        #F4F3F0      primary text (warm white)
--muted      #8E8E96      secondary text
--hair       rgba(255,255,255,.10)   hairline borders
--hair-strong rgba(255,255,255,.16)
--gold       #FFD9A8      Fraunces italic accent words
--sig        #9C3D3A      signature (claret) base
--sig-btn    #B0473F      primary buttons
--sig-link   #C56A60      links / accents
--shadow-soft  0 1px 2px rgba(0,0,0,.4), 0 12px 40px -12px rgba(0,0,0,.7)
--shadow-lift  0 2px 6px rgba(0,0,0,.45), 0 30px 80px -28px rgba(0,0,0,.8)
```

### 4.2 Color — Light (equally premium)
```
--base       #FAF8F5      warm paper
--raised     #FFFFFF
--overlay    #FFFFFF
--ink        #14141A
--muted      #6A6A72
--hair       rgba(20,20,26,.10)
--hair-strong rgba(20,20,26,.16)
--gold       #A86A2A      (deeper for contrast on light)
--sig-link   #8A2F2C
--shadow-soft  0 1px 2px rgba(36,28,20,.06), 0 18px 50px -20px rgba(36,28,20,.18)
--shadow-lift  0 2px 8px rgba(36,28,20,.08), 0 36px 90px -32px rgba(36,28,20,.24)
```
> Generate full 50–900 ramps for `sig` and `gold` in both modes during Phase 1; verify
> button-text contrast ≥ 4.5:1 (claret buttons use white text; gold accents use dark text).

### 4.3 Typography
```
--serif "Fraunces", Georgia, serif         display / emotional moments; weight 500, italic accent
--sans  "General Sans","Satoshi", system   all UI text
--mono  "JetBrains Mono", ui-monospace      live data: distance, ETA, coordinates, dates
```
Loading: Fraunces + JetBrains Mono via Google Fonts; General Sans/Satoshi via Fontshare
(self-host in production to avoid third-party latency/FOUT).

### 4.4 Form language
- **Editorial cards**: full-bleed imagery with text overlaid on a gradient — *not*
  image-top / white-body tiles. Hairline list rows for dense lists.
- **Buttons**: confident, **squared** (`--r-btn: 13px`), weight 700, press = `translateY(1px)`;
  no full pills, no multi-color gradients. Primary = ink (inverse); brand = claret; plus
  ghost (hairline) and soft (subtle fill).
- **Icons**: SVG only (Lucide/Heroicons set) — **never emoji** as UI icons.
- **Radii**: card `18`, button `13`, pill for tags only.
- **Spacing**: 4px base scale (4·8·12·16·20·24·32·48·64); generous by default = the "premium air."
- **Depth**: soft layered shadows (`--shadow-soft` / `--shadow-lift`), restrained glassmorphism
  only where it earns it (overlays on imagery).

### 4.5 Motion
- **Page transitions**: View Transitions API; shared-element hero image morphs list → detail.
- **Entrances**: opacity + translateY(12px), 400ms, `cubic-bezier(.22,1,.36,1)`.
- **Micro-interactions**: press `translateY(1px)`/scale .97 (120ms); hover lift -4px with shadow growth; button arrow nudges.
- **Lists**: staggered children (~30ms) via Framer Motion.
- **Loading**: skeletons with shimmer.
- **Always** respect `prefers-reduced-motion`.

---

## 5. Information Architecture & Navigation

One unified, routed SPA replacing the separate `index.html` / `Trip.html` pages.

```
/                    Landing (first visit) — aspirational hero
/trips               Dashboard (returning) — hybrid working home
/trip/:id            Planner
   ├─ (index)        Itinerary — day rail + stops
   ├─ /stop/:n       Stop detail (shared-element from list)
   ├─ /map           Map (route / all)
   └─ /settings      Settings (trip · data · AI · hotel)
/trip/:id/live       Live walking tour (utilitarian, full-screen)
/trip/:id/identify   Camera "what am I looking at?"
/trip/:id/story      Trip story / recap
/auth                Sign in / up (email+pw, Google OAuth, magic link)
```

- **Mobile in-trip nav**: slim bottom tab bar — *Itinerary · Map · Live · Story* — plus a
  persistent, collapsible **"Resume tour"** bar when a tour is active.
- **Desktop in-trip nav**: same destinations as a left rail + split map panel.
- **No reload** between dashboard ↔ planner: shared-element transition (trip hero image
  morphs into the planner header).

---

## 6. Screen-by-Screen UX Redesign

### 6.1 Landing (`/`)
Aspirational full-bleed hero (approved), legibility scrims, glassy top nav with a "Get
started" pill. **The CTA is a destination search** ("Where do you want to go? → Start
planning"), lifted into the upper-center "sky." Below the fold: a 3-beat **Plan · Walk ·
Remember** story with scroll-reveal motion, then sign-in. Solves the current bare list's
"what is this?" problem.

### 6.2 Auth (`/auth`)
Keep all existing methods (email+password, Google OAuth, magic link, email-confirm flow,
URL-error handling). Re-skin to the system: single calm card, claret primary, clear states.

### 6.3 Dashboard (`/trips`)
Greeting + a **featured / next trip** hero (countdown, one-tap *Resume tour*). Trips split
into **Upcoming / Past** as an elegant segmented control (replaces current detail/summary
tabs). Trip cards = editorial full-bleed (overlaid title in Fraunces, mono meta). Empty
state is beautiful and invites the first trip. Account menu, sharing, founder/role and
credits logic preserved.

### 6.4 New trip
Replace the single dense modal with a **2-step sheet**: *Where* (destination + title) →
*When* (date-range picker) with a live preview. Same slug/title/profanity/teaser rules and
`create_trip` RPC underneath; fewer visible fields.

### 6.5 Itinerary (`/trip/:id`)
Day rail (horizontal chips on mobile / vertical on desktop). Stops as editorial rows
(thumbnail, time, type, drag-reorder). **Tap = shared-element open to detail.** Inline
"add stop" with smart search (existing AI + OSM suggest). Empty days get a beautiful empty
state with one-tap **"Suggest a day for me."** Weather strip and hotel surfaced cleanly.

### 6.6 Stop detail (`/trip/:id/stop/:n`)
Big image, Fraunces title, then AI **history / facts / tips** in clean sections. Generate/
enrich shows graceful **skeletons**, never blank. Map peek + Navigate + Mark-done. Photo
gallery, "not the right place?" correction, and verified `wikiTitle`/coords logic preserved.

### 6.7 Live walking tour (`/trip/:id/live`)
Where the **utilitarian** direction earns its place: dark, map-forward, big **mono** ETA/
distance, a bottom sheet of upcoming stops, glanceable landmark alerts on approach. Built
for one-handed, in-sunlight, on-the-move use. Preserves GPS tracking, nearby (OSM) cards,
approach detection, walk history, high-accuracy shutter GPS.

### 6.8 Identify (`/trip/:id/identify`)
Full-screen camera, single shutter, confident result card; refined "not the right place?"
correction picker (real nearby OSM places or type a name). Preserves landmark-vs-restaurant
classification fixes.

### 6.9 Story / recap (`/trip/:id/story`)
Generated recap as a shareable, editorial layout; read-aloud as a polished player. Preserves
IG/FB caption generation, custom types, notes.

### 6.10 Settings (`/trip/:id/settings`)
Tabs: Trip (days + hotel) · Data (export/import/reset) · AI · Units (metric/imperial).
Re-skin; preserve members/invite UI, realtime sync, and the AI-proxy config.

### 6.11 Cross-cutting
Global skeletons, toasts, empty states, optimistic updates, real light/dark toggle,
onboarding/getting-started, PWA install. SVG icon set throughout.

---

## 7. Technical Architecture

- **Framework:** Vite + React + TypeScript, single PWA.
- **Styling:** Tailwind CSS with the token theme above; CSS variables drive light/dark.
- **Components:** shadcn/ui primitives + **21st.dev Magic MCP** components, each themed to
  the tokens to match the approved mockups (mockups are the contract; bend components to
  them, never the reverse). MCP connected at build time.
- **Motion:** Framer Motion + View Transitions API.
- **Routing:** React Router (routes in §5).
- **Data:** existing `@supabase/supabase-js` client wrapped in **TanStack Query** (caching,
  optimistic updates, realtime invalidation).
- **Maps:** Leaflet (existing) wrapped in a React component.
- **Device APIs:** Geolocation (GPS), camera (Identify), as today.
- **PWA:** keep service worker + offline shell (port `sw.js`; bump cache strategy).
- **Hosting:** Cloudflare Pages (existing `worker.js` / `wrangler.jsonc` / `_headers`),
  now serving the Vite build output.

The current single-file pages remain in the repo until each surface is migrated, then are
retired phase by phase.

---

## 8. Data Model (existing — preserved, documented for reference)

No changes. Observed from the live code:

- **`trips`**: `id` (text slug, PK), `owner_id` (uuid), `title`, `subtitle`,
  `config` (jsonb), `data` (jsonb), `created_at`, `updated_at`.
  - `config`: `{ title, subtitle, numDays, dayLabels[], dayTitles[], startDate }`
  - `data`: `{ days: [{ title, note, stops: [Stop] }], completed: [], hotel, savedAt }`
  - `Stop`: `{ name, type, time, duration, lat, lng, address, facts[], history, tips,
    image, icon, coords, wikiTitle, note }`
- **`profiles`**: `id` (uuid = auth user), `email`, `name`, `role` (`free`/`founder`), `credits`.
- **`trip_members`**: `trip_id`, `email` (+ user linkage) — sharing.
- **RPCs**: `create_trip`, `delete_trip`, `add_trip_member`, `remove_trip_member`,
  `create_invite`, `trip_owner_emails` (and any others currently called).
- **Edge functions**: `ai-proxy` (Anthropic proxy, rate-limited), `send-invite` (email).
- **Auth**: Supabase email+password, Google OAuth, magic link; shared session across surfaces.
- **Realtime**: `trips` table publication for live collaborative edits.

> Note: `SUPABASE_SETUP.md` describes an older public-RLS schema and is stale relative to
> the current owner/profile/members model. Treat the live code as source of truth.

---

## 9. Phasing

**Phase 1 — Foundation + first impression**
Design-token system (Tailwind theme, light/dark), app shell + routing, logo component,
shared UI primitives, **Landing + Auth + Dashboard** (incl. new-trip sheet, sharing).
*This is the "wow" we ship first.* Connect 21st.dev Magic MCP here.

**Phase 2 — Planner**
Itinerary (day rail, stop rows, drag-reorder), stop detail (shared-element, AI enrich),
search/add, maps (route/all), settings, hotel, weather, prebook. TanStack Query + realtime.

**Phase 3 — Live companion**
Live walking tour, Identify (camera), Story/recap, onboarding polish, PWA/offline hardening,
retire legacy HTML.

Each phase ships independently behind the same design system.

---

## 10. Accessibility & Performance (requirements)

- Contrast ≥ 4.5:1 for text (verify claret/gold combos); visible focus rings; keyboard nav
  matches visual order; `aria-label` on icon-only buttons; labelled form inputs.
- Touch targets ≥ 44×44px.
- `prefers-reduced-motion` honored everywhere.
- Images: WebP, `srcset`, lazy-load; reserve space to avoid layout shift.
- Body text ≥ 16px on mobile; no horizontal scroll; tested at 375 / 768 / 1024 / 1440.
- Disable buttons during async; clear inline error feedback.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Rebuilding deep live-tour/Identify logic loses subtle fixes | Port behavior faithfully from `Trip.html`; keep it Phase 3 after the system is proven; treat current code as the behavioral spec. |
| Two stacks coexisting during migration | Phase boundaries are whole surfaces; route-level cutover; legacy pages retired per phase. |
| 21st.dev MCP output drifts from mockups | Mockups + Identity Board are the contract; theme components to tokens; bend component, not the design. |
| Font loading FOUT / third-party latency | Self-host General Sans/Satoshi; `font-display: swap`; preload display face. |
| Realtime + optimistic updates conflicts | TanStack Query with realtime invalidation; last-write-wins as today. |

---

## 12. Open Items (non-blocking)

- **Logo** — backpack-traveler mark is good for now; final art via Claude Design later.
- **Domain** — design around the name "Voyager"; pick an affordable variant
  (`getvoyager.com`, `voyager.app`, etc.) before launch.
- **Color ramps** — generate 50–900 for `sig`/`gold` (both modes) in Phase 1.
- **21st.dev Magic MCP** — connect at the start of Phase 1.

---

## 13. Success Criteria

- A new user understands and feels the product within seconds on the Landing screen.
- Core flows (create trip → plan a day → open a stop → start a tour) feel effortless with
  fewer clicks than today.
- Visual language is consistent and unmistakably "Voyager" across all surfaces, in both
  light and dark.
- No regression in existing functionality (auth, sync, AI, GPS, sharing, PWA).
- The first-impression reaction target in §1 is met.
