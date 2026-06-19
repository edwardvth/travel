import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { CITIES, project, type City } from './cities'

/**
 * HeroModeExplorer — the "Explorer" hero background: a calm, dark, premium
 * stylized world map rendered entirely on a single <canvas> (no map library, no
 * geo data files). It reads as a faint dot-grid globe with glowing city nodes
 * and a couple of slow ambient travel arcs.
 *
 * Design contract (spec §3 "Hero Mode B" / §11 "Performance & a11y"):
 *   - Lightweight: equirectangular dot field + capped nodes/arcs, drawn on one
 *     canvas. No DOM-heavy SVG, no large data.
 *   - Glowing city nodes at each CITIES position; soft claret/gold pulse.
 *   - A small rotating subset of arcs draw in and fade out on a slow cycle —
 *     never a web; a couple visible at a time.
 *   - `activeTerm` matching a city name brightens that node, shows its label,
 *     and biases arcs toward it.
 *   - Reduced motion → a STATIC lit map: nodes + active highlight, NO rAF loop,
 *     no pulse, no arcs animating (one calm frame).
 *   - Lifecycle: cancel rAF + timers on unmount; pause when offscreen
 *     (IntersectionObserver) or the tab is hidden (visibilitychange). Feature-
 *     detect canvas/window/IntersectionObserver for jsdom/SSR. StrictMode-safe
 *     (single loop guarded by refs).
 */

export interface HeroModeExplorerProps {
  /** The currently-typed destination (from the Typewriter); lights its node. */
  activeTerm?: string
  className?: string
}

/* ---- tunables (kept deliberately cheap) ---- */
const DOT_STEP = 26 // px between dot-grid samples (larger = fewer dots)
const ARC_COUNT = 2 // arcs visible at a time
const ARC_LIFE_MS = 5200 // full draw-in + hold + fade-out per arc
const NODE_BASE_R = 1.8 // base node radius (px, pre-DPR)

/* ---- token-ish colors (claret / gold / ink), kept inline to avoid CSS var
   reads on canvas) ---- */
const COL_BG_TOP = '#0a0c14'
const COL_BG_BOT = '#070810'
const COL_DOT = 'rgba(150, 170, 205, 0.10)'
const COL_NODE = '#C56A60' // --sig-link claret
const COL_NODE_ACTIVE = '#FFD9A8' // --gold
const COL_ARC = 'rgba(197, 106, 96, 0.55)'

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

export function HeroModeExplorer({ activeTerm, className }: HeroModeExplorerProps) {
  const reduce = useReducedMotion() ?? false
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Keep the latest activeTerm available to the draw loop without re-subscribing.
  const activeTermRef = useRef(activeTerm)
  activeTermRef.current = activeTerm

  useEffect(() => {
    const canvas = canvasRef.current
    const root = rootRef.current
    if (!canvas || !root) return
    // jsdom throws "not implemented" for getContext; real browsers may return
    // null if 2d is unavailable. Either way, bail quietly without animating.
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas.getContext?.('2d') ?? null
    } catch {
      ctx = null
    }
    if (!ctx) return

    const dpr =
      typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
        ? Math.min(window.devicePixelRatio || 1, 2)
        : 1

    // Logical (CSS px) size; updated on resize.
    let w = 0
    let h = 0

    const resize = () => {
      const rect = root.getBoundingClientRect()
      w = Math.max(1, Math.round(rect.width))
      h = Math.max(1, Math.round(rect.height))
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    // Project a city onto the current logical canvas. The map is inset slightly
    // and uses the full equirectangular extent.
    const placed = (): { city: City; x: number; y: number }[] =>
      CITIES.map((city) => {
        const p = project(city.lat, city.lng, w, h)
        return { city, x: p.x, y: p.y }
      })

    /* ---- static painters (shared by both modes) ---- */

    const paintBackdrop = () => {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, COL_BG_TOP)
      g.addColorStop(1, COL_BG_BOT)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      // Faint equirectangular dot field; opacity fades toward poles/edges so it
      // reads as a globe, not a flat grid.
      ctx.fillStyle = COL_DOT
      for (let y = DOT_STEP / 2; y < h; y += DOT_STEP) {
        // Latitude fade: dimmer near top/bottom edges.
        const latFade = Math.sin((y / h) * Math.PI) // 0 at edges, 1 at middle
        for (let x = DOT_STEP / 2; x < w; x += DOT_STEP) {
          const edgeFade = Math.sin((x / w) * Math.PI)
          const a = 0.04 + 0.1 * latFade * edgeFade
          ctx.globalAlpha = a
          ctx.beginPath()
          ctx.arc(x, y, 1, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }

    const paintNode = (
      x: number,
      y: number,
      active: boolean,
      pulse: number, // 0..1 glow strength
      label?: string,
    ) => {
      const color = active ? COL_NODE_ACTIVE : COL_NODE
      const r = NODE_BASE_R * (active ? 1.6 : 1)
      const glowR = r + 6 + pulse * (active ? 10 : 5)

      const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR)
      grad.addColorStop(0, color)
      grad.addColorStop(0.35, active ? 'rgba(255,217,168,0.55)' : 'rgba(197,106,96,0.5)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, glowR, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()

      if (active && label) {
        ctx.font =
          '600 12px "General Sans", system-ui, sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, x + glowR + 4, y)
      }
    }

    /* ---- arcs ---- */
    interface Arc {
      from: { x: number; y: number }
      to: { x: number; y: number }
      cx: number
      cy: number
      start: number // ms timestamp when it began
    }

    const arcs: Arc[] = []

    const spawnArc = (now: number, points: { x: number; y: number }[]) => {
      if (points.length < 2) return
      const activeName = normalize(activeTermRef.current ?? '')
      // Bias one endpoint toward the active node when present.
      let aIdx = Math.floor(Math.random() * points.length)
      if (activeName) {
        const idx = CITIES.findIndex((c) => normalize(c.name) === activeName)
        if (idx >= 0) aIdx = idx
      }
      let bIdx = Math.floor(Math.random() * points.length)
      if (bIdx === aIdx) bIdx = (bIdx + 1) % points.length
      const a = points[aIdx]
      const b = points[bIdx]
      // Control point lifted perpendicular-ish for a great-circle-ish bow.
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      const lift = Math.min(dist * 0.3, h * 0.22)
      arcs.push({ from: a, to: b, cx: mx, cy: my - lift, start: now })
    }

    const paintArc = (arc: Arc, now: number) => {
      const t = (now - arc.start) / ARC_LIFE_MS
      if (t >= 1) return
      // Draw-in for first 45%, hold, fade-out for last 30%.
      const drawn = Math.min(1, t / 0.45)
      let alpha = 1
      if (t > 0.7) alpha = 1 - (t - 0.7) / 0.3
      alpha = Math.max(0, Math.min(1, alpha))

      ctx.strokeStyle = COL_ARC
      ctx.globalAlpha = alpha
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.moveTo(arc.from.x, arc.from.y)
      // Sample the quadratic up to `drawn` so it appears to draw in.
      const steps = 26
      const end = Math.max(1, Math.floor(steps * drawn))
      for (let i = 1; i <= end; i++) {
        const s = i / steps
        const x =
          (1 - s) * (1 - s) * arc.from.x + 2 * (1 - s) * s * arc.cx + s * s * arc.to.x
        const y =
          (1 - s) * (1 - s) * arc.from.y + 2 * (1 - s) * s * arc.cy + s * s * arc.to.y
        ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    /* ---- static render (reduced motion: one calm frame, no rAF) ---- */
    const renderStatic = () => {
      const pts = placed()
      paintBackdrop()
      const activeName = normalize(activeTermRef.current ?? '')
      for (const { city, x, y } of pts) {
        const active = activeName !== '' && normalize(city.name) === activeName
        paintNode(x, y, active, 0, active ? city.name : undefined)
      }
    }

    if (reduce) {
      renderStatic()
      // Repaint on resize so the static map stays crisp; no animation loop.
      let resizeRaf = 0
      const onResize = () => {
        if (resizeRaf) return
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0
          resize()
          renderStatic()
        })
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', onResize)
      }
      return () => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf)
        if (typeof window !== 'undefined') {
          window.removeEventListener('resize', onResize)
        }
      }
    }

    /* ---- animated render ---- */
    let rafId = 0
    let running = false
    let lastSpawn = 0
    let onscreen = true
    let pageVisible = typeof document === 'undefined' || !document.hidden

    const frame = (now: number) => {
      const pts = placed()
      paintBackdrop()

      // Maintain ARC_COUNT live arcs; stagger spawns.
      for (let i = arcs.length - 1; i >= 0; i--) {
        if ((now - arcs[i].start) / ARC_LIFE_MS >= 1) arcs.splice(i, 1)
      }
      if (arcs.length < ARC_COUNT && now - lastSpawn > ARC_LIFE_MS / (ARC_COUNT + 1)) {
        spawnArc(now, pts)
        lastSpawn = now
      }
      for (const arc of arcs) paintArc(arc, now)

      const activeName = normalize(activeTermRef.current ?? '')
      for (const { city, x, y } of pts) {
        const active = activeName !== '' && normalize(city.name) === activeName
        // Gentle per-node pulse, phase-offset by longitude for life.
        const pulse = 0.5 + 0.5 * Math.sin(now / 1400 + x * 0.05)
        paintNode(x, y, active, active ? 1 : pulse * 0.6, active ? city.name : undefined)
      }

      rafId = requestAnimationFrame(frame)
    }

    const start = () => {
      if (running) return
      running = true
      rafId = requestAnimationFrame(frame)
    }
    const stop = () => {
      running = false
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    const apply = () => {
      if (onscreen && pageVisible) start()
      else stop()
    }

    // Pause offscreen.
    let observer: IntersectionObserver | undefined
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) onscreen = e.isIntersecting
          apply()
        },
        { threshold: 0.01 },
      )
      observer.observe(root)
    }

    // Pause when tab hidden.
    const onVisibility = () => {
      pageVisible = !document.hidden
      apply()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }

    const onResize = () => resize()
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResize)
    }

    apply()

    return () => {
      stop()
      observer?.disconnect()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onResize)
      }
    }
  }, [reduce])

  return (
    <div
      ref={rootRef}
      className={className}
      aria-hidden="true"
      data-testid="hero-explorer"
      data-static={reduce ? 'true' : undefined}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: COL_BG_BOT }}
    >
      <canvas
        ref={canvasRef}
        data-testid="hero-explorer-canvas"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
    </div>
  )
}

export default HeroModeExplorer
