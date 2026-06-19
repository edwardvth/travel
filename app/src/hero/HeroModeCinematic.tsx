import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { HERO_CONFIG } from './clips'
import { pickAny } from './timeOfDay'
import type { HeroClip, HeroVideoConfig } from './types'

/**
 * HeroModeCinematic — the cinematic background fill for the hero.
 *
 * Design contract (see spec §2 "Hero Video System" / §11 "Performance & a11y"):
 *   1. A poster `<img>` ALWAYS paints first — instant, and the ultimate
 *      fallback. With motion allowed it gets a slow Ken-Burns drift so the hero
 *      feels alive EVEN WHEN NO VIDEO FILE EXISTS (the real footage under
 *      /video/ is dropped in later).
 *   2. Video is a *progressive enhancement*: two crossfading <video> layers
 *      mount only when policy allows, decode-before-show, and fail gracefully
 *      back to the poster if a source is missing/errors.
 *   3. Legibility scrims (tuned by the clip's dominantColor) keep overlaid hero
 *      text ≥4.5:1.
 *
 * Poster-only policy (NO <video> mounts) when ANY of:
 *   - prefers-reduced-motion (also disables the drift), OR
 *   - coarse pointer / small screen and !enableVideoOnMobile, OR
 *   - navigator.connection.saveData (and config.saveDataPosterOnly), OR
 *   - effectiveType is '2g' / 'slow-2g'.
 * In poster-only mode we still crossfade between playlist posters so it stays
 * cinematic.
 */

const KEN_BURNS_MS = 14000

export interface HeroModeCinematicProps {
  config?: HeroVideoConfig
  className?: string
}

/* ------------------------------------------------------------------ */
/* SSR / jsdom-safe environment probes                                 */
/* ------------------------------------------------------------------ */

interface NetworkInformation {
  saveData?: boolean
  effectiveType?: string
}

function getConnection(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined
  // `connection` is non-standard; feature-detect.
  return (navigator as Navigator & { connection?: NetworkInformation }).connection
}

function matchMediaSafe(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

/** Decide whether videos are allowed to mount, given motion + config. */
function computePosterOnly(config: HeroVideoConfig, reducedMotion: boolean): boolean {
  if (reducedMotion) return true

  const coarse = matchMediaSafe('(pointer: coarse)')
  const small =
    typeof window !== 'undefined' && typeof window.innerWidth === 'number'
      ? window.innerWidth <= 768
      : false
  if ((coarse || small) && !config.enableVideoOnMobile) return true

  const conn = getConnection()
  if (conn) {
    if (config.saveDataPosterOnly && conn.saveData === true) return true
    if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return true
  }

  return false
}

function objectPosition(clip: HeroClip): string {
  const x = clip.focalPoint?.x ?? 0.5
  const y = clip.focalPoint?.y ?? 0.5
  return `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function HeroModeCinematic({
  config = HERO_CONFIG,
  className,
}: HeroModeCinematicProps) {
  const reducedMotion = useReducedMotion() ?? false
  const posterOnly = useMemo(
    () => computePosterOnly(config, reducedMotion),
    [config, reducedMotion],
  )
  const videoEnabled = !reducedMotion && !posterOnly
  const drift = !reducedMotion

  // The active clip (poster + scrim are driven by this). Starts null until the
  // mount effect resolves time-of-day/season — we DON'T call new Date() at
  // module scope.
  const [clip, setClip] = useState<HeroClip | null>(null)

  // Which of the two layers is currently the visible/front one.
  const [front, setFront] = useState<'a' | 'b'>('a')
  const [crossfading, setCrossfading] = useState(false)

  // Per-layer clip so A and B can show different posters during a crossfade.
  const [clipA, setClipA] = useState<HeroClip | null>(null)
  const [clipB, setClipB] = useState<HeroClip | null>(null)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const videoARef = useRef<HTMLVideoElement | null>(null)
  const videoBRef = useRef<HTMLVideoElement | null>(null)

  // The advance loop is mount-once (StrictMode-safe), so it must read the
  // CURRENT front layer from a ref — reading the `front` *state* inside that
  // closure would freeze it at 'a' and the crossfade would never alternate.
  const frontRef = useRef<'a' | 'b'>('a')
  useEffect(() => {
    frontRef.current = front
  }, [front])

  // Playlist + session history live in refs so the advancing effect can stay
  // mount-once (StrictMode-safe — no double timers).
  const playlistRef = useRef<HeroClip[]>([])
  const playlistIndexRef = useRef(0)
  const historyRef = useRef<string[]>([])

  /* ---- Selection: build playlist on mount ---- */
  useEffect(() => {
    const repick = (): HeroClip[] => {
      const next = pickAny(config, { history: historyRef.current })
      // Defensive: if shuffling yields nothing, fall back to the whole list.
      return next.length > 0 ? next : config.clips
    }

    const playlist = repick()
    playlistRef.current = playlist
    playlistIndexRef.current = 0

    const first = playlist[0] ?? config.clips[0] ?? null
    if (first) {
      pushHistory(historyRef, first.id, config.clips.length)
      setClip(first)
      setClipA(first)
      setFront('a')
    }
    // config is a stable default in practice; rebuild if it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  /* ---- Advance loop (poster crossfade and/or video crossfade) ---- */
  useEffect(() => {
    if (!clip) return
    // Static when reduced motion: no advancing, no crossfade.
    if (reducedMotion) return

    let advanceTimer: ReturnType<typeof setTimeout> | undefined
    let fadeTimer: ReturnType<typeof setTimeout> | undefined
    let canplayTimer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const nextClip = (): HeroClip => {
      const list = playlistRef.current
      let idx = playlistIndexRef.current + 1
      if (idx >= list.length) {
        // Exhausted — re-shuffle the whole library, excluding recent history.
        const repicked = pickAny(config, { history: historyRef.current })
        playlistRef.current = repicked.length > 0 ? repicked : config.clips
        idx = 0
      }
      playlistIndexRef.current = idx
      const next = playlistRef.current[idx] ?? config.clips[0]!
      pushHistory(historyRef, next.id, config.clips.length)
      return next
    }

    const advance = () => {
      if (cancelled) return
      const next = nextClip()
      const goingTo: 'a' | 'b' = frontRef.current === 'a' ? 'b' : 'a'

      // Stage the incoming layer with the next clip.
      if (goingTo === 'a') setClipA(next)
      else setClipB(next)

      // For video: kick a decode on the incoming element before fading.
      const incomingVideo = goingTo === 'a' ? videoARef.current : videoBRef.current

      const doFade = () => {
        if (cancelled) return
        setCrossfading(true)
        setClip(next)
        setFront(goingTo)
        // Clear the will-change/crossfade flag after the fade completes.
        fadeTimer = setTimeout(() => {
          if (!cancelled) setCrossfading(false)
        }, config.crossfadeMs)
        advanceTimer = setTimeout(advance, config.minClipDisplayMs)
      }

      if (videoEnabled && incomingVideo) {
        // Decode-before-show: wait for the incoming clip to be playable, but
        // never block forever (missing files won't fire canplay).
        let settled = false
        const onReady = () => {
          if (settled) return
          settled = true
          incomingVideo.removeEventListener('canplay', onReady)
          if (canplayTimer) clearTimeout(canplayTimer)
          incomingVideo.play?.()?.catch(() => {})
          doFade()
        }
        incomingVideo.addEventListener('canplay', onReady)
        // BUG 3: do NOT early-fire on readyState — right after staging a new
        // clip (which triggers VideoLayer's load()), a `readyState >= 2` would
        // reflect the OLD source, not the freshly-staged one. Fire only via the
        // real `canplay` event, with a safety timeout so a missing file (which
        // never fires canplay) still fades. The poster underneath covers the gap.
        canplayTimer = setTimeout(onReady, 600)
      } else {
        doFade()
      }
    }

    advanceTimer = setTimeout(advance, config.minClipDisplayMs)

    return () => {
      cancelled = true
      if (advanceTimer) clearTimeout(advanceTimer)
      if (fadeTimer) clearTimeout(fadeTimer)
      if (canplayTimer) clearTimeout(canplayTimer)
    }
    // We intentionally depend on the gating flags; clip is only used as a
    // "ready" guard (its identity changes each advance but the loop reads from
    // refs, so re-running on clip change simply re-arms the same single timer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip === null, reducedMotion, videoEnabled, config])

  /* ---- Play/pause: IntersectionObserver (offscreen) + visibilitychange ---- */
  useEffect(() => {
    if (!videoEnabled) return
    const root = rootRef.current
    if (!root) return

    let onscreen = true
    let visible = typeof document === 'undefined' || !document.hidden

    const apply = () => {
      const shouldPlay = onscreen && visible
      for (const v of [videoARef.current, videoBRef.current]) {
        if (!v) continue
        if (shouldPlay) v.play?.().catch(() => {})
        else v.pause?.()
      }
    }

    let observer: IntersectionObserver | undefined
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) onscreen = entry.isIntersecting
          apply()
        },
        { threshold: 0.01 },
      )
      observer.observe(root)
    }

    const onVisibility = () => {
      visible = !document.hidden
      apply()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }

    return () => {
      observer?.disconnect()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [videoEnabled])

  /* ---- Free decoders on unmount: pause + clear src ---- */
  useEffect(() => {
    return () => {
      for (const v of [videoARef.current, videoBRef.current]) {
        if (!v) continue
        try {
          v.pause?.()
          v.removeAttribute('src')
          v.load?.()
        } catch {
          /* jsdom / partial DOM — ignore */
        }
      }
    }
  }, [])

  // Don't render layers until the first clip resolves (poster needs a src).
  if (!clip) {
    return (
      <div ref={rootRef} className={className} aria-hidden="true" style={fillStyle} />
    )
  }

  const frontClip = front === 'a' ? clipA ?? clip : clipB ?? clip
  const scrimColor = (frontClip ?? clip).dominantColor

  return (
    <div ref={rootRef} className={className} aria-hidden="true" style={fillStyle}>
      {/* Layer 1: poster base. Two stacked posters so poster-only mode can also
          crossfade. The "front" one is opaque; the other sits behind it. */}
      <PosterLayer clip={clipA ?? clip} drift={drift} visible={front === 'a'} crossfadeMs={config.crossfadeMs} />
      {clipB && (
        <PosterLayer clip={clipB} drift={drift} visible={front === 'b'} crossfadeMs={config.crossfadeMs} />
      )}

      {/* Layer 2: video crossfade (progressive enhancement only). */}
      {videoEnabled && (
        <>
          <VideoLayer
            ref={videoARef}
            clip={clipA ?? clip}
            visible={front === 'a'}
            crossfading={crossfading}
            crossfadeMs={config.crossfadeMs}
          />
          <VideoLayer
            ref={videoBRef}
            clip={clipB ?? clip}
            visible={front === 'b'}
            crossfading={crossfading}
            crossfadeMs={config.crossfadeMs}
          />
        </>
      )}

      {/* Layer 3: legibility scrims, tuned by dominantColor. */}
      <Scrims dominantColor={scrimColor} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Layers                                                              */
/* ------------------------------------------------------------------ */

const fillStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
}

function PosterLayer({
  clip,
  drift,
  visible,
  crossfadeMs,
}: {
  clip: HeroClip
  drift: boolean
  visible: boolean
  crossfadeMs: number
}) {
  return (
    <div
      data-testid="hero-poster-layer"
      style={{
        position: 'absolute',
        inset: 0,
        opacity: visible ? 1 : 0,
        transition: `opacity ${crossfadeMs}ms ease`,
        willChange: 'opacity',
      }}
    >
      <img
        data-testid="hero-poster"
        src={clip.poster}
        alt=""
        aria-hidden="true"
        decoding="async"
        loading="eager"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: objectPosition(clip),
          transformOrigin: '50% 50%',
          animation: drift ? `voyager-ken-burns ${KEN_BURNS_MS}ms ease-in-out infinite alternate` : undefined,
        }}
      />
      {drift && (
        <style>{`
          @keyframes voyager-ken-burns {
            0%   { transform: scale(1) translate3d(0, 0, 0); }
            100% { transform: scale(1.08) translate3d(-1.5%, -1%, 0); }
          }
        `}</style>
      )}
    </div>
  )
}

interface VideoLayerProps {
  clip: HeroClip
  visible: boolean
  crossfading: boolean
  crossfadeMs: number
}

const VideoLayer = forwardRef<HTMLVideoElement, VideoLayerProps>(function VideoLayer(
  { clip, visible, crossfading, crossfadeMs },
  ref,
) {
  const [errored, setErrored] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Merge the forwarded ref with our internal one so the parent still gets the
  // element while we can drive load() ourselves.
  const setRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = el
  }

  // BUG 1: React swapping a <video>'s <source> children does NOT reload the
  // element — without an explicit load() it keeps playing the previous source.
  // Whenever the staged clip changes, reload the new sources. This also clears
  // BUG 2 (sticky `errored`): each freshly-staged clip gets a fresh chance to
  // play, falling back to the poster only if THAT clip errors.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    setErrored(false)
    try {
      v.load()
    } catch {
      /* jsdom / partial DOM — ignore */
    }
  }, [clip.id])

  return (
    <video
      ref={setRef}
      data-testid="hero-video"
      muted
      loop
      playsInline
      preload="metadata"
      poster={clip.poster}
      onError={() => setErrored(true)}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: objectPosition(clip),
        // If the source errored, stay transparent so the poster shows.
        opacity: errored ? 0 : visible ? 1 : 0,
        transition: `opacity ${crossfadeMs}ms ease`,
        willChange: crossfading ? 'opacity' : undefined,
        pointerEvents: 'none',
      }}
    >
      {clip.sources.map((s) => (
        <source key={s.src} src={s.src} type={s.type} />
      ))}
    </video>
  )
})

function Scrims({ dominantColor }: { dominantColor: string }) {
  return (
    <>
      {/* Flat darkening for baseline contrast. */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,7,12,.34)' }} />
      {/* Top→bottom gradient for nav + headline legibility. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to bottom, rgba(6,7,12,.78), rgba(6,7,12,0) 45%, rgba(6,7,12,.55))',
        }}
      />
      {/* Radial focus behind the centered hero text. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120% 70% at 50% 34%, rgba(6,7,12,.62), rgba(6,7,12,.30) 38%, transparent 64%)',
        }}
      />
      {/* Subtle tint from the clip's dominant color — warms/cools the wash to
          keep contrast consistent across very different clips. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: dominantColor,
          opacity: 0.1,
          mixBlendMode: 'multiply',
        }}
      />
    </>
  )
}

export default HeroModeCinematic

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Push an id into a bounded session-history buffer (most-recent-last). */
function pushHistory(ref: React.MutableRefObject<string[]>, id: string, total: number) {
  // Keep roughly half the catalog so re-picks avoid recent repeats but never
  // exclude everything.
  const cap = Math.max(1, Math.min(total - 1, Math.ceil(total / 2)))
  const next = ref.current.filter((x) => x !== id)
  next.push(id)
  while (next.length > cap) next.shift()
  ref.current = next
}
