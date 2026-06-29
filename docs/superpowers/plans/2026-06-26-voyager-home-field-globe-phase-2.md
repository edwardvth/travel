# Voyager Home — Phase 2: Field-Globe Background — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved night-Earth WebGL2 background to the State C launchpad as a progressive enhancement behind a `<HomeBackground>` boundary, never blocking the hero and always falling back to the Phase 1 static gradient.

**Architecture:** `Launchpad` hero renders `<HomeBackground>`, which always paints `<StaticBackdrop>` (the extracted Phase 1 gradient) immediately and layers a `<FieldGlobe>` WebGL2 canvas above it (transparent until its first frame, then fades in). `FieldGlobe` owns the entire WebGL lifecycle (context, shader, GPU texture, draw loop, pause/resume, context-loss recovery, adaptive quality), mirroring the proven canvas lifecycle of `app/src/hero/HeroModeExplorer.tsx`.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind, framer-motion (`useReducedMotion`), vitest + @testing-library/react + jsdom. Raw WebGL2 (no library). Build-time asset: `sharp` (devDep, one-off script) → `earth-night.webp`.

**Spec:** `docs/superpowers/specs/2026-06-26-voyager-home-field-globe-phase-2-design.md`

**Setup:** Create/verify a Phase 2 worktree off `main` (superpowers:using-git-worktrees) before Task 1. Run all commands from `app/`. Keep `npx tsc -b` clean and `npm test` green at every commit.

---

## File structure

**New**
- `app/src/components/StaticBackdrop.tsx` — Phase 1 gradient + map-grid as an absolute layer (single source of truth for the fallback).
- `app/src/components/StaticBackdrop.test.tsx`
- `app/src/components/HomeBackground.tsx` — the boundary (static-only in Task 2; gated `FieldGlobe` + scrim added in Task 7).
- `app/src/components/HomeBackground.test.tsx`
- `app/src/home/webgl-support.ts` — memoized WebGL2 feature detection.
- `app/src/home/webgl-support.test.ts`
- `app/src/home/field-globe.glsl.ts` — `VERTEX_SRC`, `fragmentSource(params)`, immutable `FIELD_GLOBE_PARAMS`.
- `app/src/home/field-globe.glsl.test.ts`
- `app/src/home/adaptive-quality.ts` — pure quality-ladder controller.
- `app/src/home/adaptive-quality.test.ts`
- `app/src/home/useEarthTexture.ts` — fetch/decode the WebP only (owns no GL object).
- `app/src/home/useEarthTexture.test.ts`
- `app/src/home/FieldGlobe.tsx` — the WebGL2 component.
- `app/src/home/FieldGlobe.test.tsx`
- `app/scripts/gen-earth-texture.mjs` — one-off asset generator (download + downscale + WebP).
- `app/src/assets/earth-night.webp` — shipped texture (committed build artifact).

**Modified**
- `app/src/components/Launchpad.tsx` — swap the inline backdrop for `<HomeBackground />`.

---

## Task 1: Extract StaticBackdrop from Launchpad

**Files:**
- Create: `app/src/components/StaticBackdrop.tsx`
- Create: `app/src/components/StaticBackdrop.test.tsx`
- Modify: `app/src/components/Launchpad.tsx`

- [ ] **Step 1: Write the failing test**

`app/src/components/StaticBackdrop.test.tsx`:
```tsx
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StaticBackdrop } from './StaticBackdrop'

describe('StaticBackdrop', () => {
  it('renders a decorative absolute backdrop layer', () => {
    const { container } = render(<StaticBackdrop />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toBeTruthy()
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(root.className).toContain('absolute')
    expect(root.getAttribute('style')).toMatch(/radial-gradient/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/StaticBackdrop.test.tsx`
Expected: FAIL — cannot find module `./StaticBackdrop`.

- [ ] **Step 3: Implement StaticBackdrop**

`app/src/components/StaticBackdrop.tsx`:
```tsx
import { cn } from '../lib/utils'

/**
 * StaticBackdrop — the launchpad's calm fallback backdrop (Phase 1): a deep
 * claret→ink radial gradient with a faint, masked map-grid texture. Rendered as
 * an absolutely-positioned layer so it can sit behind hero content and beneath
 * the Phase 2 FieldGlobe shader. This is the single source of truth for the
 * fallback shown on every no-WebGL / reduced-motion / pre-first-frame path.
 */
export function StaticBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('absolute inset-0', className)}
      style={{
        background:
          'radial-gradient(120% 85% at 50% -5%, rgba(58,34,48,0.55) 0%, rgba(21,13,18,0.55) 48%, #07070b 100%)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
          maskImage: 'radial-gradient(70% 60% at 50% 30%, #000, transparent 75%)',
        }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/StaticBackdrop.test.tsx`
Expected: PASS.

- [ ] **Step 5: Rewire Launchpad to use StaticBackdrop**

In `app/src/components/Launchpad.tsx`, add `import { StaticBackdrop } from './StaticBackdrop'`. Replace the hero wrapper block — currently:
```tsx
      <div
        className="relative overflow-hidden rounded-card border border-hair px-6 py-16 text-center md:py-24"
        style={{
          background:
            'radial-gradient(120% 85% at 50% -5%, rgba(58,34,48,0.55) 0%, rgba(21,13,18,0.55) 48%, #07070b 100%)',
        }}
      >
        {/* faint map-grid texture — the launchpad's calm "world field" stand-in */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)',
            backgroundSize: '34px 34px',
            maskImage: 'radial-gradient(70% 60% at 50% 30%, #000, transparent 75%)',
          }}
        />
        <div className="relative">
```
becomes:
```tsx
      <div className="relative overflow-hidden rounded-card border border-hair px-6 py-16 text-center md:py-24">
        <StaticBackdrop />
        <div className="relative">
```
Leave the inner content (`<div className="relative">…</div>`) and everything below unchanged.

- [ ] **Step 6: Run tests to verify nothing regressed**

Run: `npx vitest run src/components/Launchpad.test.tsx src/components/StaticBackdrop.test.tsx`
Expected: PASS (Launchpad's existing 3 tests still green — they assert text/buttons only).

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc -b
git add src/components/StaticBackdrop.tsx src/components/StaticBackdrop.test.tsx src/components/Launchpad.tsx
git commit -m "refactor(home): extract StaticBackdrop from Launchpad hero"
```

---

## Task 2: HomeBackground boundary (static-only) + WebGL2 detection

**Files:**
- Create: `app/src/home/webgl-support.ts`, `app/src/home/webgl-support.test.ts`
- Create: `app/src/components/HomeBackground.tsx`, `app/src/components/HomeBackground.test.tsx`
- Modify: `app/src/components/Launchpad.tsx`

- [ ] **Step 1: Write the failing test for webgl-support**

`app/src/home/webgl-support.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { supportsWebGL2 } from './webgl-support'

afterEach(() => vi.restoreAllMocks())

describe('supportsWebGL2', () => {
  it('returns false when getContext yields no webgl2 (jsdom default)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never)
    expect(supportsWebGL2()).toBe(false)
  })

  it('returns true when a webgl2 context is available', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((id: string) => (id === 'webgl2' ? ({} as WebGL2RenderingContext) : null)) as never,
    )
    expect(supportsWebGL2()).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/home/webgl-support.test.ts`
Expected: FAIL — cannot find module `./webgl-support`.

- [ ] **Step 3: Implement webgl-support**

`app/src/home/webgl-support.ts`:
```ts
/**
 * Memoized WebGL2 feature detection. Creates a throwaway canvas once and caches
 * the result. Safe in SSR/jsdom (returns false when document/canvas/context are
 * unavailable). The cache is keyed to the module, so repeated renders don't
 * allocate canvases.
 */
let cached: boolean | undefined

export function supportsWebGL2(): boolean {
  if (cached !== undefined) return cached
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    cached = false
    return cached
  }
  try {
    const canvas = document.createElement('canvas')
    cached = !!canvas.getContext?.('webgl2')
  } catch {
    cached = false
  }
  return cached
}

/** Test-only: reset the memoized result. */
export function __resetWebGL2Cache() {
  cached = undefined
}
```
Update the test to reset the cache between the two cases — add `import { __resetWebGL2Cache } from './webgl-support'` and call `__resetWebGL2Cache()` at the top of each `it`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/home/webgl-support.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for HomeBackground**

`app/src/components/HomeBackground.test.tsx`:
```tsx
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HomeBackground } from './HomeBackground'

describe('HomeBackground', () => {
  it('always renders the StaticBackdrop as an immediate paint', () => {
    const { container } = render(<HomeBackground />)
    // The static gradient layer is present from first render.
    expect(container.innerHTML).toMatch(/radial-gradient/)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('aria-hidden', 'true')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/HomeBackground.test.tsx`
Expected: FAIL — cannot find module `./HomeBackground`.

- [ ] **Step 7: Implement HomeBackground (static-only for now)**

`app/src/components/HomeBackground.tsx`:
```tsx
import { StaticBackdrop } from './StaticBackdrop'

/**
 * HomeBackground — the launchpad background boundary. ALWAYS renders
 * StaticBackdrop as the first, immediate paint (the hero never waits on it).
 * The Phase 2 FieldGlobe shader is layered above this in Task 7 as a progressive
 * enhancement; the static layer remains underneath permanently as the fallback.
 */
export function HomeBackground() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <StaticBackdrop />
    </div>
  )
}
```

- [ ] **Step 8: Wire Launchpad to HomeBackground**

In `app/src/components/Launchpad.tsx`, replace `import { StaticBackdrop } from './StaticBackdrop'` with `import { HomeBackground } from './HomeBackground'`, and replace `<StaticBackdrop />` (added in Task 1) with `<HomeBackground />`.

- [ ] **Step 9: Run tests + typecheck + commit**

Run: `npx vitest run src/components/HomeBackground.test.tsx src/components/Launchpad.test.tsx src/home/webgl-support.test.ts`
Expected: PASS.
```bash
npx tsc -b
git add src/home/webgl-support.ts src/home/webgl-support.test.ts src/components/HomeBackground.tsx src/components/HomeBackground.test.tsx src/components/Launchpad.tsx
git commit -m "feat(home): HomeBackground boundary + WebGL2 detection (static-only)"
```

---

## Task 3: Shader module — VERTEX_SRC, fragmentSource, immutable params

**Files:**
- Create: `app/src/home/field-globe.glsl.ts`, `app/src/home/field-globe.glsl.test.ts`

- [ ] **Step 1: Write the failing test**

`app/src/home/field-globe.glsl.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { VERTEX_SRC, fragmentSource, FIELD_GLOBE_PARAMS } from './field-globe.glsl'

describe('field-globe shader source', () => {
  it('declares GLSL ES 3.00 and the per-frame uniforms', () => {
    expect(VERTEX_SRC).toMatch(/#version 300 es/)
    const frag = fragmentSource()
    expect(frag).toMatch(/#version 300 es/)
    for (const u of ['uResolution', 'uTime', 'uReduce', 'uArcSamples', 'uEarth']) {
      expect(frag).toMatch(new RegExp(`uniform[^;]*\\b${u}\\b`))
    }
  })

  it('bakes params as float literals (no bare integers that break GLSL)', () => {
    const frag = fragmentSource()
    // uArcCount is 2 → must be emitted as 2.0
    expect(frag).toMatch(/uArcCount=2\.0/)
    expect(frag).toMatch(/uHorizon=-0\.06/)
  })

  it('FIELD_GLOBE_PARAMS is frozen (signed-off values cannot be mutated)', () => {
    expect(Object.isFrozen(FIELD_GLOBE_PARAMS)).toBe(true)
    expect(() => {
      // @ts-expect-error runtime immutability check
      FIELD_GLOBE_PARAMS.uGlow = 99
    }).toThrow()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/home/field-globe.glsl.test.ts`
Expected: FAIL — cannot find module `./field-globe.glsl`.

- [ ] **Step 3: Implement the shader module**

`app/src/home/field-globe.glsl.ts`:
```ts
/**
 * Field-Globe shader source (Phase 2). Reproduces the approved visual output of
 * the prototype (scratchpad/field-earth.html): the night-Earth limb seen from
 * low orbit — warm orange limb → blue airglow, gold city lights on the dark
 * earth (photo + synthesized), faint stars, slow travel arcs echoing the curve.
 *
 * The look-defining parameters are baked into the fragment source as `const`
 * declarations from FIELD_GLOBE_PARAMS (frozen, so the signed-off values can't
 * be mutated at runtime). Only truly dynamic values are real uniforms:
 *   uResolution, uTime, uReduce (freeze for reduced motion), uArcSamples
 *   (adaptive quality — caps the per-pixel bezier loop), uEarth (night texture).
 */

export const FIELD_GLOBE_PARAMS = Object.freeze({
  uHorizon: -0.06,
  uCurve: 0.5,
  uGlow: 0.6,
  uWarmth: 0.4,
  uCities: 1.1,
  uEarthZoom: 0.43,
  uEarthPanY: 0.12,
  uDrift: 0.02,
  uArcOpacity: 0.12,
  uArcCount: 2,
  uArcSpeed: 0.04,
  uArcHeight: 0.16,
  uVignette: 0.7,
  limb: Object.freeze([1.0, 0.64, 0.3] as const),
  air: Object.freeze([0.3, 0.55, 0.96] as const),
})

export type FieldGlobeParams = typeof FIELD_GLOBE_PARAMS

/** Max bezier samples per arc; the loop runs `min(this, uArcSamples)`. */
export const MAX_ARC_SAMPLES = 26

export const VERTEX_SRC = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`

/** Emit a GLSL float literal (always contains a decimal point). */
const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n))
const v3 = (c: readonly number[]): string => `vec3(${c.map(f).join(',')})`

export function fragmentSource(p: FieldGlobeParams = FIELD_GLOBE_PARAMS): string {
  return `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uReduce;
uniform float uArcSamples;
uniform sampler2D uEarth;

const float uHorizon=${f(p.uHorizon)}, uCurve=${f(p.uCurve)}, uGlow=${f(p.uGlow)}, uWarmth=${f(p.uWarmth)}, uCities=${f(p.uCities)},
            uEarthZoom=${f(p.uEarthZoom)}, uEarthPanY=${f(p.uEarthPanY)}, uDrift=${f(p.uDrift)}, uArcOpacity=${f(p.uArcOpacity)},
            uArcCount=${f(p.uArcCount)}, uArcSpeed=${f(p.uArcSpeed)}, uArcHeight=${f(p.uArcHeight)}, uVignette=${f(p.uVignette)};
const vec3 uLimb=${v3(p.limb)}, uAir=${v3(p.air)};

vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec2 mod289(vec2 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
  m=m*m; m=m*m;
  vec3 x=2.*fract(p*C.www)-1.; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float fbm(vec2 p){ float v=0.,a=0.5; for(int i=0;i<5;i++){ v+=a*snoise(p); p*=2.02; a*=0.5; } return v; }
float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
float earthRad(){ return mix(1.9, 0.7, clamp(uCurve/1.2, 0.0, 1.0)); }
float earthCy(){ return uHorizon - earthRad(); }
float horizonY(float x){ float R=earthRad(); float Cy=earthCy(); return Cy + sqrt(max(R*R - x*x, 0.0)); }

void main(){
  vec2 res = uResolution;
  vec2 p = (gl_FragCoord.xy - 0.5*res)/res.y;
  float t = (uReduce > 0.5) ? 12.0 : uTime;

  float irad = earthRad();
  float icy  = earthCy();
  float rr   = length(vec2(p.x, p.y - icy));
  float dist = rr - irad;

  vec3 sky = mix(vec3(0.012,0.020,0.044), vec3(0.003,0.007,0.018), smoothstep(0.9,0.0,dist));
  vec3 col = sky;

  if (dist < 0.0) {
    vec2 uv = vec2(0.5 + (p.x / irad) * uEarthZoom + uDrift * t * 0.012,
                   0.5 - ((p.y - icy) / irad) * uEarthZoom + uEarthPanY);
    vec3 tex = texture(uEarth, uv).rgb;
    vec3 texB = (tex
      + texture(uEarth, uv + vec2(0.004,0.0)).rgb + texture(uEarth, uv - vec2(0.004,0.0)).rgb
      + texture(uEarth, uv + vec2(0.0,0.004)).rgb + texture(uEarth, uv - vec2(0.0,0.004)).rgb) * 0.2;
    float lum = max(max(tex.r, tex.g), tex.b);

    float landish  = (texB.r + texB.g) * 0.5 - texB.b * 0.55 + lum * 0.30;
    float landMask = smoothstep(0.02, 0.11, landish);
    col = mix(vec3(0.005,0.012,0.030), vec3(0.032,0.031,0.033), clamp(landMask, 0.0, 1.0));
    col += vec3(0.90,0.62,0.34) * landMask * 0.012;

    float cityAmt = smoothstep(0.17, 0.52, lum);

    float eu = smoothstep(0.15, 0.0, length((uv - vec2(0.71, 0.255)) * vec2(1.0, 1.5)));
    float af = smoothstep(0.17, 0.0, length((uv - vec2(0.64, 0.345)) * vec2(1.1, 1.0)));
    float eastLand = clamp(eu + af, 0.0, 1.0);
    col = mix(col, vec3(0.030, 0.029, 0.031), eastLand * 0.8);
    col += vec3(0.90, 0.62, 0.34) * eastLand * 0.012;
    float eastPop = eastLand * (0.45 + 0.55 * fbm(uv * 10.0 + 30.0));
    cityAmt = max(cityAmt, smoothstep(0.32, 0.85, eastPop));

    if (cityAmt > 0.002) {
      vec2 sp = gl_FragCoord.xy / uResolution.y;
      float pts = 0.0;
      vec2 g0 = sp * 300.0; vec2 i0 = floor(g0); vec2 f0 = fract(g0) - 0.5;
      float h0 = hash21(i0);
      vec2 j0 = (vec2(hash21(i0+3.7), hash21(i0+7.1)) - 0.5) * 0.8;
      pts += smoothstep(0.40, 0.0, length(f0 - j0)) * step(0.42, h0) * (0.65 + 0.35*sin(t*1.6 + h0*40.0)) * 0.7;
      vec2 g1 = sp * 168.0; vec2 i1 = floor(g1); vec2 f1 = fract(g1) - 0.5;
      float h1 = hash21(i1 + 19.3);
      vec2 j1 = (vec2(hash21(i1+5.1), hash21(i1+8.9)) - 0.5) * 0.8;
      pts += smoothstep(0.34, 0.0, length(f1 - j1)) * step(0.52, h1) * (0.6 + 0.4*sin(t*1.3 + h1*55.0));
      col += vec3(1.00, 0.84, 0.52) * pts * cityAmt * uCities;
      col += vec3(1.00, 0.66, 0.34) * cityAmt * cityAmt * uCities * 0.08;
    }
  }

  float td = t * uDrift;
  float n  = fbm(vec2(p.x*2.2, dist*2.6) + vec2(td, td*0.4))*0.5 + 0.5;
  float core  = exp(-abs(dist) * 22.0);
  float bloom = exp(-abs(dist) * 9.0);
  float halo  = exp(-max(dist, 0.0) * 4.5);
  float under = exp(-max(-dist, 0.0) * 8.0);
  vec3 atmo = uLimb*core*0.50 + uLimb*bloom*(0.08 + uWarmth*0.12)
            + uAir*halo*0.18*(0.72 + 0.4*n) + uLimb*under*0.10;
  col += atmo * uGlow;

  if (dist > 0.05) {
    vec2 sg = vec2(p.x, p.y) * 46.0; vec2 sid = floor(sg);
    float shh = hash21(sid + 19.7);
    if (shh > 0.987) {
      vec2 sf = fract(sg) - 0.5;
      float stw = 0.5 + 0.5*sin(t*0.7 + shh*55.0);
      col += vec3(0.55,0.62,0.85) * smoothstep(0.08,0.0,length(sf)) * 0.10 * stw * smoothstep(0.05,0.30,dist);
    }
  }

  float glow = 0.0;
  for(int i=0;i<3;i++){
    if(float(i) >= uArcCount) break;
    float fi = float(i);
    float life = fract(t*uArcSpeed + fi*0.40);
    float env  = smoothstep(0.0,0.14,life) * smoothstep(1.0,0.74,life);
    float ax = -0.62 + 0.26*fi + 0.12*sin(t*0.05 + fi*1.3);
    float bx =  0.60 - 0.22*fi + 0.12*cos(t*0.04 + fi*1.7);
    vec2 A = vec2(ax, horizonY(ax)+0.004);
    vec2 B = vec2(bx, horizonY(bx)+0.004);
    vec2 mid = vec2((ax+bx)*0.5, max(A.y,B.y) + uArcHeight + 0.04*fi);
    float d = 1e3;
    for(int k=0;k<=${MAX_ARC_SAMPLES};k++){
      if(float(k) > uArcSamples) break;
      float tt=float(k)/${f(MAX_ARC_SAMPLES)};
      vec2 bp=mix(mix(A,mid,tt),mix(mid,B,tt),tt);
      d=min(d,length(p-bp));
    }
    glow += env * exp(-d*d*2600.0);
  }
  col += vec3(1.00, 0.92, 0.78) * glow * uArcOpacity * 1.6;

  float r = length(p);
  col *= mix(1.0, smoothstep(1.3, 0.2, r), uVignette);
  fragColor = vec4(col, 1.0);
}`
}
```

Note: the inner bezier sample uses `float(k)/${f(MAX_ARC_SAMPLES)}` so the curve parameterization stays fixed at the full 26-sample spacing even when `uArcSamples` truncates the loop early (lower quality just stops partway, never rescales the arc).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/home/field-globe.glsl.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -b
git add src/home/field-globe.glsl.ts src/home/field-globe.glsl.test.ts
git commit -m "feat(home): field-globe shader source + immutable baked params"
```

---

## Task 4: Earth texture asset + useEarthTexture hook

**Files:**
- Create: `app/scripts/gen-earth-texture.mjs`
- Create: `app/src/assets/earth-night.webp` (generated)
- Create: `app/src/home/useEarthTexture.ts`, `app/src/home/useEarthTexture.test.ts`

- [ ] **Step 1: Write the asset generator script**

`app/scripts/gen-earth-texture.mjs`:
```js
// One-off: download a public-domain night-lights world map and encode a small
// WebP for the field-globe shader. Run once; the .webp is committed so normal
// builds need no network or sharp. Usage: `node scripts/gen-earth-texture.mjs`
// (requires a one-off `npm i -D sharp`, which may be removed afterward).
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

const SRC = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_lights_2048.png'
const OUT = new URL('../src/assets/earth-night.webp', import.meta.url)

const res = await fetch(SRC)
if (!res.ok) throw new Error(`download failed: ${res.status}`)
const png = Buffer.from(await res.arrayBuffer())
const tmp = join(tmpdir(), 'earth_lights_2048.png')
await writeFile(tmp, png)

await mkdir(new URL('../src/assets/', import.meta.url), { recursive: true })
await sharp(tmp).resize(1024, 512).webp({ quality: 78 }).toFile(OUT.pathname.replace(/^\//, ''))
console.log('wrote', OUT.pathname)
```

- [ ] **Step 2: Generate the asset and verify size**

```bash
npm i -D sharp
node scripts/gen-earth-texture.mjs
```
Verify `src/assets/earth-night.webp` exists and is **60–120KB** (`ls -l src/assets/earth-night.webp`). If acceptable, optionally `npm uninstall sharp` (the committed webp is all that ships). If the size is outside range, adjust `quality` (lower for smaller) and re-run.

- [ ] **Step 3: Write the failing test for useEarthTexture**

`app/src/home/useEarthTexture.test.ts`:
```ts
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useEarthTexture } from './useEarthTexture'

afterEach(() => vi.restoreAllMocks())

describe('useEarthTexture', () => {
  it('returns null and does not throw when Image is unavailable', () => {
    const orig = globalThis.Image
    // @ts-expect-error simulate SSR/jsdom-without-Image
    delete globalThis.Image
    const { result } = renderHook(() => useEarthTexture())
    expect(result.current).toBeNull()
    globalThis.Image = orig
  })

  it('returns the decoded image once it loads', () => {
    vi.useFakeTimers()
    const instances: any[] = []
    class FakeImage {
      onload: (() => void) | null = null
      decoding = ''
      _src = ''
      constructor() { instances.push(this) }
      set src(v: string) { this._src = v }
      get src() { return this._src }
    }
    // @ts-expect-error swap Image
    globalThis.Image = FakeImage
    // Force the setTimeout path (no requestIdleCallback).
    const ric = (globalThis as any).requestIdleCallback
    ;(globalThis as any).requestIdleCallback = undefined

    const { result } = renderHook(() => useEarthTexture())
    expect(result.current).toBeNull()
    act(() => { vi.runAllTimers() })           // fire the deferred load()
    act(() => { instances[0].onload?.() })     // simulate image decode complete
    expect(result.current).toBe(instances[0])

    ;(globalThis as any).requestIdleCallback = ric
    vi.useRealTimers()
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/home/useEarthTexture.test.ts`
Expected: FAIL — cannot find module `./useEarthTexture`.

- [ ] **Step 5: Implement useEarthTexture**

`app/src/home/useEarthTexture.ts`:
```ts
import { useEffect, useState } from 'react'
import earthNightUrl from '../assets/earth-night.webp'

/**
 * Lazily fetch + decode the night-Earth WebP AFTER first paint and hand back the
 * decoded HTMLImageElement. This utility owns NO WebGL object — FieldGlobe owns
 * the GL texture (create/upload/restore). Returns null until the image is ready,
 * and no-ops cleanly when `Image` is unavailable (SSR/jsdom). The shader renders
 * fine without it (synthesized lights), so this is a pure enhancement.
 */
export function useEarthTexture(): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (typeof Image === 'undefined') return
    let cancelled = false

    const load = () => {
      const im = new Image()
      im.decoding = 'async'
      im.onload = () => { if (!cancelled) setImg(im) }
      im.src = earthNightUrl
    }

    const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback
    let idleId: number | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    if (typeof ric === 'function') idleId = ric(load)
    else timer = setTimeout(load, 200)

    return () => {
      cancelled = true
      const cic = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
      if (idleId !== undefined && typeof cic === 'function') cic(idleId)
      if (timer) clearTimeout(timer)
    }
  }, [])

  return img
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/home/useEarthTexture.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc -b
git add scripts/gen-earth-texture.mjs src/assets/earth-night.webp src/home/useEarthTexture.ts src/home/useEarthTexture.test.ts package.json package-lock.json
git commit -m "feat(home): night-Earth webp asset + lazy useEarthTexture loader"
```
(If `sharp` was uninstalled, `package.json`/lock revert to no-sharp — still commit them.)

---

## Task 5: Adaptive-quality controller (pure)

**Files:**
- Create: `app/src/home/adaptive-quality.ts`, `app/src/home/adaptive-quality.test.ts`

- [ ] **Step 1: Write the failing test**

`app/src/home/adaptive-quality.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { QUALITY_LEVELS, nextLevel, qualityFor } from './adaptive-quality'

describe('adaptive quality ladder', () => {
  it('steps down a level when sustained frame time is high', () => {
    expect(nextLevel(0, 30)).toBe(1)
  })
  it('steps up a level when frame time is comfortably low', () => {
    expect(nextLevel(2, 10)).toBe(1)
  })
  it('holds when frame time is in the neutral band', () => {
    expect(nextLevel(1, 18)).toBe(1)
  })
  it('clamps at both ends', () => {
    expect(nextLevel(0, 10)).toBe(0)
    const last = QUALITY_LEVELS.length - 1
    expect(nextLevel(last, 40)).toBe(last)
  })
  it('exposes a quality config per level with monotonically cheaper settings', () => {
    const a = qualityFor(0)
    const b = qualityFor(QUALITY_LEVELS.length - 1)
    expect(a.arcSamples).toBeGreaterThanOrEqual(b.arcSamples)
    expect(a.dprCap).toBeGreaterThanOrEqual(b.dprCap)
    expect(b.cadenceMs).toBeGreaterThanOrEqual(a.cadenceMs)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/home/adaptive-quality.test.ts`
Expected: FAIL — cannot find module `./adaptive-quality`.

- [ ] **Step 3: Implement the controller**

`app/src/home/adaptive-quality.ts`:
```ts
import { MAX_ARC_SAMPLES } from './field-globe.glsl'

/**
 * Adaptive quality ladder. FieldGlobe samples a rolling average of frame time
 * and, when the device can't hold ~60fps, steps DOWN to a cheaper level that
 * preserves the composition (limb/earth/lights/palette) — it trims cost, never
 * changes the look. Reductions, least-visible first: fewer arc bezier samples →
 * lower DPR cap → reduced animation cadence. Recovers (steps up) when fast again.
 */
export interface QualityConfig {
  /** Cap for the shader's per-pixel arc bezier loop (uArcSamples). */
  arcSamples: number
  /** Device-pixel-ratio cap for the render target. */
  dprCap: number
  /** Minimum ms between rendered frames (0 = uncapped / every rAF). */
  cadenceMs: number
}

export const QUALITY_LEVELS: readonly QualityConfig[] = [
  { arcSamples: MAX_ARC_SAMPLES, dprCap: 1.5, cadenceMs: 0 },
  { arcSamples: 14, dprCap: 1.5, cadenceMs: 0 },
  { arcSamples: 14, dprCap: 1.0, cadenceMs: 0 },
  { arcSamples: 10, dprCap: 1.0, cadenceMs: 1000 / 30 },
]

/** Sustained avg frame time (ms) above which we step down. */
export const DEGRADE_MS = 22
/** Sustained avg frame time (ms) below which we step back up. */
export const RECOVER_MS = 14

export function qualityFor(level: number): QualityConfig {
  const i = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, level))
  return QUALITY_LEVELS[i]
}

export function nextLevel(level: number, avgFrameMs: number): number {
  if (avgFrameMs > DEGRADE_MS && level < QUALITY_LEVELS.length - 1) return level + 1
  if (avgFrameMs < RECOVER_MS && level > 0) return level - 1
  return level
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/home/adaptive-quality.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -b
git add src/home/adaptive-quality.ts src/home/adaptive-quality.test.ts
git commit -m "feat(home): adaptive-quality ladder controller"
```

---

## Task 6: FieldGlobe WebGL2 component

**Files:**
- Create: `app/src/home/FieldGlobe.tsx`, `app/src/home/FieldGlobe.test.tsx`

This component mirrors the lifecycle skeleton of `app/src/hero/HeroModeExplorer.tsx` (read it first): DPR cap, resize, IntersectionObserver offscreen-pause, visibilitychange pause, reduced-motion branch, jsdom/SSR feature-detection, StrictMode-safe single loop. It adds: WebGL2 rendering, first-frame fade-in, `pagehide`/`pageshow`, GPU texture ownership, context-loss recovery, and adaptive quality.

- [ ] **Step 1: Write the failing tests**

`app/src/home/FieldGlobe.test.tsx`:
```tsx
import { render } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { FieldGlobe } from './FieldGlobe'

vi.mock('./useEarthTexture', () => ({ useEarthTexture: () => null }))

afterEach(() => vi.restoreAllMocks())

describe('FieldGlobe', () => {
  it('renders an aria-hidden canvas that starts transparent (opacity 0)', () => {
    // jsdom getContext('webgl2') returns null → component must bail gracefully.
    const { container } = render(<FieldGlobe />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas).toBeTruthy()
    expect(canvas.style.opacity).toBe('0')
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not start an animation loop when WebGL2 is unavailable', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    render(<FieldGlobe />)
    // No GL context → no render loop scheduled.
    expect(raf).not.toHaveBeenCalled()
    raf.mockRestore()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/home/FieldGlobe.test.tsx`
Expected: FAIL — cannot find module `./FieldGlobe`.

- [ ] **Step 3: Implement FieldGlobe**

`app/src/home/FieldGlobe.tsx`:
```tsx
import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { VERTEX_SRC, fragmentSource, FIELD_GLOBE_PARAMS } from './field-globe.glsl'
import { useEarthTexture } from './useEarthTexture'
import { nextLevel, qualityFor } from './adaptive-quality'

/**
 * FieldGlobe — the Phase 2 night-Earth WebGL2 background. Owns the entire WebGL
 * lifecycle and all GPU resources: context, program, the night-Earth texture
 * (create/upload/restore), and the draw loop. Mounts transparent and fades in on
 * its first successful frame (no compile flash). Pauses when offscreen
 * (IntersectionObserver), tab-hidden (visibilitychange), or page-suspended
 * (pagehide/pageshow). Recovers from context loss. Reduced motion → one still
 * frame, no loop. No WebGL2 / SSR / jsdom → bails silently (StaticBackdrop shows
 * through). Adapts quality down under sustained slow frames rather than juddering.
 */
export interface FieldGlobeProps {
  className?: string
}

const FADE_MS = 260

export function FieldGlobe({ className }: FieldGlobeProps) {
  const reduce = useReducedMotion() ?? false
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const earthImg = useEarthTexture()

  // Imperative handle the late-arriving texture effect can call into.
  const uploadRef = useRef<((img: HTMLImageElement) => void) | null>(null)
  const earthRef = useRef<HTMLImageElement | null>(null)
  earthRef.current = earthImg

  useEffect(() => {
    if (earthImg && uploadRef.current) uploadRef.current(earthImg)
  }, [earthImg])

  useEffect(() => {
    const canvas = canvasRef.current
    const root = rootRef.current
    if (!canvas || !root) return

    let gl: WebGL2RenderingContext | null = null
    try {
      gl = canvas.getContext?.('webgl2', { antialias: true, alpha: true }) ?? null
    } catch {
      gl = null
    }
    if (!gl) return // no WebGL2 → StaticBackdrop remains; nothing scheduled

    const FRAG = fragmentSource(FIELD_GLOBE_PARAMS)

    // ---- GL objects (recreated on context restore) ----
    let prog: WebGLProgram | null = null
    let tex: WebGLTexture | null = null
    let U: Record<string, WebGLUniformLocation | null> = {}
    let firstFramePainted = false

    const compile = (type: number, src: string) => {
      const s = gl!.createShader(type)!
      gl!.shaderSource(s, src)
      gl!.compileShader(s)
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
        // eslint-disable-next-line no-console
        console.error(gl!.getShaderInfoLog(s))
      }
      return s
    }

    const initGL = (): boolean => {
      const g = gl!
      prog = g.createProgram()
      if (!prog) return false
      g.attachShader(prog, compile(g.VERTEX_SHADER, VERTEX_SRC))
      g.attachShader(prog, compile(g.FRAGMENT_SHADER, FRAG))
      g.linkProgram(prog)
      if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
        // eslint-disable-next-line no-console
        console.error(g.getProgramInfoLog(prog))
        return false
      }
      g.useProgram(prog)

      const buf = g.createBuffer()
      g.bindBuffer(g.ARRAY_BUFFER, buf)
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW)
      const loc = g.getAttribLocation(prog, 'a_pos')
      g.enableVertexAttribArray(loc)
      g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0)

      U = {}
      for (const name of ['uResolution', 'uTime', 'uReduce', 'uArcSamples', 'uEarth']) {
        U[name] = g.getUniformLocation(prog, name)
      }
      g.uniform1i(U.uEarth ?? null, 0)

      // Default 1×1 dark texture (so the shader runs before the photo loads).
      tex = g.createTexture()
      g.activeTexture(g.TEXTURE0)
      g.bindTexture(g.TEXTURE_2D, tex)
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 1, 1, 0, g.RGBA, g.UNSIGNED_BYTE,
        new Uint8Array([3, 7, 18, 255]))
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE)
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE)
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR)
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR)
      return true
    }

    const uploadEarth = (img: HTMLImageElement) => {
      if (!gl || !tex) return
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      } catch {
        /* ignore a bad/cross-origin decode; keep the default texture */
      }
      if (reduce) renderOnce()
    }
    uploadRef.current = uploadEarth

    // ---- size ----
    const DPR_HARD_CAP = 1.5
    let dprCap = DPR_HARD_CAP
    let w = 0, h = 0
    const resize = () => {
      const rect = root.getBoundingClientRect()
      w = Math.max(1, Math.round(rect.width))
      h = Math.max(1, Math.round(rect.height))
      const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, dprCap)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      gl!.viewport(0, 0, canvas.width, canvas.height)
    }

    const fadeIn = () => {
      if (firstFramePainted) return
      firstFramePainted = true
      canvas.style.transition = `opacity ${FADE_MS}ms ease`
      canvas.style.opacity = '1'
    }

    // ---- draw ----
    const start = performance.now()
    let level = 0
    let arcSamples = qualityFor(0).arcSamples

    const draw = (now: number) => {
      const g = gl!
      g.uniform2f(U.uResolution ?? null, canvas.width, canvas.height)
      g.uniform1f(U.uTime ?? null, (now - start) / 1000)
      g.uniform1f(U.uReduce ?? null, reduce ? 1 : 0)
      g.uniform1f(U.uArcSamples ?? null, arcSamples)
      g.drawArrays(g.TRIANGLES, 0, 3)
      fadeIn()
    }

    const renderOnce = () => { resize(); draw(performance.now()) }

    // ---- animated loop with cadence + adaptive quality ----
    let rafId = 0
    let running = false
    let lastFrame = 0
    let acc = 0, accN = 0, lastEval = 0

    const frame = (now: number) => {
      const cfg = qualityFor(level)
      if (cfg.cadenceMs > 0 && now - lastFrame < cfg.cadenceMs) {
        rafId = requestAnimationFrame(frame)
        return
      }
      const dt = lastFrame ? now - lastFrame : 16
      lastFrame = now
      arcSamples = cfg.arcSamples

      resize()
      draw(now)

      // Rolling average → re-evaluate quality every ~1s of wall time.
      acc += dt; accN++
      if (now - lastEval > 1000 && accN > 0) {
        const avg = acc / accN
        const nl = nextLevel(level, avg)
        if (nl !== level) {
          level = nl
          dprCap = Math.min(DPR_HARD_CAP, qualityFor(level).dprCap)
          resize() // apply any DPR change immediately
        }
        acc = 0; accN = 0; lastEval = now
      }
      rafId = requestAnimationFrame(frame)
    }

    const startLoop = () => {
      if (running) return
      running = true
      lastFrame = 0; lastEval = performance.now()
      rafId = requestAnimationFrame(frame)
    }
    const stopLoop = () => {
      running = false
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
    }

    // ---- visibility / lifecycle gating ----
    let onscreen = true
    let pageVisible = typeof document === 'undefined' || !document.hidden
    let active = true // pagehide=false → suspended

    const apply = () => {
      if (reduce) return // static: never loops
      if (onscreen && pageVisible && active) startLoop()
      else stopLoop()
    }

    let observer: IntersectionObserver | undefined
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        for (const e of entries) onscreen = e.isIntersecting
        apply()
      }, { threshold: 0.01 })
      observer.observe(root)
    }
    const onVisibility = () => { pageVisible = !document.hidden; apply() }
    const onPageHide = () => { active = false; apply() }
    const onPageShow = () => { active = true; apply() }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide)
      window.addEventListener('pageshow', onPageShow)
    }
    const onResize = () => { resize(); if (reduce) draw(performance.now()) }
    if (typeof window !== 'undefined') window.addEventListener('resize', onResize)

    // ---- context loss / restore ----
    const onLost = (e: Event) => {
      e.preventDefault()
      stopLoop()
      firstFramePainted = false
      canvas.style.transition = ''
      canvas.style.opacity = '0' // reveal StaticBackdrop underneath
    }
    const onRestored = () => {
      if (!initGL()) return
      if (earthRef.current) uploadEarth(earthRef.current)
      apply()
      if (reduce) renderOnce()
    }
    canvas.addEventListener('webglcontextlost', onLost as EventListener)
    canvas.addEventListener('webglcontextrestored', onRestored as EventListener)

    // ---- boot ----
    if (!initGL()) return
    if (earthRef.current) uploadEarth(earthRef.current)
    if (reduce) {
      renderOnce() // one calm frame, no loop
    } else {
      apply()
    }

    return () => {
      stopLoop()
      observer?.disconnect()
      uploadRef.current = null
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide)
        window.removeEventListener('pageshow', onPageShow)
        window.removeEventListener('resize', onResize)
      }
      canvas.removeEventListener('webglcontextlost', onLost as EventListener)
      canvas.removeEventListener('webglcontextrestored', onRestored as EventListener)
      const lose = gl?.getExtension('WEBGL_lose_context')
      lose?.loseContext()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce])

  return (
    <div ref={rootRef} aria-hidden="true" data-testid="field-globe"
      className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <canvas ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0 }} />
    </div>
  )
}

export default FieldGlobe
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/home/FieldGlobe.test.tsx`
Expected: PASS (jsdom path: no WebGL2 → canvas at opacity 0, aria-hidden, no rAF).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -b
git add src/home/FieldGlobe.tsx src/home/FieldGlobe.test.tsx
git commit -m "feat(home): FieldGlobe WebGL2 component (lifecycle, fade-in, adaptive)"
```

---

## Task 7: Wire FieldGlobe into HomeBackground + subordination scrim

**Files:**
- Modify: `app/src/components/HomeBackground.tsx`, `app/src/components/HomeBackground.test.tsx`

- [ ] **Step 1: Extend the HomeBackground test**

Append to `app/src/components/HomeBackground.test.tsx`:
```tsx
import { vi } from 'vitest'
import { __resetWebGL2Cache } from '../home/webgl-support'

vi.mock('../home/FieldGlobe', () => ({ FieldGlobe: () => <div data-testid="field-globe" /> }))

describe('HomeBackground — shader gating', () => {
  it('mounts FieldGlobe only when WebGL2 is supported', () => {
    __resetWebGL2Cache()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((id: string) => (id === 'webgl2' ? ({} as WebGL2RenderingContext) : null)) as never,
    )
    const { getByTestId, unmount } = render(<HomeBackground />)
    expect(getByTestId('field-globe')).toBeInTheDocument()
    unmount()
    vi.restoreAllMocks()
  })

  it('renders only the StaticBackdrop when WebGL2 is unsupported', () => {
    __resetWebGL2Cache()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never)
    const { queryByTestId, container } = render(<HomeBackground />)
    expect(queryByTestId('field-globe')).not.toBeInTheDocument()
    expect(container.innerHTML).toMatch(/radial-gradient/)
    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/HomeBackground.test.tsx`
Expected: FAIL — FieldGlobe not rendered (HomeBackground is still static-only).

- [ ] **Step 3: Implement the gated FieldGlobe + scrim**

`app/src/components/HomeBackground.tsx`:
```tsx
import { useMemo } from 'react'
import { StaticBackdrop } from './StaticBackdrop'
import { FieldGlobe } from '../home/FieldGlobe'
import { supportsWebGL2 } from '../home/webgl-support'

/**
 * HomeBackground — the launchpad background boundary. ALWAYS renders
 * StaticBackdrop first/immediately (the hero never waits). When WebGL2 is
 * supported, layers the FieldGlobe shader above it (transparent until its first
 * frame, then fades in). A soft top scrim keeps the headline + pill dominant
 * over the bright atmospheric limb (subordination, spec §6).
 */
export function HomeBackground() {
  const enableShader = useMemo(() => supportsWebGL2(), [])
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <StaticBackdrop />
      {enableShader && <FieldGlobe className="absolute inset-0" />}
      {/* Subordination scrim: darkens the top band where the headline sits. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(5,5,9,0.55) 0%, rgba(5,5,9,0.18) 32%, rgba(5,5,9,0) 60%)',
        }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/HomeBackground.test.tsx`
Expected: PASS (both gating cases + the original immediate-paint test).

- [ ] **Step 5: Subordination acceptance (manual, in-app)**

```bash
npm run dev
```
Open the launchpad (logged-in, no upcoming trip). Verify against spec §6 acceptance:
- The white "Where to next?" headline + the pill are comfortably legible over the brightest frame, light **and** dark theme, mobile width **and** desktop.
- The background is felt, not the first thing the eye lands on.

If legibility is marginal, tune ONE or more (re-run dev after each): strengthen the scrim's top stop here; and/or lower `FIELD_GLOBE_PARAMS.uHorizon` / trim `uGlow` in `field-globe.glsl.ts` (these are source edits to the frozen object's literal — change the values, not at runtime). Re-run `npx vitest run src/home/field-globe.glsl.test.ts` if you touch params (update the literal-baking assertion if the changed value affects it).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc -b
git add src/components/HomeBackground.tsx src/components/HomeBackground.test.tsx src/home/field-globe.glsl.ts
git commit -m "feat(home): layer FieldGlobe in HomeBackground + subordination scrim"
```

---

## Task 8: Full verification + build + perf

**Files:** none (verification only; small fixes if needed)

- [ ] **Step 1: Full typecheck + test suite**

Run: `npx tsc -b && npx vitest run`
Expected: `tsc` clean; full suite green (all prior Phase 1 + new Phase 2 tests). Fix any regressions before proceeding.

- [ ] **Step 2: Production build (asset + bundle)**

Run: `npm run build`
Expected: build succeeds; `earth-night.webp` is emitted to `dist/assets/` and referenced with a hashed URL. Confirm the webp is **60–120KB** in `dist`.

- [ ] **Step 3: Manual perf + lifecycle smoke (preview build)**

```bash
npm run preview
```
On the launchpad:
- **60fps** desktop; throttle CPU 4–6× (DevTools Performance) and confirm it adapts (quality steps down) rather than juddering.
- **Pause/resume:** switch tabs (visibilitychange), scroll the launchpad offscreen (IntersectionObserver), and trigger bfcache (navigate away + back) — the rAF loop stops and resumes; no runaway loop in the background.
- **No-flash:** on load the StaticBackdrop shows instantly and the shader fades in (no blank/compile flash).
- **Context loss:** in console, `document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()` → canvas fades out, StaticBackdrop remains, hero stays usable.
- **Reduced motion:** OS "reduce motion" on → one still frame, no animation.

- [ ] **Step 4: Final review + finish the branch**

Dispatch the final holistic code review (subagent-driven-development's final reviewer). Then use superpowers:finishing-a-development-branch to merge/PR. Deploy is manual per CLAUDE.md (`cd app && npm run build` → `npx wrangler deploy` from repo root); smoke-test `/`, `/trips` return 200 and the launchpad renders.

---

## Self-review notes (author)

- **Spec coverage:** StaticBackdrop extraction (§3) ✓ T1; HomeBackground boundary + immediate paint (§3, §11) ✓ T2/T7; shader + immutable params (§3, §4) ✓ T3; webp asset + lazy loader, GL-object ownership in FieldGlobe (§2, §3) ✓ T4/T6; adaptive quality (§7) ✓ T5/T6; FieldGlobe lifecycle, fade-in, pagehide/pageshow, context-loss (§3, §5, §7) ✓ T6; subordination (§6) ✓ T7; fallback tiers + tests (§5, §9) ✓ across; perf budget (§7) ✓ T8.
- **Type consistency:** `FIELD_GLOBE_PARAMS`, `fragmentSource`, `MAX_ARC_SAMPLES`, `VERTEX_SRC` (T3) used identically in T5 (`MAX_ARC_SAMPLES`) and T6 (all). `qualityFor`/`nextLevel`/`QUALITY_LEVELS` (T5) used in T6. `supportsWebGL2`/`__resetWebGL2Cache` (T2) used in T7. `StaticBackdrop` (T1) used in T2; `HomeBackground` (T2) used in Launchpad (T2) and extended (T7); `FieldGlobe` (T6) used in T7.
- **Reduced-motion + adaptive interplay:** reduced motion never starts the loop (`apply()` early-returns), so adaptive quality only runs in the animated path — correct.
