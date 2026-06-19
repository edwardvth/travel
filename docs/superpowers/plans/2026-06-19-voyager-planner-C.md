# Voyager Planner — Option C build (full features)

> Executed via subagent-driven-development (opus). Each task: implementer → review → commit. Anti-slop discipline + **SVG icons only, no emoji** on every screen.

**Goal:** Restructure the planner into **Option C** and restore the full feature set, intuitively, on the existing Phase-2 foundation. Backend unchanged.

## Decisions (locked from the brainstorm)
- **Structure (Option C):** desktop = left **sidebar** (Day list + sections); mobile = **bottom tabs**.
  - Sections/tabs: **Plan · Bookings · Map · Settings.** (Days live in the sidebar on desktop / as chips atop Plan on mobile.)
- **Plan** = the split day view (the polished Itinerary: day's stops on the left, map on the right desktop / map-on-top mobile). Rename "Itinerary" → **Plan** everywhere user-facing.
- **Naming:** trip = **Voyage**; the day surface = **Plan**; lodging = **Stay**; add categories = **Do · Eat · Stay**; reservations = **Bookings** with per-stop **To book → Booked** (no aggregate "reserve" jargon).
- **Icons:** add `lucide-react`; replace ALL emoji (incl. `stopTypeEmoji`) with lucide SVGs.
- **Live guide** (Google-Maps-style turn-by-turn + arrival narration) stays **Phase 3** — separate surface.

## Feature placements (contextual, not sections)
- **Weather** — a slim glance line atop each day in Plan (date · temp · condition). Source: **Open-Meteo** (free, no key) by the day's anchor coords (first geocoded stop, else Stay/destination). Cache per day.
- **Walk/travel times** — thin connectors between consecutive stops ("12 min walk"): haversine distance → ~4.8 km/h walking estimate (legacy parity). Mirrored as the map route.
- **Stay** — a pinned card at the top of each day's Plan (from `data.hotel`), its own map pin, and a "Stay" category in Add. Hotel→Stay rename.
- **Do / Eat / Stay** — `stop.kind` ('do'|'eat'|'stay'), derived from legacy `stop.type` where possible; the Add sheet is categorized; rows show a small category icon.
- **Bookings** — `stop.booking` = `{ status:'to_book'|'booked', time?, note? }`. A stop gets a **"To book"** tag + a one-tap **"Mark booked"**; the **Bookings tab** is the filtered checklist (To book / Booked) across the Voyage.
- **Photos** — per-stop gallery in Stop detail: add photo → resize to a small JPEG **data URL** (legacy approach, capped ~1200px/quality) stored in `stop.photos: string[]`; first photo doubles as the stop image. (No storage backend needed.)
- **Change location** — a "Change location" action in Stop detail → search/re-pick (reuses suggest) → updates name/coords. (Replaces legacy "not the right place?".)
- **Getting-started** — minimal first-run coachmarks (2–3) tied to Plan; low priority.

## Types (extend `app/src/types.ts`, additive + index-signature already present)
- `Stop` += `kind?: 'do'|'eat'|'stay'`, `booking?: { status:'to_book'|'booked'; time?: string; note?: string }`, `photos?: string[]`.
- `TripData.hotel` → a typed `{ name?: string; address?: string; note?: string } | null` (already loosely stored).

## Tasks
- **CP1 — Icons + shell to Option C.** Add `lucide-react`. Rework `PlannerLayout` into Option C (desktop sidebar: Day list + Plan-implicit + Bookings/Map/Settings; mobile bottom tabs Plan·Bookings·Map·Settings). Rename Itinerary→Plan (route index stays `/trip/:id`; add `/trip/:id/bookings`). Day selection lives in the sidebar (desktop) / chips atop Plan (mobile), shared via context or URL (`?day=`). Replace emoji with lucide across planner. Keep the split Plan working.
- **CP2 — Do/Eat/Stay.** `stop.kind` + derivation from `type`; categorized Add sheet (Do/Eat/Stay tabs over the existing AI suggest); category icon on rows + stop detail.
- **CP3 — Weather glance.** `useWeather(coords, date)` via Open-Meteo; slim line atop each day; graceful when no coords.
- **CP4 — Walk/travel times.** Pure `walkTime(a,b)` (haversine → minutes) + connectors between stops; tooltip mode (walk). Tests for the helper.
- **CP5 — Stay in Plan.** Stay card atop the day, Stay map pin (distinct), Stay add category writes `data.hotel` or a stay-kind stop (decide: a per-day Stay is the hotel; keep `data.hotel` as the Voyage base + allow stay-kind stops). Keep simple.
- **CP6 — Bookings.** `stop.booking` model; To book/Mark booked actions on rows + stop detail; the **Bookings** tab (filtered checklist, To book / Booked, tap → stop). 
- **CP7 — Photos.** Stop-detail photo gallery: add (resize→dataURL→`stop.photos`), view, set-cover, delete. First photo = stop image.
- **CP8 — Change location.** Stop-detail action → search/re-pick → update name/coords/address.
- **CP9 — Polish + gate.** Anti-slop sweep (no emoji, tokens light+dark, a11y, Voyage voice), consistency, build/test gate, push.

## Guardrails
- Immutable saves via the lifted `save({ data })`; edit-gated; realtime intact. No backend/schema change (all new fields live in the JSONB `data`/`config`). Faithful to legacy where it informs behavior (open `Trip.html`). Each task: build+test green, commit; push after CP1, CP4, CP8, CP9.
