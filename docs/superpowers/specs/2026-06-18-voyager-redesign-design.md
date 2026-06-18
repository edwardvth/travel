# Voyager — Complete UI/UX Redesign · Vision Spec

**Date:** 2026-06-18
**Status:** Approved (design) → ready for implementation
**Owner:** Dana
**Repo:** `edwardvth/travel` (local `C:\Users\edwar\travel`)
**Companion doc:** build phases & acceptance criteria live in `docs/IMPLEMENTATION.md`.
This document is **the vision** — keep it stable; track execution separately.

---

## 1. Summary

The existing app is a working travel product (forked from a family project) with a
generic, dark/Google-blue, AI-template aesthetic spread across large single-file HTML
pages. This project is a **complete UI/UX overhaul** into a premium, cohesive consumer
product called **Voyager**, while preserving the existing Supabase backend and all
functionality.

The product is three experiences in one, and the design embraces that:

1. **Dream it** — an aspirational, editorial first impression and trip dashboard.
2. **Plan it** — a calm, fast, confident itinerary planner.
3. **Do it** — a calm, map-forward live walking-tour + landmark-identifier used on-the-go.

**Voyager is a travel _companion_, not a travel _management tool._** Every screen should
reduce cognitive load and tell the user what matters *right now*, not just expose data.

---

## 2. Design North Star

Voyager should feel like:

- A **premium travel magazine**
- A **luxury hotel concierge**
- **Apple Maps** (clarity, calm, spatial confidence)
- **Airbnb Experiences** (warm, human, aspirational)

Voyager should **NOT** feel like:

- A generic SaaS dashboard
- A Google Maps clone
- Booking.com-style information overload
- A typical AI-startup landing page

> **Uber** is a good benchmark for *interaction quality* (confident, precise, one-handed
> live controls) — but **not** for travel inspiration or emotional tone. Borrow its
> interaction discipline; never its utilitarian coldness.

---

## 3. Emotional Design Goals

The emotion a screen should evoke is a first-class requirement. When a design decision is
ambiguous, choose the option that produces the target feeling.

| Moment | User should feel |
|---|---|
| **Landing** (first impression) | **Curious** |
| **Planning** (building a trip) | **Confident** |
| **Traveling** (live tour / navigating) | **Calm** |
| **Exploring** (discovering / identifying places) | **Curious** |
| **Finishing** (story / recap) | **Nostalgic** |

---

## 4. Voyager Voice (product personality)

All copy — buttons, empty states, errors, toasts, onboarding — uses one voice.

Voyager should sound: **Calm · Curious · Confident · Helpful · Human.**

Voyager should never sound: **Corporate · Overly enthusiastic · Excessively witty ·
AI-assistant-like · Overly verbose.**

| Instead of | Use |
|---|---|
| "Your itinerary has been successfully updated." | **"Tomorrow's plan is ready."** |
| "Error loading destination." | **"Couldn't load this place. Try again."** |

Rules of thumb: lead with the outcome, not the system; short over complete; no exclamation
marks by default; no "Oops!"/"Uh-oh!"; speak to a person, not a user; **prefer contractions**
("you're" not "you are", "couldn't" not "could not", "we'll" not "we will") — human, not chatty.

---

## 5. Guiding Principles

1. **Companion, not tool.** Lead with intent, not inventory.
   *Bad: "Here's your itinerary." Good: "Here's what you're doing next."*
   The UI should constantly reduce cognitive load, especially while traveling.
2. **Editorial beauty must not cost information density during active planning.**
   Editorial, full-bleed treatment belongs to *dreaming* surfaces (Landing, Dashboard
   featured trip, Stop hero, Story). **Active-planning surfaces prioritize speed and
   scanning over visual flourish** — dense, legible rows; minimal chrome; fast taps.
   Do not over-design utility screens. *(Referenced below as the "planning-density rule.")*
3. **Every element must have a reason to exist.** If it doesn't aid the current goal, remove it.
4. **Momentum.** Each screen makes the obvious next action effortless and visible.
5. **Calm by default.** Restraint over decoration; motion that orients, never distracts.

---

## 6. Competitive Rule (forcing function)

For every screen, ask:

> **"If Apple, Airbnb, and Notion collaborated on this screen, what would they remove?"**

Then remove it — **remove complexity, not capability.** (Apple sometimes hides too
aggressively; keep the power, lose the clutter.) This is the standing defense against
feature creep and over-design. Apply it in every review before a screen is considered done.

---

## 7. Anti-Patterns — Kill AI Slop

The UI must actively avoid the "AI-generated" look. **Run the anti-slop / "stop slop"
discipline (and `frontend-design` guidance) on every screen before it is done.**

**Never use:**
- Emoji as interface icons (SVG only — Lucide/Heroicons)
- Large gradient blobs
- Floating glass cards everywhere
- Generic Tailwind component-library templates
- Huge hero sections *after* onboarding (heroes belong to first-impression surfaces only)
- Excessive animations
- Fake/artificial loading delays
- Cards inside cards inside cards
- Random accent colors (only the claret signature + gold accent; nothing else)
- Material Design defaults

**Every element should have a reason to exist** (see Competitive Rule).

---

## 8. Goals & Non-Goals

### Goals
- One cohesive design system (color, type, motion, components) across every surface;
  dark-primary with an equally premium light mode.
- Rethink UX per screen — fewer clicks, obvious primary actions, momentum, delight,
  beautiful empty/loading states — guided by the Emotional Goals, Voice, and Principles above.
- Real page transitions and micro-interactions.
- Excellent on every device; layouts may differ per platform (not just scaled).
- Reuse the existing backend and AI features unchanged.

### Non-Goals
- **No backend/schema changes.** Supabase tables, RPCs, edge functions, auth, realtime,
  and the JSONB trip data shape stay as-is.
- No new product features beyond UX affordances around existing ones.
- Final logo art and production domain are not blockers (see Open Items).

---

## 9. Decision Log (locked)

| Decision | Choice |
|---|---|
| Product name | **Voyager** |
| Logo | "Little traveler with a backpack" line mark from the Identity Board (`docs/design/`); distinctive, usable now, may evolve. Finalized later via Claude Design. |
| Brand feel | **Hybrid**: aspirational/editorial for browse+plan → calm/confident for live tools |
| Theme | **Dark primary**, plus a fully-designed, equally premium **light mode** |
| Platform | Excellent on all devices; per-platform layouts allowed (mobile-first authoring) |
| Scope | One design system across **all surfaces**, built in **phases** |
| Build strategy | **Phased modern rebuild** — new React front end, reuse Supabase backend |
| Type | **Fraunces** (display serif) + **General Sans/Satoshi** (UI) + **JetBrains Mono** (data) |
| Signature color | **Claret / brick-red** family (warm, harmonizes with gold Fraunces italics) |
| Component sourcing | Hand-crafted mockups are the visual contract; implement with shadcn/ui + 21st.dev Magic MCP themed to the tokens |

Canonical references: approved mockups in `.superpowers/brainstorm/` (gitignored); the
**Voyager Identity Board** at `docs/design/Voyager Identity Board (standalone).html`.

---

## 10. Visual Identity / Design Tokens

Sourced from the Identity Board. These become the Tailwind theme + CSS variables.

### 10.1 Color — Dark (primary)
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

### 10.2 Color — Light (equally premium)
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
> button-text contrast ≥ 4.5:1. **No accent color outside this set** (see Anti-Patterns).

### 10.3 Typography
```
--serif "Fraunces", Georgia, serif         display / emotional moments; weight 500, italic accent
--sans  "General Sans","Satoshi", system   all UI text
--mono  "JetBrains Mono", ui-monospace      live data: distance, ETA, coordinates, dates
```
Load Fraunces + JetBrains Mono via Google Fonts; General Sans/Satoshi via Fontshare
(self-host in production to avoid latency/FOUT).

### 10.4 Form language
- **Editorial cards** (dreaming surfaces only): full-bleed imagery, text overlaid on a
  gradient — *not* image-top / white-body tiles.
- **Dense rows** (planning surfaces): hairline list rows, thumbnail + text + time, built for
  scanning speed (planning-density rule).
- **Buttons**: confident, **squared** (`--r-btn: 13px`), weight 700, press `translateY(1px)`;
  no full pills, no multi-color gradients. Primary = ink (inverse); brand = claret; plus
  ghost (hairline) and soft (subtle fill).
- **Icons**: SVG only (Lucide/Heroicons) — never emoji.
- **Radii**: card `18`, button `13`, pill for tags only.
- **Spacing**: 4px base scale; generous on dreaming surfaces, tighter/faster on planning surfaces.
- **Depth**: soft layered shadows; glassmorphism only over imagery, never as a default surface.

### 10.5 Motion
- **Page transitions**: View Transitions API; shared-element hero image morphs list → detail.
- **Entrances**: opacity + translateY(12px), 400ms, `cubic-bezier(.22,1,.36,1)`.
- **Micro-interactions**: press `translateY(1px)`/scale .97 (120ms); hover lift -4px; arrow nudge.
- **Lists**: staggered children (~30ms) via Framer Motion.
- **Loading**: real skeletons with shimmer — never fake delays.
- **Always** respect `prefers-reduced-motion`. Restraint over spectacle.

---

## 11. Information Architecture & Navigation

One unified, routed SPA replacing the separate `index.html` / `Trip.html` pages.

```
/                    Landing (first visit) — aspirational hero
/trips               Dashboard (returning) — hybrid working home
/trip/:id            Planner
   ├─ (index)        Itinerary — day rail + stops
   ├─ /stop/:n       Stop detail (shared-element from list)
   ├─ /map           Map (route / all)
   └─ /settings      Settings (trip · data · AI · hotel)
/trip/:id/live       Live walking tour (calm, map-forward, full-screen)
/trip/:id/identify   Camera "what am I looking at?"
/trip/:id/story      Trip story / recap
/auth                Sign in / up (email+pw, Google OAuth, magic link)
```

- **Mobile in-trip nav**: slim bottom tab bar — *Itinerary · Map · Live · Story* — plus a
  persistent, collapsible **"Resume tour"** bar when a tour is active.
- **Desktop in-trip nav**: same destinations as a left rail + split map panel.
- **No reload** between dashboard ↔ planner: shared-element transition.

---

## 12. Screen-by-Screen UX Redesign

> Companion framing applies throughout: copy and layout lead with *what's next*, in the
> Voyager Voice. Detailed acceptance criteria live in `docs/IMPLEMENTATION.md`.

- **Landing** (`/`) — *curious.* Aspirational full-bleed hero (approved), legibility scrims,
  glassy nav with a "Get started" pill. **CTA is a destination search** lifted into the
  upper-center "sky." Below: a 3-beat *Plan · Walk · Remember* story with scroll-reveal,
  then sign-in. The *only* place a giant hero is allowed.
- **Auth** (`/auth`) — keep all methods (email+pw, Google OAuth, magic link, confirm flow,
  URL-error handling); single calm card, claret primary, clear states.
- **Dashboard** (`/trips`) — *confident, anticipatory.* Greeting leads with intent
  (*"Your next trip is in 12 days"*) + a **featured/next trip** hero (countdown, one-tap
  *Resume tour*). Upcoming/Past segmented control. Featured trip editorial; rest scannable.
  Beautiful empty state. Account/sharing/role/credits preserved.
- **New trip** — *confident, fast.* **2-step sheet**: *Where* → *When* (date-range, live
  preview). Same rules + `create_trip` RPC. Target: first trip in <60s.
- **Itinerary** (`/trip/:id`) — *planning surface; density first.* Day rail; stops as **dense
  rows** (not editorial cards), drag-reorder; tap = shared-element to detail. Inline add with
  smart search (≤3 taps). Beautiful empty days with one-tap *"Suggest a day for me."*
- **Stop detail** (`/trip/:id/stop/:n`) — *curious.* Big image, Fraunces title, AI
  history/facts/tips with graceful skeletons. Map peek + Navigate + Mark-done. Gallery and
  "not the right place?" correction preserved.
- **Live tour** (`/trip/:id/live`) — *calm.* Map-forward, big **mono** ETA/distance, bottom
  sheet of upcoming stops, glanceable approach alerts. One-handed, in-sunlight. Preserves
  GPS, nearby OSM, approach detection, walk history.
- **Identify** (`/trip/:id/identify`) — *curious.* Full-screen camera, single shutter,
  confident result card; refined correction picker.
- **Story** (`/trip/:id/story`) — *nostalgic.* Shareable editorial recap; polished read-aloud
  player. Preserves IG/FB captions.
- **Settings** (`/trip/:id/settings`) — Trip · Data · AI · Units; preserve members/invite,
  realtime sync, AI-proxy config.
- **Cross-cutting** — skeletons, toasts, empty states, optimistic updates, light/dark toggle,
  onboarding, PWA install; SVG icons throughout.

---

## 13. Technical Architecture

- **Framework:** Vite + React + TypeScript, single PWA.
- **Styling:** Tailwind with the token theme; CSS variables drive light/dark.
- **Components:** shadcn/ui + **21st.dev Magic MCP**, themed to the tokens to match the
  mockups (mockups are the contract; bend the component, not the design). MCP connected at
  the start of Phase 1.
- **Anti-slop gate:** run "stop slop" / `frontend-design` review on each screen before done.
- **Motion:** Framer Motion + View Transitions API.
- **Routing:** React Router (routes in §11).
- **Data:** existing `@supabase/supabase-js` wrapped in **TanStack Query** (caching,
  optimistic updates, realtime invalidation).
- **Maps:** Leaflet wrapped in a React component.
- **Device APIs:** Geolocation (GPS), camera (Identify).
- **PWA:** keep service worker + offline shell (port `sw.js`).
- **Hosting:** Cloudflare Pages (existing `worker.js`/`wrangler.jsonc`/`_headers`) serving
  the Vite build. Legacy single-file pages retired per phase.

---

## 14. Data Model (existing — preserved)

No changes. From the live code:

- **`trips`**: `id` (text slug, PK), `owner_id` (uuid), `title`, `subtitle`,
  `config` (jsonb), `data` (jsonb), `created_at`, `updated_at`.
  - `config`: `{ title, subtitle, numDays, dayLabels[], dayTitles[], startDate }`
  - `data`: `{ days: [{ title, note, stops: [Stop] }], completed: [], hotel, savedAt }`
  - `Stop`: `{ name, type, time, duration, lat, lng, address, facts[], history, tips,
    image, icon, coords, wikiTitle, note }`
- **`profiles`**: `id` (uuid = auth user), `email`, `name`, `role` (`free`/`founder`), `credits`.
- **`trip_members`**: `trip_id`, `email` (+ user linkage).
- **RPCs**: `create_trip`, `delete_trip`, `add_trip_member`, `remove_trip_member`,
  `create_invite`, `trip_owner_emails` (and others currently called).
- **Edge functions**: `ai-proxy` (Anthropic proxy, rate-limited), `send-invite`.
- **Auth**: Supabase email+pw, Google OAuth, magic link; shared session.
- **Realtime**: `trips` publication for live collaborative edits.

> `SUPABASE_SETUP.md` is stale relative to the current owner/profile/members model — treat
> the live code as source of truth.

---

## 15. Accessibility & Performance (requirements)

- Contrast ≥ 4.5:1 for text; visible focus rings; keyboard nav matches visual order;
  `aria-label` on icon-only buttons; labelled form inputs.
- Touch targets ≥ 44×44px.
- `prefers-reduced-motion` honored everywhere.
- Images: WebP, `srcset`, lazy-load; reserve space to avoid layout shift.
- Body text ≥ 16px on mobile; no horizontal scroll; tested at 375 / 768 / 1024 / 1440.
- Disable buttons during async; clear inline error feedback (in the Voyager Voice).

---

## 16. Success Metrics (north-star)

| Area | Goal |
|---|---|
| Landing | New visitor understands what Voyager is within seconds. |
| Onboarding | New user creates their first trip in **under 60 seconds.** |
| Planning | Add a stop in **≤3 taps**; open a stop in 1 tap. |
| Live | **Navigate without reading instructions.** |
| Story | User **wants to share** their recap. |
| Regression | No loss of existing functionality (auth, sync, AI, GPS, sharing, PWA). |
| Consistency | Unmistakably "Voyager" across all surfaces, light and dark. |

Per-phase, per-screen acceptance criteria: see `docs/IMPLEMENTATION.md`.

---

## 17. Phasing (summary)

Detail and acceptance criteria live in `docs/IMPLEMENTATION.md`.

- **Phase 1 — Foundation + first impression:** design-token system, app shell/routing, logo,
  shared primitives, **Landing + Auth + Dashboard**. Connect 21st.dev MCP. Ships the "wow."
- **Phase 2 — Planner:** itinerary, stop detail, search/add, maps, settings, hotel.
- **Phase 3 — Live companion:** live tour, identify, story, PWA hardening, retire legacy HTML.

---

## 18. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Rebuilding deep live-tour/Identify logic loses subtle fixes | Port behavior faithfully from `Trip.html`; keep it Phase 3; treat current code as behavioral spec. |
| Editorial styling creeps into planning screens | Planning-density rule is hard; dense rows; anti-slop + Competitive Rule reviews check it. |
| Two stacks coexisting during migration | Whole-surface phase boundaries; route-level cutover; retire legacy per phase. |
| 21st.dev MCP output drifts from mockups | Mockups + Identity Board are the contract; theme to tokens; bend the component. |
| Font FOUT / third-party latency | Self-host General Sans/Satoshi; `font-display: swap`; preload display face. |
| Realtime + optimistic conflicts | TanStack Query with realtime invalidation; last-write-wins as today. |

---

## 19. Open Items (non-blocking)

- **Logo** — backpack-traveler mark good for now; final art via Claude Design later.
- **Domain** — design around "Voyager"; pick an affordable variant before launch.
- **Color ramps** — generate 50–900 for `sig`/`gold` (both modes) in Phase 1.
- **21st.dev Magic MCP** — connect at the start of Phase 1.
