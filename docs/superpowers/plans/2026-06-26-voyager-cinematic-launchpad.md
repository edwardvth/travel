# Voyager Cinematic Launchpad + Relocated Field-Globe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the State C launchpad into a cinematic page (landing hero + "Where to next?" → dissolve into the night-Earth globe + "Your travels" trips), relocate the field-globe to the Auth page, and make the globe adaptive so it never lags (one animated background at a time, cheaper baseline, static-image fallback).

**Architecture:** A shared `CinematicHero` (extracted from `Landing`) renders the video stage + typewriter pill for both pages. The launchpad composes `CinematicHero` (masked to dissolve, brightness 1.8) over a tall `FieldGlobe`, with `useInViewActive` guaranteeing the video and globe never animate at once. `FieldGlobe` gains lazy-mount, a configurable cheaper baseline, a static-image fallback rung, an external `active` gate, and full GPU cleanup.

**Tech Stack:** Vite + React 18 + TS + Tailwind, framer-motion, vitest + @testing-library/react + jsdom. WebGL2 (no library).

**Spec:** `docs/superpowers/specs/2026-06-26-voyager-cinematic-launchpad-design.md`
**Visual source of truth:** the approved preview `app/src/routes/_PreviewLaunchpad.tsx` (committed `206799d`) — its globe variant holds the exact mask/position/`-mt` values. It is DELETED in Task 9.

**Setup:** Continue on the existing `field-globe-phase-2` worktree (`C:\Users\edwar\travel\.claude\worktrees\field-globe-phase-2`). Run commands from `app/`. `.env.local` is already present. Keep `npx tsc -b` clean and `npm test` green per task.

**Layer order (front→back), fixed (spec §3):** Header → Hero content → Trip cards → masked video → FieldGlobe → static backdrop.

---

## Task 1: Shared `CinematicHero` + `HeroVideoStage` pause prop

**Files:**
- Modify: `app/src/hero/HeroVideoStage.tsx`
- Create: `app/src/components/CinematicHero.tsx`, `app/src/components/CinematicHero.test.tsx`
- Modify: `app/src/routes/Landing.tsx`
- Modify: `app/src/hero/HeroVideoStage.test.tsx` (add pause test)

- [ ] **Step 1: Add a `playing` prop to HeroVideoStage (pause = halt playback + stop decoding new frames)**

In `app/src/hero/HeroVideoStage.tsx`, extend props and pause the videos when not playing.

Change the interface:
```tsx
export interface HeroVideoStageProps {
  clip: HeroClip
  upcoming?: HeroClip[]
  className?: string
  /** When false, both video layers pause (no new frames decoded). Default true. */
  playing?: boolean
}
```
Change the signature + add a pause effect (insert after the prefetch effect, before `const scrimColor`):
```tsx
export function HeroVideoStage({ clip, upcoming, className, playing = true }: HeroVideoStageProps) {
```
```tsx
  /* External pause: halt playback (and new-frame decoding) when not playing;
     resume on reactivation. Part of the "one animated background" guarantee. */
  useEffect(() => {
    const vids = [videoARef.current, videoBRef.current]
    for (const v of vids) {
      if (!v) continue
      if (playing) { v.play?.()?.catch(() => {}) }
      else { try { v.pause?.() } catch { /* jsdom */ } }
    }
  }, [playing, posterOnly])
```

- [ ] **Step 2: Write the failing pause test**

Append to `app/src/hero/HeroVideoStage.test.tsx`:
```tsx
import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { HeroVideoStage } from './HeroVideoStage'

const CLIP = {
  id: 'p', label: 'p', category: 'historic', timeOfDay: ['morning'], season: ['spring'],
  poster: '/video/paris.jpg', sources: [{ src: '/video/paris.mp4', type: 'video/mp4' }],
  dominantColor: '#222', focalPoint: { x: 0.5, y: 0.5 }, weight: 1,
} as never

describe('HeroVideoStage pause', () => {
  it('pauses video elements when playing=false', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    const { rerender } = render(<HeroVideoStage clip={CLIP} playing />)
    rerender(<HeroVideoStage clip={CLIP} playing={false} />)
    expect(pause).toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
```
Run: `npx vitest run src/hero/HeroVideoStage.test.tsx` → the new case passes once Step 1 is in (run before Step 1 to see it fail: `pause` not called).

- [ ] **Step 3: Create CinematicHero (the shared hero)**

`app/src/components/CinematicHero.tsx`:
```tsx
import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Mark } from './Logo'
import { HeroSearchPill } from '../hero/HeroSearchPill'
import { HeroMicroDetails } from '../hero/HeroMicroDetails'
import { HeroVideoStage } from '../hero/HeroVideoStage'
import { clipForWord, FIRST_CLIP, upcomingClips } from '../hero/wordClips'
import type { HeroClip } from '../hero/types'

/**
 * CinematicHero — the single source of truth for the landing AND launchpad hero
 * (spec §4/§7). Renders the controlled HeroVideoStage (clip driven by the
 * typewriter), the entrance motion, eyebrow, headline, subcopy, the HeroSearchPill
 * (types/deletes), and HeroMicroDetails. Shared hero visual changes are made HERE,
 * never duplicated per page.
 *
 * Per-page knobs: headline/subcopy/eyebrow, the right-hand header content, a video
 * brightness filter, an optional dissolve mask on the video layer (launchpad), and
 * a `videoPlaying` gate for the one-animated-background guarantee.
 */
export interface CinematicHeroProps {
  headline: ReactNode
  subcopy: ReactNode
  eyebrow?: string
  headerRight?: ReactNode
  /** brightness() multiplier on the video layer. 1 = as-is. */
  brightness?: number
  /** CSS mask applied to the video layer (launchpad dissolve). */
  videoMask?: string
  /** When false, the video pauses (coordination). Default true. */
  videoPlaying?: boolean
  onSubmit: (destination: string) => void
  className?: string
}

export function CinematicHero({
  headline, subcopy, eyebrow = 'Plan · Walk · Remember', headerRight,
  brightness = 1, videoMask, videoPlaying = true, onSubmit, className,
}: CinematicHeroProps) {
  const reduce = useReducedMotion()
  const [clip, setClip] = useState(FIRST_CLIP)
  const [upcoming, setUpcoming] = useState<HeroClip[]>([])
  const onWord = (word: string) => {
    setClip(clipForWord(word))
    setUpcoming(upcomingClips(word, 3))
  }

  const videoLayer = (
    <HeroVideoStage clip={clip} upcoming={upcoming} playing={videoPlaying} className="absolute inset-0" />
  )

  return (
    <section className={className ?? 'relative h-[100svh] min-h-[620px] overflow-hidden'}>
      {videoMask || brightness !== 1 ? (
        <div
          className="absolute inset-0"
          style={{
            ...(videoMask ? { WebkitMaskImage: videoMask, maskImage: videoMask } : null),
            ...(brightness !== 1 ? { filter: `brightness(${brightness})` } : null),
          }}
        >
          {videoLayer}
        </div>
      ) : (
        videoLayer
      )}

      <nav className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 md:px-10 py-5 md:py-6 text-white">
        <span className="inline-flex items-center gap-2 font-sans font-extrabold tracking-tight">
          <span className="text-sig-link"><Mark size={30} /></span>
          <span className="font-serif text-[20px] md:text-[23px]">Voyager</span>
        </span>
        {headerRight}
      </nav>

      <motion.div
        initial={reduce ? false : { y: 12 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-full flex-col items-center px-5 text-center text-white pt-[16vh] md:pt-[18vh]"
      >
        <div className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.32em] text-white/85">
          {eyebrow}
        </div>
        <h1
          className="mt-4 font-serif font-medium tracking-tight text-[44px] leading-[1.02] md:text-[70px]"
          style={{ textShadow: '0 2px 30px rgba(0,0,0,.6)' }}
        >
          {headline}
        </h1>
        <p className="mt-4 md:mt-5 font-sans italic text-[15px] md:text-[18px] text-white/85">
          {subcopy}
        </p>
        <HeroSearchPill
          onSubmit={onSubmit}
          onWordStart={onWord}
          className="pointer-events-auto mt-[calc(8vh_+_2.25rem)] md:mt-10"
        />
        <HeroMicroDetails className="mt-4" />
      </motion.div>
    </section>
  )
}

export default CinematicHero
```

- [ ] **Step 4: Write the CinematicHero test**

`app/src/components/CinematicHero.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CinematicHero } from './CinematicHero'

describe('CinematicHero', () => {
  it('renders headline, subcopy, and the search pill', () => {
    render(<CinematicHero headline="Where to next?" subcopy="Name a city." onSubmit={vi.fn()} />)
    expect(screen.getByText('Where to next?')).toBeInTheDocument()
    expect(screen.getByText('Name a city.')).toBeInTheDocument()
    // the pill input is labelled "Where do you want to go?"
    expect(screen.getByLabelText(/where do you want to go/i)).toBeInTheDocument()
  })

  it('applies the brightness filter to the video layer when set', () => {
    const { container } = render(
      <CinematicHero headline="x" subcopy="y" brightness={1.8} onSubmit={vi.fn()} />,
    )
    expect(container.innerHTML).toMatch(/brightness\(1\.8\)/)
  })
})
```
Run: `npx vitest run src/components/CinematicHero.test.tsx` → PASS.

- [ ] **Step 5: Refactor Landing.tsx onto CinematicHero (no visual change)**

Replace the hero `<section>` in `app/src/routes/Landing.tsx` (the whole `<section className="relative h-[100svh] ...">…</section>` block) with a `CinematicHero` usage that reproduces its current look, keeping the rest of the file (the feature trio + CTA sections) unchanged:
```tsx
<CinematicHero
  className="relative h-[100svh] min-h-[600px] overflow-hidden"
  headline={<>Every trip,<br /><span className="italic text-gold whitespace-nowrap">beautifully guided.</span></>}
  subcopy="Made for travelers, by travelers"
  onSubmit={go}
  headerRight={
    <div className="flex items-center gap-5 md:gap-7 text-[14px] text-white">
      <span className="hidden sm:inline-flex">
        <AnimatedLink href="/auth?mode=signin" onClick={(e) => { e.preventDefault(); goSignin() }} className="text-[14px]">
          Sign in
        </AnimatedLink>
      </span>
      <ClaretPill onClick={goSignup}>Get started</ClaretPill>
    </div>
  }
/>
```
Add `import { CinematicHero } from '../components/CinematicHero'`. Remove now-unused imports from Landing (`HeroVideoStage`, `HeroSearchPill`, `HeroMicroDetails`, `clipForWord/FIRST_CLIP/upcomingClips`, `HeroClip`, the `clip`/`upcoming`/`onWord` state) — let `npx tsc -b` flag leftovers and clean them.

- [ ] **Step 6: Verify Landing unchanged + commit**

Run: `npx vitest run src/routes/Landing.test.tsx src/components/CinematicHero.test.tsx src/hero/HeroVideoStage.test.tsx` (expect green — Landing's existing tests assert its headline/links, which still render).
Run: `npx tsc -b` (clean).
Manual: `npm run dev`, confirm `/` looks identical.
```bash
git add src/hero/HeroVideoStage.tsx src/hero/HeroVideoStage.test.tsx src/components/CinematicHero.tsx src/components/CinematicHero.test.tsx src/routes/Landing.tsx
git commit -m "feat(hero): extract shared CinematicHero + HeroVideoStage pause prop"
```
(Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` — use a heredoc.)

---

## Task 2: Configurable cheaper shader baseline

**Files:** Modify `app/src/home/field-globe.glsl.ts`, `app/src/home/field-globe.glsl.test.ts`

Goal: `fragmentSource` accepts options to reduce per-pixel cost (fbm octaves, texture-blur taps). Defaults preserve the current look; the launchpad passes the cheaper variant.

- [ ] **Step 1: Write the failing test**

Append to `app/src/home/field-globe.glsl.test.ts`:
```ts
describe('fragmentSource cost options', () => {
  it('defaults to 5 octaves + 5-tap blur (current look)', () => {
    const f = fragmentSource()
    expect(f).toMatch(/i<5/)              // fbm octaves
    expect(f).toMatch(/texture\(uEarth, uv \+ vec2\(0\.004,0\.0\)\)/) // blur taps present
  })
  it('can emit a cheaper variant (3 octaves, no blur taps)', () => {
    const f = fragmentSource(undefined, { octaves: 3, blur: false })
    expect(f).toMatch(/i<3/)
    expect(f).not.toMatch(/texture\(uEarth, uv \+ vec2/)
  })
})
```

- [ ] **Step 2: Run → fail** (`fragmentSource` takes one arg). `npx vitest run src/home/field-globe.glsl.test.ts`.

- [ ] **Step 3: Implement the options**

In `app/src/home/field-globe.glsl.ts`, change the `fbm` definition and the earth-blur block to be generated from options. Update the signature:
```ts
export interface FragOpts { octaves?: number; blur?: boolean }

export function fragmentSource(p: FieldGlobeParams = FIELD_GLOBE_PARAMS, opts: FragOpts = {}): string {
  const octaves = opts.octaves ?? 5
  const blur = opts.blur ?? true
```
Replace the hard-coded `fbm` line with an interpolated octave count:
```ts
  const fbmFn = `float fbm(vec2 p){ float v=0.,a=0.5; for(int i=0;i<${octaves};i++){ v+=a*snoise(p); p*=2.02; a*=0.5; } return v; }`
```
and inject `${fbmFn}` where the `float fbm(...)` line currently sits in the template.
Replace the earth-sample blur block. Currently:
```glsl
vec3 texB = (tex
  + texture(uEarth, uv + vec2(0.004,0.0)).rgb + texture(uEarth, uv - vec2(0.004,0.0)).rgb
  + texture(uEarth, uv + vec2(0.0,0.004)).rgb + texture(uEarth, uv - vec2(0.0,0.004)).rgb) * 0.2;
```
Generate it from `blur`:
```ts
  const texB = blur
    ? `vec3 texB = (tex
      + texture(uEarth, uv + vec2(0.004,0.0)).rgb + texture(uEarth, uv - vec2(0.004,0.0)).rgb
      + texture(uEarth, uv + vec2(0.0,0.004)).rgb + texture(uEarth, uv - vec2(0.0,0.004)).rgb) * 0.2;`
    : `vec3 texB = tex;`
```
and inject `${texB}` in place of that block.

- [ ] **Step 4: Run → pass**, `npx tsc -b` clean.

- [ ] **Step 5: Commit**
```bash
git add src/home/field-globe.glsl.ts src/home/field-globe.glsl.test.ts
git commit -m "feat(home): configurable cheaper shader baseline (octaves/blur opts)"
```

---

## Task 3: Adaptive-quality static-image rung

**Files:** Modify `app/src/home/adaptive-quality.ts`, `app/src/home/adaptive-quality.test.ts`

Goal: a device that keeps missing frames drops past the cheapest live level to a **static** rung (FieldGlobe then shows the still image, no loop).

- [ ] **Step 1: Write the failing test**

Append to `app/src/home/adaptive-quality.test.ts`:
```ts
import { isStaticLevel } from './adaptive-quality'

describe('static rung', () => {
  it('the last level is static', () => {
    expect(isStaticLevel(QUALITY_LEVELS.length - 1)).toBe(true)
    expect(isStaticLevel(0)).toBe(false)
  })
  it('steps down into the static rung under sustained slowness', () => {
    let level = QUALITY_LEVELS.length - 2
    level = nextLevel(level, 40)
    expect(isStaticLevel(level)).toBe(true)
  })
})
```

- [ ] **Step 2: Run → fail**.

- [ ] **Step 3: Implement**

In `app/src/home/adaptive-quality.ts`: add a `static?: boolean` field to `QualityConfig`, append a final static level, and export `isStaticLevel`:
```ts
export interface QualityConfig {
  arcSamples: number
  dprCap: number
  cadenceMs: number
  /** When true, the live shader is abandoned for the static image. */
  static?: boolean
}

export const QUALITY_LEVELS: readonly QualityConfig[] = [
  { arcSamples: MAX_ARC_SAMPLES, dprCap: 1.5, cadenceMs: 0 },
  { arcSamples: 14, dprCap: 1.5, cadenceMs: 0 },
  { arcSamples: 14, dprCap: 1.0, cadenceMs: 0 },
  { arcSamples: 10, dprCap: 1.0, cadenceMs: 1000 / 30 },
  { arcSamples: 0, dprCap: 1.0, cadenceMs: 0, static: true },
]

export function isStaticLevel(level: number): boolean {
  return !!qualityFor(level).static
}
```
(`nextLevel` is unchanged — it already steps toward the last index under sustained slowness.)

- [ ] **Step 4: Run → pass**, `npx tsc -b` clean.

- [ ] **Step 5: Commit**
```bash
git add src/home/adaptive-quality.ts src/home/adaptive-quality.test.ts
git commit -m "feat(home): adaptive static-image rung at the bottom of the ladder"
```

---

## Task 4: `useInViewActive` coordination hook

**Files:** Create `app/src/home/useInViewActive.ts`, `app/src/home/useInViewActive.test.ts`

Goal: one source of truth for "which region is active." Returns mutually-exclusive flags so the hero video and the globe never animate together (spec §5.2). The hero is active by default; once the globe region is more in view, the hero deactivates and the globe activates.

- [ ] **Step 1: Write the failing test**

`app/src/home/useInViewActive.test.ts`:
```ts
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useInViewActive } from './useInViewActive'

let cb: (entries: { isIntersecting: boolean }[]) => void
beforeEach(() => {
  cb = () => {}
  // @ts-expect-error minimal IO mock
  globalThis.IntersectionObserver = class {
    constructor(fn: typeof cb) { cb = fn }
    observe() {} disconnect() {} unobserve() {}
  }
})

describe('useInViewActive', () => {
  it('hero active by default; globe inactive', () => {
    const { result } = renderHook(() => useInViewActive())
    expect(result.current.heroActive).toBe(true)
    expect(result.current.globeActive).toBe(false)
  })
  it('switches to globe when the globe region intersects', () => {
    const { result } = renderHook(() => useInViewActive())
    act(() => { result.current.globeRef.current = document.createElement('div') })
    act(() => { cb([{ isIntersecting: true }]) })
    expect(result.current.globeActive).toBe(true)
    expect(result.current.heroActive).toBe(false)
  })
})
```

- [ ] **Step 2: Run → fail** (module missing).

- [ ] **Step 3: Implement**

`app/src/home/useInViewActive.ts`:
```ts
import { useEffect, useRef, useState } from 'react'

/**
 * Coordinates the "one animated background at a time" guarantee (spec §5.2).
 * Attach `globeRef` to the globe region. While the globe region is NOT in view
 * the hero is active (video plays, globe paused); once the globe region scrolls
 * in, the globe becomes active and the hero deactivates (video pauses).
 */
export function useInViewActive() {
  const globeRef = useRef<HTMLElement | null>(null)
  const [globeActive, setGlobeActive] = useState(false)

  useEffect(() => {
    const el = globeRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setGlobeActive(e.isIntersecting)
      },
      { threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  })

  return { globeRef, globeActive, heroActive: !globeActive }
}
```

- [ ] **Step 4: Run → pass**, `npx tsc -b` clean.

- [ ] **Step 5: Commit**
```bash
git add src/home/useInViewActive.ts src/home/useInViewActive.test.ts
git commit -m "feat(home): useInViewActive coordination (one animated background)"
```

---

## Task 5: FieldGlobe upgrades — active gate, lazy-mount, static image, cheaper opts, GPU cleanup

**Files:** Modify `app/src/home/FieldGlobe.tsx`, `app/src/home/FieldGlobe.test.tsx`

New props: `active` (external gate — defaults true; AND-ed with onscreen/visible), `staticSrc` (still image shown for reduced-motion / no-WebGL / static rung), `dprCap` (default 1.5; launchpad passes 1.0), `frag` opts (octaves/blur), `lazy` (default true — context created only once near the viewport).

- [ ] **Step 1: Write/extend the failing tests**

Append to `app/src/home/FieldGlobe.test.tsx`:
```tsx
it('renders the static image when staticSrc is set and WebGL is unavailable', () => {
  // jsdom getContext('webgl2') is null → static fallback should show.
  const { container } = render(<FieldGlobe staticSrc="/assets/globe-still.webp" />)
  const img = container.querySelector('img')
  expect(img).toBeTruthy()
  expect(img?.getAttribute('src')).toBe('/assets/globe-still.webp')
})

it('does not start a loop when active=false', () => {
  const raf = vi.spyOn(window, 'requestAnimationFrame')
  render(<FieldGlobe active={false} />)
  expect(raf).not.toHaveBeenCalled()
  raf.mockRestore()
})
```

- [ ] **Step 2: Run → fail**.

- [ ] **Step 3: Implement the upgrades**

Edit `app/src/home/FieldGlobe.tsx`:

(a) Imports + props + reduced-motion-aware static state:
```tsx
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { VERTEX_SRC, fragmentSource, FIELD_GLOBE_PARAMS, type FragOpts } from './field-globe.glsl'
import { useEarthTexture } from './useEarthTexture'
import { nextLevel, qualityFor, isStaticLevel } from './adaptive-quality'

export interface FieldGlobeProps {
  className?: string
  /** External coordination gate (AND-ed with onscreen/visible). Default true. */
  active?: boolean
  /** Still image for reduced-motion / no-WebGL / the static quality rung. */
  staticSrc?: string
  /** Device-pixel-ratio cap (launchpad passes 1.0). Default 1.5. */
  dprCap?: number
  /** Cheaper-shader options. */
  frag?: FragOpts
}
```
```tsx
export function FieldGlobe({ className, active = true, staticSrc, dprCap = 1.5, frag }: FieldGlobeProps) {
  const reduce = useReducedMotion() ?? false
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const earthImg = useEarthTexture()
  // Shows the still image instead of the canvas (reduced-motion / no-WebGL / static rung).
  const [showStatic, setShowStatic] = useState<boolean>(reduce)
  const activeRef = useRef(active)
  activeRef.current = active
```
(b) Build the fragment with opts + honor `dprCap`:
```tsx
    const FRAG = fragmentSource(FIELD_GLOBE_PARAMS, frag)
```
and change `const DPR_HARD_CAP = 1.5` → `const DPR_HARD_CAP = dprCap`.

(c) External `active` gate — change `let active = true` (the pagehide flag) to a different name to avoid shadowing the prop, and AND-in the prop. Rename the internal suspend flag to `pageActive`:
```tsx
    let onscreen = true
    let pageVisible = typeof document === 'undefined' || !document.hidden
    let pageActive = true // pagehide=false → suspended

    const apply = () => {
      if (reduce) return
      if (onscreen && pageVisible && pageActive && activeRef.current) startLoop()
      else stopLoop()
    }
```
and in `onPageHide`/`onPageShow` set `pageActive` (not `active`).

(d) Re-apply when the `active` prop changes — add a second effect (after the existing `[reduce]` effect) that calls a stored `apply`. Store `apply` on a ref inside the main effect (`applyRef.current = apply`) and:
```tsx
  const applyRef = useRef<(() => void) | null>(null)
  useEffect(() => { applyRef.current?.() }, [active])
```
(Set `applyRef.current = apply` right after `apply` is defined in the main effect, and null it in cleanup.)

(e) Lazy-mount + static rung wiring — in the quality re-eval, when the level becomes static, stop and show the image:
```tsx
        if (nl !== level) {
          level = nl
          if (isStaticLevel(level) && staticSrc) { stopLoop(); setShowStatic(true); return }
          dprCap2 = Math.min(DPR_HARD_CAP, qualityFor(level).dprCap)
          resize()
        }
```
(Rename the mutable cap var to `dprCap2` to avoid clashing with the prop; initialize `let dprCap2 = DPR_HARD_CAP`.) If `staticSrc` is absent, keep running at the lowest live level (don't blank the screen).

(f) GPU cleanup — keep handles to delete on unmount. Track `buf` and the shaders, and in cleanup:
```tsx
      const g = gl
      if (g) {
        try {
          if (tex) g.deleteTexture(tex)
          if (buf) g.deleteBuffer(buf)
          if (prog) g.deleteProgram(prog)
          for (const s of shaders) g.deleteShader(s)
        } catch { /* context may be gone */ }
      }
      const lose = gl?.getExtension('WEBGL_lose_context')
      lose?.loseContext()
```
(Declare `let buf: WebGLBuffer | null = null` and `const shaders: WebGLShader[] = []`; push each compiled shader in `compile`; assign `buf` in `initGL`.)

(g) Lazy-mount: wrap the WebGL boot so the context is created only once the root is near the viewport. Add a pre-observer at the top of the main effect that defers `initGL()`/boot until first intersection (rootMargin `200px`), then proceeds. (If `IntersectionObserver` is unavailable, boot immediately.) Keep it simple: a `booted` guard + an observer that runs the existing boot block on first intersect; the existing offscreen-pause observer still governs the loop afterward.

(h) Render — static image layer + canvas:
```tsx
  return (
    <div ref={rootRef} aria-hidden="true" data-testid="field-globe"
      className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {staticSrc && (
        <img
          src={staticSrc} alt="" aria-hidden="true" decoding="async"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', opacity: showStatic ? 1 : 0,
            transition: 'opacity 260ms ease', pointerEvents: 'none',
          }}
        />
      )}
      <canvas ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' }} />
    </div>
  )
```
When WebGL is unavailable (`if (!gl) return`) and `staticSrc` is set, also `setShowStatic(true)` before returning so the image shows.

> Implementer note: this is the most intricate task. Preserve every existing safeguard (offscreen/visibility/pagehide pause, adaptive ladder, context-loss restore, first-frame fade-in). The additions are: prop-`active` gate, lazy boot, static-image layer + rung, `dprCap`/`frag` plumbing, and GPU deletes in cleanup. Keep the canvas `pointerEvents: 'none'` (globe is purely decorative, spec §5).

- [ ] **Step 4: Run the tests** — `npx vitest run src/home/FieldGlobe.test.tsx` and `npx vitest run src/home` (all green). `npx tsc -b` clean.

- [ ] **Step 5: Commit**
```bash
git add src/home/FieldGlobe.tsx src/home/FieldGlobe.test.tsx
git commit -m "feat(home): FieldGlobe active-gate, lazy-mount, static fallback, GPU cleanup"
```

---

## Task 6: Pre-render the static globe image

**Files:** Create `app/src/assets/globe-still.webp`

The static fallback needs one representative globe frame. Capture it from the approved preview (the inline shader is identical to production).

- [ ] **Step 1: Capture the frame**

```bash
npm run dev   # if not already running; note the port
```
Open the globe preview (`/x-launchpad-globe`) in Chrome. In DevTools console, capture the globe canvas (the full-page background canvas) to a WebP and download it:
```js
const c = [...document.querySelectorAll('canvas')].find(n => n.width > 400)
c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'globe-still.webp'; a.click() }, 'image/webp', 0.85)
```
Move the downloaded file to `app/src/assets/globe-still.webp`. Verify it's a valid WebP and < 120KB (`file` / `ls -l`). If oversized, re-run with quality `0.8`.

- [ ] **Step 2: Confirm it imports**

A quick check that Vite resolves it (used in Task 7): `node -e "console.log(require('fs').statSync('src/assets/globe-still.webp').size)"`.

- [ ] **Step 3: Commit**
```bash
git add src/assets/globe-still.webp
git commit -m "chore(home): pre-rendered static globe image for the fallback"
```

---

## Task 7: The cinematic launchpad (compose hero + globe + Your travels)

**Files:**
- Modify: `app/src/components/HomeBackground.tsx` → repurpose into the globe layer + trips wrapper (or create `app/src/components/CinematicLaunchpad.tsx` and leave HomeBackground for deletion). **Create `CinematicLaunchpad.tsx`** (cleaner than overloading HomeBackground).
- Create: `app/src/components/CinematicLaunchpad.tsx`, `app/src/components/CinematicLaunchpad.test.tsx`
- Modify: `app/src/components/Launchpad.tsx` (State C now renders the cinematic launchpad) and its test.

- [ ] **Step 1: Write the failing test**

`app/src/components/CinematicLaunchpad.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CinematicLaunchpad } from './CinematicLaunchpad'
import type { Trip } from '../types'

vi.mock('../home/FieldGlobe', () => ({ FieldGlobe: (p: { active?: boolean }) => <div data-testid="field-globe" data-active={String(p.active)} /> }))
vi.mock('../data/useLandmarkImage', () => ({ useLandmarkImage: () => ({ url: null, loading: false }) }))

const past: Trip = {
  id: 'ams', owner_id: 'o', title: 'Amsterdam', subtitle: null,
  config: { title: 'Amsterdam', startDate: '2026-01-01', numDays: 3 },
  data: { days: [{ title: 'D', stops: [] }], completed: [], hotel: null },
}

describe('CinematicLaunchpad', () => {
  it('renders the hero headline, the globe, and Your travels', () => {
    render(<CinematicLaunchpad pastTrips={[past]} onCreate={vi.fn()} onOpenTrip={vi.fn()} />)
    expect(screen.getByText('Where to next?')).toBeInTheDocument()
    expect(screen.getByTestId('field-globe')).toBeInTheDocument()
    expect(screen.getByText(/your travels/i)).toBeInTheDocument()
    expect(screen.getByText('Amsterdam')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run → fail**.

- [ ] **Step 3: Implement CinematicLaunchpad**

`app/src/components/CinematicLaunchpad.tsx` — composes the approved preview layout (values from `_PreviewLaunchpad` globe variant) using the PRODUCTION `FieldGlobe` and the coordination hook. Globe is `active={globeActive}`, video `videoPlaying={heroActive}`.
```tsx
import { CinematicHero } from './CinematicHero'
import { FieldGlobe } from '../home/FieldGlobe'
import { useInViewActive } from '../home/useInViewActive'
import { TripGrid } from './TripGrid'
import { Button } from './ui/Button'
import { Plus } from 'lucide-react'
import globeStill from '../assets/globe-still.webp'
import type { Trip } from '../types'

const VIDEO_MASK = 'linear-gradient(to bottom, #000 70%, transparent 96%)'

/**
 * State C launchpad (spec §3). Cinematic hero (brightness 1.8) whose clip
 * dissolves into a tall night-Earth FieldGlobe; "Your travels" overlaid on glass
 * cards. The globe and video never animate together (useInViewActive).
 * Layer order (front→back): header → hero content → trip cards → masked video →
 * FieldGlobe → page black.
 */
export function CinematicLaunchpad({
  pastTrips, onCreate, onOpenTrip, tripActions,
}: {
  pastTrips: Trip[]
  onCreate: () => void
  onOpenTrip: (id: string) => void
  tripActions?: (t: Trip) => React.ReactNode
}) {
  const { globeRef, globeActive, heroActive } = useInViewActive()

  return (
    <div className="relative bg-[#07070b] text-white">
      {/* FieldGlobe — tall background; dark sky behind the clip, arcs low behind tiles. */}
      <div
        ref={globeRef as React.RefObject<HTMLDivElement>}
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[185vh] overflow-hidden"
      >
        <FieldGlobe
          className="absolute inset-x-0 top-[20vh] h-[170vh]"
          active={globeActive}
          staticSrc={globeStill}
          dprCap={1.0}
          frag={{ octaves: 3, blur: false }}
        />
      </div>

      {/* Cinematic hero — masked to dissolve into the globe; pauses when the globe is active. */}
      <CinematicHero
        className="relative z-10 h-[100svh] min-h-[620px] overflow-hidden"
        headline="Where to next?"
        subcopy="Name a city and we'll start the itinerary, day by day."
        brightness={1.8}
        videoMask={VIDEO_MASK}
        videoPlaying={heroActive}
        onSubmit={onCreate}
        headerRight={<Button variant="claret" onClick={onCreate}><Plus size={16} strokeWidth={2.5} />New trip</Button>}
      />

      {/* Your travels — pulled up over the globe (glass cards let the Earth show beneath). */}
      <section className="relative z-10 -mt-[18vh]">
        <div className="mx-auto max-w-6xl px-5 md:px-8 pt-[2vh] pb-[40vh]">
          <h2
            className="mb-5 text-left font-serif text-[clamp(22px,3.2vw,30px)] font-medium tracking-tight text-white"
            style={{ textShadow: '0 2px 24px rgba(0,0,0,.55)' }}
          >
            Your travels
          </h2>
          {pastTrips.length > 0 ? (
            <TripGrid trips={pastTrips} onOpen={onOpenTrip} tripActions={tripActions} />
          ) : (
            <p className="text-[14px] text-white/70">Your finished trips will live here as keepsakes.</p>
          )}
        </div>
      </section>
    </div>
  )
}
```
(`TripGrid` cards on the launchpad must read as glass over the globe — if the existing `TripGrid`/`TripTile` use an opaque surface, add an optional `glass` prop that swaps the card background to `bg-white/[0.06] backdrop-blur-xl border-white/15`. Thread `glass` from here. Keep the default opaque for the State-B gallery.)

- [ ] **Step 4: Run → pass**.

- [ ] **Step 5: Wire into Launchpad/Dashboard**

`app/src/components/Launchpad.tsx` State C (no upcoming trip) should now render `CinematicLaunchpad` for the brand-new / past-only cases instead of the gradient hero. Replace the `Launchpad` body with a delegation to `CinematicLaunchpad` (passing `pastTrips`, `onCreate`, `onOpenTrip`, `tripActions`). Keep `Launchpad`'s existing prop signature so `Dashboard.tsx` is unchanged. Update `Launchpad.test.tsx`: the headline assertion stays (`/where to next/i`); the create-affordance click now targets the pill or the New-trip button; "Your travels" replaces "Past voyages". Adjust the three existing assertions accordingly (mock `../home/FieldGlobe`).

- [ ] **Step 6: Verify + manual + commit**

Run: `npx vitest run src/components/CinematicLaunchpad.test.tsx src/components/Launchpad.test.tsx src/routes/Dashboard.test.tsx`.
`npx tsc -b` clean.
Manual: `npm run dev`, log in to a State-C account → confirm it matches the approved `/x-launchpad-globe` preview, and that scrolling to the globe pauses the video (the `data-active` flips).
```bash
git add src/components/CinematicLaunchpad.tsx src/components/CinematicLaunchpad.test.tsx src/components/Launchpad.tsx src/components/Launchpad.test.tsx src/components/TripGrid.tsx src/components/TripTile.tsx
git commit -m "feat(home): cinematic State C launchpad (hero → globe → Your travels)"
```

---

## Task 8: Field-globe on the Auth page

**Files:** Modify `app/src/routes/Auth.tsx`, `app/src/routes/Auth.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `app/src/routes/Auth.test.tsx`:
```tsx
vi.mock('../home/FieldGlobe', () => ({ FieldGlobe: () => <div data-testid="field-globe" /> }))
it('renders the field-globe background behind the form', () => {
  renderAuth() // existing helper that renders <Auth/> within router
  expect(screen.getByTestId('field-globe')).toBeInTheDocument()
})
```
(If `Auth.test.tsx` lacks a render helper, render `<MemoryRouter><Auth/></MemoryRouter>` directly.)

- [ ] **Step 2: Run → fail**.

- [ ] **Step 3: Implement**

In `app/src/routes/Auth.tsx`, wrap the existing form in a relative container and add the globe behind it with a legibility scrim. The globe is the only animated thing here, so allow `dprCap={1.5}`; keep `active` default true (no video to coordinate with). Add `import { FieldGlobe } from '../home/FieldGlobe'` and `import globeStill from '../assets/globe-still.webp'`:
```tsx
<div className="relative min-h-[100svh] overflow-hidden bg-[#07070b]">
  <FieldGlobe className="absolute inset-0" staticSrc={globeStill} dprCap={1.5} />
  {/* legibility scrim — Auth form text is the priority */}
  <div aria-hidden className="pointer-events-none absolute inset-0"
    style={{ background: 'radial-gradient(120% 80% at 50% 40%, rgba(5,5,9,0.45), rgba(5,5,9,0.78))' }} />
  <div className="relative z-10">
    {/* …existing Auth form… */}
  </div>
</div>
```
Don't touch the existing signup-default / `?mode=signin` logic.

- [ ] **Step 4: Run → pass**, `npx tsc -b` clean. Manual: `/auth` shows the globe behind a legible form.

- [ ] **Step 5: Commit**
```bash
git add src/routes/Auth.tsx src/routes/Auth.test.tsx
git commit -m "feat(auth): field-globe background behind the login/signup form"
```

---

## Task 9: Remove the preview + full verification

**Files:** Delete `app/src/routes/_PreviewLaunchpad.tsx`; modify `app/src/App.tsx`; remove the unused old `HomeBackground.tsx`/`StaticBackdrop` only if nothing references them.

- [ ] **Step 1: Remove the temp preview**

Delete `app/src/routes/_PreviewLaunchpad.tsx`. In `app/src/App.tsx`, remove the `PreviewLaunchpad` import and both `/x-launchpad-*` routes.

- [ ] **Step 2: Prune dead code**

`grep -rn "HomeBackground\|StaticBackdrop" src` — if the original gradient `HomeBackground` and `StaticBackdrop` are no longer imported anywhere (the cinematic launchpad replaced them), delete those files + their tests. If still referenced (e.g., a fallback), leave them. Run `npx tsc -b` to surface any dangling imports.

- [ ] **Step 3: Full suite + build**

Run: `npx tsc -b && npx vitest run` → clean + all green.
Run: `npm run build` → succeeds; confirm `earth-night.webp` and `globe-still.webp` are emitted to `dist/assets`.

- [ ] **Step 4: Manual perf + cross-browser (spec §9)**

`npm run preview`. On a throttled mid-range mobile profile and across **Chrome, Safari, Firefox**:
- At the hero, the globe loop is NOT running (DevTools: no rAF from FieldGlobe); video plays.
- Scrolled to the globe, the **video is paused** and the globe holds ~60fps or steps down; never both animating.
- Reduced-motion → the static globe image; no-WebGL → static image; Auth form legible over its globe.
- **Transition fidelity:** no flash / brightness jump / discontinuity during the hero→globe dissolve in all three browsers.
- Navigating away from the launchpad releases the WebGL context (GPU cleanup).

- [ ] **Step 5: Final review + finish branch**

Dispatch the holistic final review, then superpowers:finishing-a-development-branch (merge/PR). Deploy is manual (`cd app && npm run build` → `npx wrangler deploy` from repo root); smoke-test `/`, `/auth`, `/trips` return 200.
```bash
git add -A
git commit -m "chore(home): remove launchpad preview route + prune dead background code"
```

---

## Self-review (author)

- **Spec coverage:** CinematicHero + source-of-truth (§4/§7) ✓T1; cheaper baseline (§5.3) ✓T2; static rung (§5.4) ✓T3; one-animated-background coordination (§5.2) ✓T4/T7; FieldGlobe active/lazy/static/GPU-cleanup/decorative (§5,§10) ✓T5; static image asset (§5.4) ✓T6; launchpad layout + Your travels + glass + layer order (§3) ✓T7; globe on Auth (§6) ✓T8; remove preview + cross-browser transition test (§7,§9) ✓T9.
- **Type consistency:** `FragOpts` (T2) consumed by `fragmentSource` (T2) and `FieldGlobe.frag` (T5/T7); `isStaticLevel`/`QualityConfig.static` (T3) used in `FieldGlobe` (T5); `useInViewActive` (T4) → `CinematicLaunchpad` (T7); `CinematicHero` (T1) → Landing (T1) + CinematicLaunchpad (T7); `HeroVideoStage.playing` (T1) ← CinematicHero `videoPlaying`.
- **Risk note:** Task 5 is the heaviest (preserve all existing FieldGlobe safeguards while adding five concerns) and Task 6 is a manual capture — both flagged inline.
