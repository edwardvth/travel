# Voyager — Homepage & Trips Premium Refinement · Spec

**Date:** 2026-06-18
**Status:** Draft for approval → then implementation plan
**Scope:** Refine (not rebuild) the Landing (homepage) and Dashboard (/trips) into a luxurious, "alive" premium experience. Built on the existing Phase-1 design system; backend untouched. Branch `voyager-redesign` (restore point tag `phase-1-complete`).

This complements the vision spec (`2026-06-18-voyager-redesign-design.md`) and the build tracker (`docs/IMPLEMENTATION.md`). The Design North Star, Voice, Anti-Patterns, and Competitive Rule from those docs still govern — "alive" must never become "busy."

---

## 1. Decisions (locked)

| Decision | Choice |
|---|---|
| Hero "Cinematic" background | **Real looping video** (config-driven, swappable), with poster-image fallback always rendered first |
| Sequencing | **Homepage + Trips together**, one big review |
| Featured Voyages (future public-itinerary feature) | **Elegant "coming-soon" shell** — real component, graceful placeholder state, no fabricated stats |
| "Future Ideas" in Trips timeline | Maps to **real undated trips** ("Someday"), not invented data |
| Posters / section imagery | Curated **Unsplash** for now; swap for licensed assets later |
| Motion | Subtle, intentional, GPU-accelerated; `prefers-reduced-motion` fully honored; never a dead moment, never busy |

---

## 2. Hero Video System (the centerpiece)

### 2.1 Schema (`app/src/hero/types.ts`)
```ts
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'
export type HeroCategory =
  | 'city' | 'mountains' | 'beach' | 'countryside'
  | 'historic' | 'nightlife' | 'desert' | 'snow' | 'luxury'

/** One curated background clip. Poster is REQUIRED and always renders first. */
export interface HeroClip {
  id: string                     // stable slug, e.g. 'santorini-dawn'
  label: string                  // human label (debug/credits)
  category: HeroCategory
  timeOfDay: TimeOfDay[]         // slots this clip is eligible for
  poster: string                 // always-rendered fallback image (instant paint)
  sources: { src: string; type: 'video/webm' | 'video/mp4' }[] // ordered: webm first
  dominantColor: string          // hex — tunes crossfade bg + text scrim for legibility
  focalPoint?: { x: number; y: number }  // object-position 0..1 (default 0.5/0.5)
  durationSec?: number
  credit: { author: string; source: 'Coverr'|'Mixkit'|'Pexels'|'Pixabay'|'Custom'; url: string; license: string }
  weight?: number                // selection weighting in its slot (default 1)
}

export interface HeroVideoConfig {
  clips: HeroClip[]
  crossfadeMs: number            // default 1200
  minClipDisplayMs: number       // default 9000 (how long a clip shows before advancing)
  windows: Record<TimeOfDay, [number, number]>  // local-hour buckets (24h)
  enableVideoOnMobile: boolean   // default false → poster-only on small/touch
  saveDataPosterOnly: boolean    // honor navigator.connection.saveData / slow effectiveType
}
```

### 2.2 Default config (`app/src/hero/clips.ts`)
- `crossfadeMs: 1200`, `minClipDisplayMs: 9000`
- `windows`: morning `[5,11]`, afternoon `[11,17]`, evening `[17,20]`, night `[20,5]`
- `enableVideoOnMobile: false`, `saveDataPosterOnly: true`
- `clips`: the 10 curated entries (santorini-dawn, alps-lake-morning, kyoto-bamboo, tropical-aerial, tuscany-day, skyline-golden, cappadocia-balloons, amalfi-sunset, tokyo-neon, city-aerial-night). Each: Unsplash poster + placeholder CC0 MP4/WebM (Coverr/Pexels) + dominantColor + credit. **Footage is placeholder-grade; swap licensed cuts later by editing this file + dropping files in `app/public/video/`.**

### 2.3 Behavior (`HeroModeCinematic`)
- Resolve current `TimeOfDay` from local time → pick eligible clips (weighted), shuffle.
- Render a **poster `<img>` base layer** (instant). Above it, two `<video>` layers (A/B) for **crossfade**: play current, preload+decode next, crossfade on `minClipDisplayMs`, advance. `muted loop playsInline preload="metadata"`, no audio track.
- **Legibility:** reuse Landing's layered scrims, tuned by `dominantColor`, so headline/typewriter stay ≥4.5:1.
- **Perf/a11y guards (hard requirements):**
  - `prefers-reduced-motion` → **poster only**, no video, no crossfade.
  - Mobile/touch or `saveData`/slow `effectiveType` → **poster only**.
  - `IntersectionObserver` + `visibilitychange` → pause when hero offscreen or tab hidden.
  - Decode-before-show to avoid flashes; `will-change: opacity` only during crossfade.
- Graceful failure: if a clip errors, stay on poster / skip to next clip. The hero is never blank.

---

## 3. Hero Mode B — Explorer Map (`HeroModeExplorer`)
- Dark premium world map (lightweight inline SVG world or a simplified geo path; **no heavy map lib**).
- Glowing city **nodes** (the manifest destinations) with soft pulse; **animated travel arcs** drawn between a rotating subset (great-circle-ish quadratic curves), slow ambient draw/fade.
- The **currently-typed destination illuminates** (node brightens + label) — `Typewriter` exposes its current term via context/callback so the map can react.
- Canvas for arcs/particles (GPU-friendly) or SVG with CSS animations; `prefers-reduced-motion` → static lit map (nodes shown, no arc animation).
- Toggle between Cinematic ↔ Explorer via a small, tasteful control; remember choice in `localStorage`.

---

## 4. Typewriter (`app/src/hero/Typewriter.tsx`)
- Sequence: type **"Where do you want to go?"** → hold → delete → cycle destinations (Yerevan, Seoul, Rio de Janeiro, Kyoto, Tokyo, Istanbul, Dubai, Milan, Singapore, Santorini, Cappadocia, Cape Town, Banff, Patagonia, Swiss Alps) → finale **"Anywhere."** → loop.
- Tuned speeds (type ~55ms/char, delete ~35ms/char, hold ~1.6s, post-delete ~400ms), blinking caret, jitter-free width.
- `prefers-reduced-motion` → no typing; show a static rotating word changed on a slow, calm interval (or just "Where do you want to go?").
- Exposes `currentTerm` (for Explorer map highlight). Placeholder of the search pill, not a real input value.

---

## 5. Hero Search Pill (fix + polish)
- **Unify the shape:** the "Start planning" button becomes fully rounded to match the pill; button + field read as one component (single rounded container, inner divider only on focus).
- Microinteractions: subtle **glow** + slight **expand** on hover/focus, **arrow nudges** right, smooth easing. GPU transforms only.
- Submitting (Enter or button) routes to `/auth` (unchanged); typed value preserved for later carry-through (Phase 2).

---

## 6. Hero Micro-details
- No fabricated engagement numbers. Tasteful rotating informational line, e.g.: "120+ curated destinations" · "Currently featuring: Yerevan · Seoul · Kyoto" · "Seasonal travel inspiration." Quiet, single line, fades between items.

---

## 7. Homepage sections (below hero)
Order: **Hero → Travel Moods → Popular Destinations → Featured Voyages.** Generous breathing room; scroll-reveal (reduced-motion safe).

- **`TravelMoods`** — cards: Wine Country, Mountain Escape, Big City Energy, Tropical Paradise, Luxury Retreat, Food Adventure, Adventure Travel, Cultural Journey. Editorial image cards, subtle hover lift/zoom. Built to support future filtering (each mood has a stable `key`).
- **`PopularDestinations`** — horizontal scroll-snap rail of large image cards (Yerevan, Seoul, Kyoto, Istanbul, Rio, Singapore, Tokyo, Milan). Lift + subtle zoom on hover; keyboard/scroll accessible; momentum scroll; edge fade.
- **`FeaturedVoyages`** — **coming-soon shell** designed for the future public-itinerary feature: card anatomy (title, creator, short description, save count, "save/duplicate" affordance) shown as an elegant placeholder/"coming soon" state. No fake counts.

---

## 8. Trips page (`/trips`) refinement
- **Page hero:** elegant intro band (greeting + a calm line), lighter than the homepage hero.
- **`TripTimeline`:** group real trips into **Upcoming · Someday · Past** (Someday = undated trips, real data via existing helpers) with elegant timeline styling + subtle animated connectors (reduced-motion → static). Preserves all existing actions (open, share, delete, account menu, new-trip).
- **Empty state:** if no trips, a beautiful exploratory experience (not a blank page) inviting trip creation — can reuse Moods/Popular previews to inspire.

---

## 9. Shared motion & microinteractions (`app/src/components/motion/`)
Small reusable layer on existing tokens:
- `Reveal` (scroll-reveal via IntersectionObserver + Framer, once), `HoverLift` wrapper, image-zoom utility classes, refined `Skeleton` usage, premium button/press states.
- All GPU-accelerated (`transform`/`opacity`), `prefers-reduced-motion` honored centrally.

---

## 10. Component architecture (new files)
```
app/src/hero/
  types.ts            HeroClip / HeroVideoConfig / TimeOfDay / HeroCategory
  clips.ts            default HeroVideoConfig + curated manifest
  timeOfDay.ts        resolveTimeOfDay(date, windows), pickClips(config, tod)
  HeroModeCinematic.tsx
  HeroModeExplorer.tsx
  HeroToggle.tsx
  Typewriter.tsx
  HeroSearchPill.tsx
  HeroMicroDetails.tsx
app/src/sections/
  TravelMoods.tsx
  PopularDestinations.tsx
  FeaturedVoyages.tsx        (coming-soon shell)
app/src/trips/
  TripsHero.tsx
  TripTimeline.tsx
  TripsEmptyState.tsx
app/src/components/motion/
  Reveal.tsx  HoverLift.tsx  motion.css
data:
  app/src/data/moods.ts  app/src/data/destinations.ts  (curated static content)
```
`Landing.tsx` and `Dashboard.tsx` are refactored to compose these (kept thin).

---

## 11. Performance & accessibility (hard requirements)
- Video: poster-first paint, lazy, pause offscreen/hidden, poster-only on mobile/saveData/reduced-motion, decode-before-crossfade. Keep hero JS lean.
- Code-split heavy pieces (Explorer map canvas, video controller) via dynamic `import()` so the initial bundle stays reasonable (also chips at the known ~560 kB bundle).
- All animations `transform`/`opacity`; `prefers-reduced-motion` neutralizes motion everywhere.
- Maintain contrast ≥4.5:1 over video (scrims), focus states, 44px targets, keyboard nav for the horizontal rail and toggle, `<img>`/video `aria` correctness, single `<h1>`.
- Responsive 375 / 768 / 1024 / 1440.

---

## 12. Build sequence (one subagent-driven pass)
1. Hero schema + config + time-of-day resolver (+ unit tests for resolver/pickClips).
2. Typewriter (+ reduced-motion path).
3. HeroSearchPill (unify shape + microinteractions).
4. HeroModeCinematic (video controller + poster fallback + guards).
5. HeroModeExplorer (map + arcs) + HeroToggle.
6. HeroMicroDetails.
7. Shared motion layer (Reveal/HoverLift/motion.css).
8. TravelMoods, PopularDestinations, FeaturedVoyages (+ curated data).
9. Compose new Landing.
10. TripsHero, TripTimeline (Upcoming/Someday/Past), TripsEmptyState; compose new Dashboard.
11. Perf/a11y pass + build/test gate + visual QA checklist.

Each task: spec + quality review, commit; final holistic review; then your big visual review.

---

## 13. Open items
- **Final footage** — placeholder CC0 clips ship now; curate/license real cuts and drop into `app/public/video/` + update `clips.ts` (no code change).
- **Featured Voyages backend** — real shared-itinerary data is a later phase; this pass ships the shell.
- **Section imagery** — Unsplash now; licensed later.
- **Bundle** — dynamic-import the hero heavies; revisit perf budget at the QA gate.
