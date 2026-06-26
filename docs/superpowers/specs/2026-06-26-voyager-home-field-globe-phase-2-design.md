# Voyager Home — Phase 2: Field-Globe Background (Design Spec)

- **Date:** 2026-06-26
- **Status:** Visual approved (live prototype signed off) — ready for implementation planning
- **Branch:** TBD at build (Phase 2 worktree off `main`)
- **Builds on:** Phase 1 (shipped/live) — the Launchpad already renders a static fallback backdrop behind which this swaps in.
- **Revises:** §8 of `docs/superpowers/specs/2026-06-24-voyager-home-context-redesign-design.md`. That section specified a *non-literal* atmosphere and explicitly "never a recognizable globe/map." **We deliberately reverse that line.** Iterating live with the user, the abstract flow-field read as "weird soup"; a literal-but-distant **night-Earth limb seen from space** is what landed. Everything else in §8 still holds (subordinate, dark, optional, fallback-first, perf-bound).

---

## 1. What we're building

A WebGL2 fragment-shader background for the **State C launchpad**: the curved limb of the **Earth at night**, seen from low orbit. A warm orange atmospheric limb fades up into blue airglow; the dark earth below the curve carries **gold city lights** that follow real continents (sampled from a night-lights texture) plus crisp synthesized sparkle; faint stars sit in the space above; one or two slow **travel arcs** rise off the limb and fade, echoing its curve.

It is **strictly subordinate** to the foreground "Where to next?" headline + search pill. Success test (unchanged from §8): *the user feels it, never comments on it.* It must **never block shipping** — every failure path lands on Phase 1's static gradient.

**Reference & port intent:** the approved prototype `scratchpad/field-earth.html` (its shader + the baked parameter values below) is the **visual reference** for the initial implementation. The React/WebGL build must **preserve the prototype's visual output and behavior**; its internal organization may differ as needed for lifecycle integration, readability, and maintainability. The shader is **not frozen** — future visual improvements are expected and welcome, but they should arrive through normal design review, not accidental implementation drift. The aim is fidelity of the *result*, not a line-for-line copy of the prototype.

## 2. Decisions locked

- **Tech:** raw **WebGL2** fragment shader, single full-screen triangle, no library (dependency-light, matches the codebase's no-three.js philosophy).
- **Earth texture:** a **compressed WebP** (~1024×512, target 60–120KB), **lazy-loaded** after the page is interactive. Until it loads (or if it fails), the shader still renders — the texture sampler defaults to a dark 1×1 pixel and the synthesized city lights / landmasses carry the look. So the texture is an *enhancement*, never a dependency.
- **Earth image:** the clean public-domain night-lights world map already fetched to `scratchpad/earth-night.png` (NASA-style Black Marble equivalent, 2048×1024). Build downscales + encodes it to the shipped WebP.
- **Fallbacks:** reduced-motion → one still frame (no rAF). No-WebGL2 / context-loss / SSR → Phase 1's static gradient (the existing Launchpad backdrop), unchanged.

## 3. Architecture & file structure

```
Launchpad (State C hero)
  └─ <HomeBackground>            ← NEW boundary: chooses shader vs static fallback
       ├─ <FieldGlobe>           ← NEW WebGL2 component (the night-Earth shader)
       └─ <StaticBackdrop>       ← the Phase 1 gradient + map-grid, extracted as-is
```

**New files**
- `app/src/home/FieldGlobe.tsx` — the WebGL2 component. **Owns the entire WebGL lifecycle and all GPU resource ownership**: context creation, shader compile/link, **GPU texture creation + upload**, single-quad draw loop, uniform upload, DPR cap, resize, IntersectionObserver offscreen-pause, page-lifecycle pause (`visibilitychange`, `pagehide`/`pageshow` — see §7), reduced-motion static branch, WebGL/context-loss feature-detection **and restoration** (recreate program + re-upload the texture on `webglcontextrestored`). On its **first successful draw** it fades the canvas opacity `0 → 1` (see "Initial paint & fade-in" below). **Mirrors the proven lifecycle skeleton of `app/src/hero/HeroModeExplorer.tsx`** (same guards, same StrictMode safety) — that file is the reference implementation for everything except the rendering API (WebGL2 instead of canvas2d).
- `app/src/home/field-globe.glsl.ts` — the vertex + fragment shader source as exported string constants (preserving the prototype's visual output — see §1) plus the baked `FIELD_GLOBE_PARAMS`, exported **immutable** (`as const`, or `Object.freeze`) so the signed-off visual constants cannot be mutated at runtime.
- `app/src/home/useEarthTexture.ts` — a small **internal utility** that only *fetches and decodes* the WebP image (lazy, after first paint via `requestIdleCallback` / `setTimeout` fallback) and hands the decoded bitmap/`HTMLImageElement` back; it **does not own any WebGL object**. The GL texture (create, GPU upload, re-upload on context restore, dispose) lives entirely in `FieldGlobe`, so all GPU resources stay under the component that owns the context. No-ops cleanly when `Image` is unavailable (SSR/jsdom).
- `app/src/components/HomeBackground.tsx` — the boundary. Always renders `<StaticBackdrop>` as the **first and immediate paint**; mounts `<FieldGlobe>` above it (transparent until its first frame) only when WebGL2 is supported and not SSR. The static layer shows through until/unless the shader paints, and remains underneath permanently as the fallback.
- `app/src/components/StaticBackdrop.tsx` — the Phase 1 launchpad backdrop (radial gradient + faint map-grid), extracted from `Launchpad.tsx` so both the fallback and the live path share one source of truth.
- `app/src/assets/earth-night.webp` — the shipped texture (build artifact; generated from the stand-in PNG).

**Initial paint & fade-in (no-flash progressive enhancement)**
- `StaticBackdrop` renders **immediately** — it is the hero's first paint and never waits on anything.
- `FieldGlobe` mounts above it with its canvas at **opacity 0**, and stays fully transparent until it has *all* of: created the WebGL2 context, compiled + linked the shaders, and completed its **first successful draw**.
- On that first successful frame, fade the canvas `0 → 1` over **~200–300ms**. This removes any compile/first-frame flash while the static gradient shows through underneath.
- This is **visual polish only**: it must never delay or block rendering the hero. If the shader never reaches a first frame (slow GPU, failure), the static backdrop simply remains — no degraded or half-state is ever shown.

**Modified**
- `app/src/components/Launchpad.tsx` — replace the inline backdrop `<div>` (the radial-gradient + map-grid block) with `<HomeBackground />`. Nothing else about the hero (headline, subcopy, pill, value trio / Past voyages) changes.

## 4. The shader (baked)

The shader reproduces the approved visual output of `scratchpad/field-earth.html` (§1 — preserve the result, organize internally as needed). Parameters are **baked constants** (the prototype proved them); they live in `FIELD_GLOBE_PARAMS`, exported **immutable** (`as const` / frozen), so the subordination pass (§6) can tune a handful by eye in source — and so the signed-off values can never be accidentally mutated at runtime.

```
uHorizon  -0.06    uCurve     0.50    uGlow      0.60    uWarmth    0.40
uCities    1.10    uEarthZoom 0.43    uEarthPanY 0.12    uDrift     0.02
uArcOpacity 0.12   uArcCount  2       uArcSpeed  0.04    uArcHeight 0.16
uVignette  0.70    limb = (1.00,0.64,0.30)   air = (0.30,0.55,0.96)
```

Uniforms supplied per frame: `uResolution`, `uTime`, `uEarth` (sampler), and `uReduce` (1.0 freezes time at a fixed value for the reduced-motion still frame — same trick as the prototype's frozen `t`).

## 5. Fallback tiers (never a blank or a block)

| Condition | Result |
|---|---|
| WebGL2 + motion OK | full animated night-Earth shader |
| `prefers-reduced-motion` | shader compiled, **one still frame** (`uReduce=1`, no rAF loop) |
| No WebGL2 / context-loss / SSR / jsdom | **StaticBackdrop only** (Phase 1 gradient) — `FieldGlobe` not mounted or bails silently |
| Texture not yet loaded / failed | shader renders with synthesized lights (no photo continents) over StaticBackdrop |

`HomeBackground` always renders `StaticBackdrop` first and immediately; `FieldGlobe` layers over it, transparent until its first successful frame, then fades in (§3 "Initial paint & fade-in"). Listen for `webglcontextlost` → stop the loop, prevent default, and reveal the static layer; on `webglcontextrestored` recreate the program and re-upload the texture, then fade back in on the next successful frame.

## 6. Subordination pass (the one real build-time tuning task)

In the prototype the limb is bright along the top arc, where the headline sits. Before this ships, tune for text dominance — pick ONE or combine, judged by eye with the headline + pill overlaid:
- lower the curve so the bright limb sits below the headline band, and/or
- a soft top-down scrim (a `radial-gradient`/`linear-gradient` overlay in `HomeBackground`, matching the hero's existing legibility scrims), and/or
- trim `uGlow` near the top via a vertical falloff in the shader.

**Acceptance:** the white "Where to next?" headline and the pill are comfortably legible at AA contrast over the brightest frame, on both the light and dark app themes, mobile and desktop. The background must never be the first thing the eye lands on.

## 7. Performance budget

- Single full-screen triangle; one texture sample set per pixel (the 5-tap blur stays — it's cheap at this resolution).
- **DPR capped at 1.5.** Texture lazy-loaded post-interactive; decode off the main paint.
- **Target: 60fps on a mid-range phone** (test on a throttled device / Moto-class).

**Pause/resume (page lifecycle).** Stop the rAF loop and resume it based on *all* of:
- `IntersectionObserver` — pause when the launchpad scrolls offscreen.
- `visibilitychange` — pause when the tab is hidden.
- **`pagehide` / `pageshow`** — pause/resume for bfcache + aggressive page suspension (notably mobile Safari), which `visibilitychange` alone doesn't reliably cover. On `pageshow` (incl. `event.persisted` bfcache restores) resume only if onscreen and visible.

The loop runs only when onscreen **and** the page is visible/active; any signal flipping false stops it.

**Adaptive quality (degrade, don't stutter).** The 60fps target stays, but if sustained frame times indicate the device can't hold smooth animation, the implementation **may automatically reduce rendering cost while preserving the overall look** rather than dropping frames. Measure a rolling average of frame time; when it crosses a threshold for a sustained window, step down (and, if it recovers, optionally step back up). Allowed reductions, roughly in order of least-visible first:
- **reduce travel-arc sample count** (the per-pixel bezier loop is the hottest term — 3 arcs × 27 taps),
- **lower the effective DPR cap** (e.g. 1.5 → 1.0),
- **render animation at a reduced cadence** (e.g. throttle to ~30fps).

Degradation must preserve the composition (limb, earth, city lights, palette) — it trims cost, never changes the look. Any active cap is internal/automatic; document the thresholds in code so it isn't a silent mystery.

## 8. Theme & tokens

The hero text is white-on-dark in both app themes (the launchpad backdrop is intrinsically dark), so the shader's palette stays as baked. Where the design system has matching tokens (claret `--sig`, `--gold`), reference them for the scrim and any DOM chrome rather than new hex. The shader's internal GLSL constants stay inline (canvas can't read CSS vars cheaply) but are documented as deriving from the claret/gold/ink family.

## 9. Testing

- **Unit / RTL (vitest + jsdom):**
  - `HomeBackground` renders `StaticBackdrop` always **and as the immediate first paint**; mounts `FieldGlobe` only when WebGL2 is detectable (mock `getContext` returning null → no canvas / fallback present).
  - `FieldGlobe` canvas starts at **opacity 0** (transparent until first frame); bails cleanly with no WebGL2 (jsdom path) — no throw, `aria-hidden`, no rAF.
  - Reduced-motion → static branch: no animation loop scheduled (assert `requestAnimationFrame` not called in a loop), one paint.
  - Page-lifecycle: `pagehide` pauses the loop; `pageshow` resumes when onscreen+visible (mock the events; assert rAF cancel/schedule). Same for `visibilitychange`.
  - `FIELD_GLOBE_PARAMS` is frozen/immutable (assigning a member is a no-op / throws in strict mode).
  - `useEarthTexture` no-ops without `Image`; returns the decoded image on load and owns no GL object.
  - `Launchpad` still renders headline + pill + (value trio | Past voyages); existing Launchpad tests stay green.
- **Manual / perf:** visual check with headline overlay (subordination acceptance, both themes); 60fps on a throttled mobile profile; context-loss simulation (`WEBGL_lose_context`) drops to static.

## 10. Out of scope (deferred)

- Auto-discovery / per-trip imagery, offline shader caching (later minimap/initiative phases).
- The State B cockpit background (stays as-is).
- A user toggle for the shader (YAGNI — reduced-motion + auto-fallback cover the real needs).
- Swapping in a bespoke / Americas-centric Earth image — trivial later (drop the asset, repoint `useEarthTexture`).

## 11. Success criteria

**Progressive enhancement (explicit, non-negotiable):**
- The Launchpad hero becomes visible **immediately** using `StaticBackdrop` — first paint never waits on WebGL, shader compilation, or the texture.
- `FieldGlobe` is a **progressive enhancement** layered *afterward*: it mounts transparent and fades in only on its first successful frame.
- The shader must **never delay, block, or replace** the initial hero render. If it never starts or fails at any point, the static backdrop simply remains, and the hero is fully usable throughout.

**Quality:**
- The launchpad reads as a calm "world from space," felt not noticed; headline + pill always dominate.
- Zero blank/flash states: static gradient covers every load and failure path; the shader's first frame fades in (no compile flash).
- 60fps mobile; no jank — degrades quality adaptively rather than stuttering; pauses when offscreen/hidden/suspended.
- No regression to Phase 1 Launchpad behavior or tests; `npx tsc -b` clean; full suite green.
