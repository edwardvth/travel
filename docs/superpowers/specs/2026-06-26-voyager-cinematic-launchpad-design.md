# Voyager Home — Cinematic Launchpad + Relocated Field-Globe (Design Spec, revised)

- **Date:** 2026-06-26
- **Status:** Visual approved via live previews (`/x-launchpad-globe`) — ready for implementation planning
- **Branch:** `field-globe-phase-2` (continues here; the field-globe build on this branch is **repurposed**, not discarded)
- **Supersedes:** `2026-06-26-voyager-home-field-globe-phase-2-design.md` (which put the field-globe *behind the launchpad hero card*). That direction is replaced — see §1.

---

## 1. The pivot (why this changed)

The original Phase 2 put a night-Earth globe behind the launchpad hero. Reviewing it live, two problems surfaced:

- **Genre mismatch.** A globe with travel arcs reads as *flight booking / global network* (Expedia, airlines). Voyager is "plan one trip, walk it, remember it" — about *places*, not networks.
- **We already own the right asset.** The landing page's **cinematic destination video hero** (real street-level footage that crossfades as you type, with the typing/deleting search pill) is exactly "your next trip," already built, already licensed-handled.

**Decision:**
1. **The launchpad (State C) becomes a cinematic page** — it reuses the landing hero with the headline **"Where to next?"**, and the clip **dissolves at its bottom into the night-Earth globe**, with the trips gallery overlaid. The globe is now a *"world below,"* not a flight-network behind a card.
2. **The field-globe relocates to the login/signup (Auth) page** as its background — where "the journey begins / the whole world" actually fits.

The Phase-2 `FieldGlobe` component, its shader, adaptive-quality ladder, and fallbacks are **reused** for both the launchpad merge and the Auth background.

## 2. Scope

**In:** State C launchpad (cinematic hero + dissolve-to-globe + trips), the adaptive/perf system for the globe, the field-globe on the Auth page, a shared `CinematicHero` component, removal of the temporary `/x-launchpad` preview route.

**Out (unchanged):** State B cockpit (keeps its current surface), the landing page itself (only *factored*, not redesigned), Plan/Guide/Trip.

## 3. Launchpad layout (the converged design)

Top → bottom (values locked from the approved `/x-launchpad-globe` preview; they are the visual source of truth):

1. **Cinematic hero** — the real `HeroVideoStage` (destination footage + crossfades) with the typewriter `HeroSearchPill`. Eyebrow "PLAN · WALK · REMEMBER", serif **"Where to next?"**, subcopy "Name a city and we'll start the itinerary, day by day." Header shows logo + "+ New trip" (logged-in), not Sign-in/Get-started.
2. **Video brightness `1.8`** — a `brightness(1.8)` filter on the video layer (the landing footage reads too dark for the logged-in home; 1.8 was chosen by eye). Headline/pill legibility must hold at this brightness.
3. **Dissolve transition** — the video layer is masked `linear-gradient(to bottom, #000 70%, transparent 96%)` so its lower third fades to transparent and **merges into the globe's dark sky** (no black panel, no hard cut).

   The transition should feel like a single continuous environment rather than two stacked sections. As the destination footage fades away, it should naturally reveal the night Earth beneath, making the globe feel like the world that exists beyond the cinematic scene instead of a separate background.
4. **The globe** — a tall night-Earth background behind everything; its **dark sky sits behind the clip**, its **bright limb + arcs sit low, behind the bottom of the trip tiles** (preview: globe canvas `top-20vh`, height ~`170vh` — to be re-derived against the production component, see §5).
5. **Trips** — "Your travels", **medium weight, left-aligned**, pulled up close to the pill (preview: `-mt-18vh`); trip cards remain **glass** (`bg-white/6 backdrop-blur-xl border-white/15`) so they read over the globe while allowing the Earth to remain visible beneath.

> These pixel values are the *intended result*. The implementation re-tunes them once the production `FieldGlobe` (not the preview's always-on inline shader) is in place; the acceptance test is "matches the approved preview," not "identical class strings."

**Design principle:** the cinematic footage should be the primary emotional focus, the search pill the primary interaction, and the globe a subtle environmental backdrop that supports — rather than competes with — the content.

## 4. Shared `CinematicHero` component

Extract the landing hero into one reusable component so Landing and Launchpad can't drift:

- `CinematicHero({ headline, subcopy, brightness?, headerRight?, children })` — renders the `HeroVideoStage`, the entrance motion, eyebrow, headline, subcopy, the `HeroSearchPill` (typewriter), `HeroMicroDetails`, and applies the brightness filter to the video layer.
- **Landing** uses it with its headline ("Every trip, beautifully guided."), default brightness, and its Sign-in/Get-started header.
- **Launchpad** uses it with "Where to next?", `brightness={1.8}`, a "+ New trip" header, the masked/dissolve treatment, and the globe + trips below.
- The typewriter-driven clip selection (`clipForWord`/`upcomingClips`) lives in `CinematicHero`.

This is the "copy-paste the elements" request, done as one shared unit instead of duplicated markup.

## 5. The adaptive globe (perf — the key engineering)

Decision (approved): **animated + full safeguards.** The globe stays a live shader on capable devices but is made cheap and never competes with the video.

**Reuse from the existing `FieldGlobe`:** offscreen pause (`IntersectionObserver`), tab-hidden pause (`visibilitychange`), `pagehide`/`pageshow`, the adaptive quality ladder (frame-time → fewer arc samples → lower DPR → 30fps cadence), reduced-motion still-frame, and no-WebGL bail.

**New for this context:**
1. **Make `FieldGlobe` work as the tall dissolve-merge background.** (In preview, an earlier attempt rendered white as a fixed background — the production component must reach the same visual as the proven inline shader; same shader source, so this is a lifecycle/positioning fix, not a visual one.)
2. **Video ↔ globe coordination — they never render at once.** Exactly one animated background may be active at any time. While the cinematic hero is active, the globe is paused (or not yet mounted). Once the hero leaves its active region, the video pauses and the globe becomes active. This guarantee is part of the performance budget and must always hold.
3. **Cheaper baseline** on the launchpad: DPR cap **≤ 1.0**, fbm octaves **5 → 3**, the **5-tap texture blur → 1 tap**, and the canvas **sized to the visible merge area** (not a 170vh monolith). Negligible visual change, large cost cut.
4. **Static globe *image* fallback.** Pre-render one representative frame of the globe to a small WebP (`globe-still.webp`). It is shown (zero per-frame cost) for: `prefers-reduced-motion`, no-WebGL, and the **lowest rung of the adaptive ladder** (a device that keeps missing frames drops all the way to the still image rather than juddering). This replaces the plain-gradient fallback so the fallback still *looks like the globe*.
5. **Lazy-mount** — the WebGL context is created only when the globe nears the viewport; visitors who never scroll down pay nothing.

**Net runtime behavior:**

| Situation | Globe | Video |
|---|---|---|
| On the hero (top) | paused (or not yet mounted) | playing |
| Scrolled to the globe | live, quality-stepped to the device | paused (offscreen) |
| Tab hidden / page suspended | paused | paused |
| Reduced-motion / no-WebGL / weakest devices | static image | playing |

## 6. Auth (login/signup) page

Mount the field-globe as the Auth background, behind the sign-up/sign-in form:
- Same `FieldGlobe` + the same safeguards (here it's the only animated thing, so it can run at a slightly higher quality than the launchpad merge).
- A legibility scrim so the form fields/labels stay readable (Auth text is the priority).
- Reduced-motion / no-WebGL → the static globe image.
- The existing Auth behavior (signup default, `?mode=signin`) is untouched.

## 7. Components, files & repurposing

**New**
- `app/src/components/CinematicHero.tsx` — shared hero (§4).
- `app/src/components/HomeBackground.tsx` *(repurpose)* — becomes the launchpad's globe-merge + trips wrapper (was the static-gradient boundary).
- `app/src/home/useInViewActive.ts` — the shared in-view signal coordinating video↔globe (§5.2).
- `app/src/assets/globe-still.webp` — pre-rendered static globe frame (§5.4).

**Reused (from this branch)**
- `FieldGlobe.tsx`, `field-globe.glsl.ts` (+ params), `adaptive-quality.ts`, `useEarthTexture.ts`, `webgl-support.ts`, `StaticBackdrop.tsx` (now a secondary fallback under the still image), the `earth-night.webp` asset.

**Modified**
- `Landing.tsx` — refactored onto `CinematicHero` (no visual change).
- `Dashboard.tsx` / `Launchpad.tsx` — State C renders the cinematic launchpad.
- `Auth.tsx` — adds the `FieldGlobe` background.
- `App.tsx` — **remove** the temporary `/x-launchpad-*` preview routes; **delete** `routes/_PreviewLaunchpad.tsx`.

## 8. Accessibility & fallbacks

- `prefers-reduced-motion`: video → poster/first frame (existing `HeroVideoStage` behavior) and globe → static image.
- No-WebGL / context-loss: static globe image; page fully usable.
- Headline + pill legible over the 1.8-brightness footage (both themes); Auth form legible over its globe + scrim (AA).
- No layout shift; the static image reserves the globe's space so the dissolve never jumps.

## 9. Testing

- **Unit/RTL:** `CinematicHero` renders headline/subcopy/pill and applies the brightness filter; Landing + Launchpad both consume it. `useInViewActive` toggles correctly (mock `IntersectionObserver`). `FieldGlobe` still bails/falls-back without WebGL; reduced-motion → no loop. The adaptive ladder's new bottom rung resolves to "static image". Existing Launchpad/Dashboard/Auth tests stay green. `tsc -b` clean.
- **Manual/perf:** on a throttled mid-range mobile profile — (a) at the hero, the globe loop is **not** running; (b) scrolled to the globe, the **video** is paused and the globe holds ~60fps or steps down gracefully; (c) reduced-motion shows the still image; (d) the dissolve matches the approved preview. Confirm video+globe are never both animating (DevTools performance / frame markers).

## 10. Perf budget

- Only one animated background at a time (the core guarantee).
- Globe: DPR ≤ 1.0 on the launchpad, ≤ 1.5 on Auth; single quad; reduced octaves/taps; paused unless onscreen+visible+active; lazy-mounted.
- **GPU cleanup:** when `FieldGlobe` unmounts, all WebGL resources (textures, framebuffers, shaders, buffers, programs, and context references) are released to avoid retaining GPU memory across navigation.
- Target: no sustained dropped frames on a Moto-class phone; instant first paint (static backdrop/image never waits on WebGL or the video).

## 11. Open / deferred

- Exact re-tuned merge values (mask %, globe top/height, tiles `-mt`) — finalized in-build against the production component to match the preview.
- Whether the launchpad globe should ever animate *arcs only* at the lowest live rung before dropping to the still image — decide during perf testing.
- A bespoke/Americas-centric Earth texture — trivial swap later.
- State B cockpit background — out of scope.

## 12. Success criteria

- The launchpad feels like opening the beginning of your next journey rather than a traditional dashboard. Destination footage flows seamlessly into the night Earth below, with "Your travels" naturally sitting within that world. The overall impression is calm, cinematic, and premium.
- It **does not lag**: the globe never runs alongside the video, scales to the device, and falls back to a still image when needed.
- The field-globe finds its right home on the login page.
- Landing is unchanged visually; no regressions; `tsc -b` clean; suite green.
