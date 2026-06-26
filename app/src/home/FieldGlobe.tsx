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
