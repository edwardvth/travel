import { useEffect, useRef, useState } from 'react'
import { fetchNarrationUrl, speakFallback } from './narrate'
import { useNarrationSpeed } from './useNarrationSpeed'
import { SpeedToggle } from './SpeedToggle'
import { Loader2, Pause, Play } from 'lucide-react'

const BAR_COUNT = 6
/** Idle / frozen-low bar height as a scaleY fraction. */
const IDLE_SCALE = 0.22

/** mm:ss for a finite, non-negative seconds value; null otherwise. */
function formatDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** True when the device asks for reduced motion (browser-only; false in SSR/jsdom default). */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

type EqMode = 'synthetic' | 'analyser'

/**
 * Six equalizer bars. Two drive modes:
 *   - `synthetic`: the `vyEq` keyframe animates the bars (Web-Speech path, where
 *     no audio stream exists to analyse). Already reduced-motion-guarded in CSS.
 *   - `analyser`: real amplitude — the parent writes per-bar scaleY straight to
 *     each bar via `barRefs` on a rAF loop (no React re-render per frame).
 *
 * Under `prefers-reduced-motion` the bars stay static & low in both modes.
 */
function Equalizer({
  playing,
  mode,
  barRefs,
}: {
  playing: boolean
  mode: EqMode
  barRefs: React.MutableRefObject<(HTMLSpanElement | null)[]>
}) {
  const delays = ['0s', '.14s', '.28s', '.07s', '.36s', '.2s']
  const synthetic = mode === 'synthetic'
  return (
    <div className="flex items-end gap-[2.5px] h-[18px]" aria-hidden="true">
      {delays.map((d, i) => (
        <span
          key={i}
          ref={el => {
            barRefs.current[i] = el
          }}
          className="w-[2.5px] h-[18px] rounded-[2px] bg-sig-link origin-bottom"
          style={
            synthetic
              ? {
                  // Web-Speech fallback exposes no PCM stream, so we can't read
                  // real amplitude — keep the subtle synthetic "speaking" motion.
                  animation: 'vyEq .9s ease-in-out infinite',
                  animationDelay: d,
                  animationPlayState: playing ? 'running' : 'paused',
                }
              : {
                  // analyser path: scaleY is written imperatively by the rAF loop.
                  transform: `scaleY(${IDLE_SCALE})`,
                  transition: 'transform .08s linear',
                }
          }
        />
      ))}
    </div>
  )
}

type Phase = 'idle' | 'loading' | 'playing' | 'paused'

/**
 * Narration control, built to the Premium Modern reference. On the first tap it
 * fetches an ElevenLabs clip via the narrate proxy (`fetchNarrationUrl`) and
 * plays it through an `<audio>` element; if the proxy returns null it falls back
 * to on-device Web Speech (`speakFallback`).
 *
 * Equalizer: for the ElevenLabs path we build a Web-Audio `AnalyserNode` and map
 * a handful of frequency bins to the bars' `scaleY` for a real-amplitude, premium
 * motion (frozen on pause, low idle on stop). The Web-Speech path has no stream,
 * so it keeps the synthetic `vyEq` motion. `prefers-reduced-motion` skips the rAF
 * loop and shows static low bars. Web Audio is browser-only — in jsdom (tests)
 * or any environment without `AudioContext` the analyser no-ops gracefully and
 * the synthetic bars are used instead.
 *
 * Speed: a local-only preference (`useNarrationSpeed`). The `SpeedToggle` pill
 * sits beside the play control; the value applies to `audio.playbackRate` and is
 * passed as the Web-Speech `rate`.
 *
 * Locked behaviour: narration **NEVER auto-plays** — playback starts only on a
 * user tap. The object URL is always revoked on ended/error/unmount, and the
 * audio is paused on unmount, so no blob leaks and nothing keeps talking after
 * the component goes away.
 *
 * Two visual variants match the two places it appears:
 *   - `pill` (default): the full-width claret pill inside CurrentStopCard.
 *   - `row`: the round play button + label + bars used in ArrivalView's sheet.
 */
export function ListenButton({
  text,
  voiceId,
  variant = 'pill',
}: {
  text: string
  voiceId: string
  variant?: 'pill' | 'row'
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [duration, setDuration] = useState<number | null>(null)
  const { speed, cycle } = useNarrationSpeed()

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const usingFallbackRef = useRef(false)
  const speedRef = useRef(speed)
  speedRef.current = speed

  // Web-Audio analyser plumbing (ElevenLabs path only).
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const barRefs = useRef<(HTMLSpanElement | null)[]>([])
  // 'analyser' once a real audio stream is wired; 'synthetic' for Web Speech /
  // jsdom / no-Web-Audio environments.
  const eqModeRef = useRef<EqMode>('synthetic')
  const [eqMode, setEqMode] = useState<EqMode>('synthetic')

  /** Write a scaleY to every bar (analyser path). */
  function setBars(scale: number) {
    const s = Math.max(IDLE_SCALE, Math.min(1, scale))
    for (const el of barRefs.current) if (el) el.style.transform = `scaleY(${s})`
  }
  function setBarsPerChannel(scales: number[]) {
    for (let i = 0; i < barRefs.current.length; i++) {
      const el = barRefs.current[i]
      if (el) el.style.transform = `scaleY(${scales[i] ?? IDLE_SCALE})`
    }
  }

  /** Stop the rAF loop and ease the bars back to idle. */
  function stopAnalyserLoop() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  /** Fully tear down the Web-Audio graph. */
  function teardownAudioGraph() {
    stopAnalyserLoop()
    try {
      sourceRef.current?.disconnect()
    } catch {
      /* already gone */
    }
    try {
      analyserRef.current?.disconnect()
    } catch {
      /* already gone */
    }
    const ctx = ctxRef.current
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {})
    sourceRef.current = null
    analyserRef.current = null
    ctxRef.current = null
    eqModeRef.current = 'synthetic'
    setEqMode('synthetic')
  }

  /**
   * Wire `audio` into a real-amplitude analyser. No-ops gracefully when Web
   * Audio is unavailable (jsdom / SSR / unsupported), leaving the synthetic
   * bars in place. Reduced-motion: skip the rAF loop, show static low bars.
   * Guard: only ONE MediaElementAudioSourceNode may exist per element — we wrap
   * creation in try/catch and tear down if it throws.
   */
  function attachAnalyser(audio: HTMLAudioElement) {
    if (typeof window === 'undefined') return
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return // jsdom / no Web Audio → keep synthetic bars

    try {
      const ctx = new Ctx()
      const source = ctx.createMediaElementSource(audio)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      analyser.connect(ctx.destination)
      ctxRef.current = ctx
      sourceRef.current = source
      analyserRef.current = analyser
      eqModeRef.current = 'analyser'
      setEqMode('analyser')
      void ctx.resume?.().catch(() => {})
    } catch {
      // createMediaElementSource throws if the element already has a source, or
      // Web Audio is half-supported — fall back to synthetic motion.
      teardownAudioGraph()
      return
    }

    if (prefersReducedMotion()) {
      // Static low bars; no animation loop.
      setBars(IDLE_SCALE)
      return
    }

    const analyser = analyserRef.current
    if (!analyser) return
    const bins = new Uint8Array(analyser.frequencyBinCount)
    // Pick ~6 low/mid bins (voice energy) spread across the spectrum.
    const idx = [1, 2, 3, 4, 6, 8]
    const tick = () => {
      const a = analyserRef.current
      const audioEl = audioRef.current
      if (!a || !audioEl) {
        rafRef.current = null
        return
      }
      if (audioEl.paused) {
        // Freeze the bars where they are (do not reset on pause).
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      a.getByteFrequencyData(bins)
      const scales = new Array(BAR_COUNT)
      for (let i = 0; i < BAR_COUNT; i++) {
        const v = (bins[idx[i] ?? i] ?? 0) / 255 // 0..1
        // Map to a subtle, premium range — never fully flat, never jumpy.
        scales[i] = Math.max(IDLE_SCALE, Math.min(1, 0.2 + v * 0.85))
      }
      setBarsPerChannel(scales)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  /** Tear down audio + revoke the blob URL. Safe to call repeatedly. */
  function teardown() {
    teardownAudioGraph()
    const a = audioRef.current
    if (a) {
      a.pause()
      a.removeAttribute('src')
      a.load()
      audioRef.current = null
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    if (usingFallbackRef.current && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    usingFallbackRef.current = false
  }

  // Revoke + stop on unmount — never leak a blob URL or keep narrating.
  useEffect(() => teardown, [])

  // If the text or voice changes, the existing clip is stale: reset.
  useEffect(() => {
    teardown()
    setPhase('idle')
    setDuration(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, voiceId])

  // Apply the current speed live to a playing/queued real clip.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  const playing = phase === 'playing'

  async function onToggle() {
    // Pause an in-flight clip.
    if (phase === 'playing') {
      audioRef.current?.pause()
      if (usingFallbackRef.current && window.speechSynthesis) window.speechSynthesis.cancel()
      setPhase('paused')
      return
    }
    // Resume a paused real clip.
    if (phase === 'paused' && audioRef.current) {
      audioRef.current.playbackRate = speedRef.current
      void audioRef.current.play().catch(() => setPhase('idle'))
      setPhase('playing')
      return
    }

    // First play (idle) — fetch + start. NEVER runs on mount; only on tap.
    setPhase('loading')
    const url = await fetchNarrationUrl(text, voiceId)
    if (url == null) {
      // Proxy unavailable → free on-device fallback. Listen always works.
      // No audio stream here, so the equalizer stays in synthetic mode.
      const ok = speakFallback(text, speedRef.current)
      usingFallbackRef.current = ok
      setPhase(ok ? 'playing' : 'idle')
      if (ok && window.speechSynthesis) {
        // The utterance was created inside speakFallback; observe its end via
        // the queue going empty. A light poll keeps the UI honest without
        // re-implementing the utterance plumbing.
        const tick = window.setInterval(() => {
          if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
            window.clearInterval(tick)
            usingFallbackRef.current = false
            setPhase('idle')
          }
        }, 400)
      }
      return
    }

    urlRef.current = url
    const audio = new Audio(url)
    // Web Audio's MediaElementSource taps the element; same-origin blob URLs are
    // safe, but set crossOrigin defensively so the graph isn't muted.
    audio.crossOrigin = 'anonymous'
    audio.playbackRate = speedRef.current
    audioRef.current = audio
    audio.onloadedmetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : null)
    audio.onended = () => {
      setPhase('idle')
      teardown()
    }
    audio.onerror = () => {
      setPhase('idle')
      teardown()
    }
    try {
      await audio.play()
      // Real amplitude: wire the analyser once the element is actually playing.
      attachAnalyser(audio)
      setPhase('playing')
    } catch {
      setPhase('idle')
      teardown()
    }
  }

  const durLabel = formatDuration(duration)
  const loading = phase === 'loading'

  if (variant === 'row') {
    return (
      <div className="flex items-center gap-[11px]">
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? 'Pause narration' : 'Listen to the story'}
          aria-pressed={playing}
          className="flex-none grid place-items-center w-[38px] h-[38px] rounded-full bg-sig-btn text-white cursor-pointer shadow-[0_6px_16px_-6px_rgba(176,71,63,.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link focus-visible:ring-offset-2 focus-visible:ring-offset-base"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
          ) : playing ? (
            <Pause size={14} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={14} fill="currentColor" className="ml-0.5" aria-hidden="true" />
          )}
        </button>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13.5px] font-semibold text-ink">Listen to the story</span>
          <span className="font-mono text-[10.5px] text-muted">
            {durLabel ? `${durLabel} · narrated` : 'narrated'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Equalizer playing={playing} mode={eqMode} barRefs={barRefs} />
          <SpeedToggle speed={speed} onCycle={cycle} />
        </div>
      </div>
    )
  }

  // pill variant
  return (
    <div className="flex items-center gap-1 w-full my-[15px]">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? 'Pause narration' : 'Listen to the story'}
        aria-pressed={playing}
        className="flex items-center gap-[11px] flex-1 rounded-[13px] bg-sig-btn/[0.14] border border-sig-btn/[0.34] px-[13px] py-2.5 cursor-pointer min-h-[44px] transition-colors hover:bg-sig-btn/[0.2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
      >
        <span className="flex-none grid place-items-center w-[30px] h-[30px] rounded-full bg-sig-btn text-white">
          {loading ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : playing ? (
            <Pause size={12} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={12} fill="currentColor" className="ml-0.5" aria-hidden="true" />
          )}
        </span>
        <Equalizer playing={playing} mode={eqMode} barRefs={barRefs} />
        <span className="ml-auto font-mono text-[11px] text-sig-link">
          {durLabel ? `Listen · ${durLabel}` : 'Listen'}
        </span>
      </button>
      <SpeedToggle speed={speed} onCycle={cycle} />
    </div>
  )
}

export default ListenButton
