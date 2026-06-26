import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { signalHeroReady } from './heroReady'
import type { HeroClip } from './types'

/**
 * HeroVideoStage — a CONTROLLED cinematic background.
 *
 * Unlike the autonomous `HeroModeCinematic` (which cycles clips on a timer),
 * this shows exactly the `clip` it's handed and crossfades to a new one whenever
 * that prop changes. The Landing hero drives it from the typewriter, so the
 * background always matches the word being typed.
 *
 * Two stacked layers (poster + <video>) crossfade by opacity. A poster always
 * paints first (instant, and the reduced-motion / save-data fallback). Video is
 * a progressive enhancement: muted, looped, playsInline, plays on mobile too.
 * Legibility scrims (tuned by the clip's dominantColor) keep overlaid text ≥4.5:1.
 */

const CROSSFADE_MS = 800

interface NetworkInformation {
  saveData?: boolean
  effectiveType?: string
}

function getConnection(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { connection?: NetworkInformation }).connection
}

/** Poster-only when motion is off or the connection is metered/slow. */
function computePosterOnly(reducedMotion: boolean): boolean {
  if (reducedMotion) return true
  const conn = getConnection()
  if (conn) {
    if (conn.saveData === true) return true
    if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return true
  }
  return false
}

function objectPosition(clip: HeroClip): string {
  const x = clip.focalPoint?.x ?? 0.5
  const y = clip.focalPoint?.y ?? 0.5
  return `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`
}

function matchMediaSafe(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  try {
    return window.matchMedia(query)
  } catch {
    return null
  }
}

/** True on narrow (phone-portrait) viewports, where subject-framed crops apply. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => matchMediaSafe('(max-width: 768px)')?.matches ?? false)
  useEffect(() => {
    const mq = matchMediaSafe('(max-width: 768px)')
    if (!mq) return
    const onChange = () => setMobile(mq.matches)
    onChange()
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return mobile
}

export interface HeroVideoStageProps {
  /** The clip to show. Changing it crossfades the background. */
  clip: HeroClip
  /** Upcoming clips to prefetch so the next crossfades are instant. */
  upcoming?: HeroClip[]
  className?: string
  /** When false, both video layers pause (no new frames decoded). Default true. */
  playing?: boolean
}

export function HeroVideoStage({ clip, upcoming, className, playing = true }: HeroVideoStageProps) {
  const reducedMotion = useReducedMotion() ?? false
  const posterOnly = useMemo(() => computePosterOnly(reducedMotion), [reducedMotion])
  const isMobile = useIsMobile()

  // Both layers are always mounted (each owns a persistent <video> node so a
  // source switch is just a reload, never a remount that would break crossfade).
  const [front, setFront] = useState<'a' | 'b'>('a')
  const [clipA, setClipA] = useState<HeroClip>(clip)
  const [clipB, setClipB] = useState<HeroClip>(clip)

  const frontRef = useRef<'a' | 'b'>('a')
  useEffect(() => {
    frontRef.current = front
  }, [front])
  const currentIdRef = useRef(clip.id)

  const videoARef = useRef<HTMLVideoElement | null>(null)
  const videoBRef = useRef<HTMLVideoElement | null>(null)

  /* Crossfade to the new clip whenever `clip` changes. */
  useEffect(() => {
    if (clip.id === currentIdRef.current) return
    currentIdRef.current = clip.id

    const goingTo: 'a' | 'b' = frontRef.current === 'a' ? 'b' : 'a'
    // Stage the incoming clip on the back layer (VideoLayer reloads on id change).
    if (goingTo === 'a') setClipA(clip)
    else setClipB(clip)

    let cancelled = false
    let readyTimer: ReturnType<typeof setTimeout> | undefined
    const flip = () => {
      if (!cancelled) setFront(goingTo)
    }

    const incoming = goingTo === 'a' ? videoARef.current : videoBRef.current
    if (!posterOnly && incoming) {
      // Decode-before-show: flip once the freshly-staged source can play, with a
      // poster-covered timeout so a slow/missing file still crossfades.
      let settled = false
      const onReady = () => {
        if (settled) return
        settled = true
        incoming.removeEventListener('canplay', onReady)
        incoming.play?.()?.catch(() => {})
        flip()
      }
      incoming.addEventListener('canplay', onReady)
      readyTimer = setTimeout(onReady, 600)
      return () => {
        cancelled = true
        incoming.removeEventListener('canplay', onReady)
        if (readyTimer) clearTimeout(readyTimer)
      }
    }

    // Poster-only (or no video node yet): brief beat so the poster swaps in.
    readyTimer = setTimeout(flip, 40)
    return () => {
      cancelled = true
      if (readyTimer) clearTimeout(readyTimer)
    }
  }, [clip, posterOnly])

  /* Poster-only: no <video> fires onPlaying, so signal hero-ready ourselves. */
  useEffect(() => {
    if (!posterOnly) return
    const t = setTimeout(signalHeroReady, 200)
    return () => clearTimeout(t)
  }, [posterOnly])

  /* Prefetch the next few clips so upcoming crossfades are instant. Skips when
     poster-only (reduced motion / data-saver) to respect that intent. */
  const preloadedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (posterOnly || typeof fetch !== 'function' || !upcoming?.length) return
    for (const c of upcoming) {
      const next = isMobile && c.sourcesMobile?.length ? c.sourcesMobile[0] : c.sources[0]
      const src = next?.src
      if (!src || preloadedRef.current.has(src)) continue
      preloadedRef.current.add(src)
      fetch(src).catch(() => {})
    }
  }, [upcoming, isMobile, posterOnly])

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

  const scrimColor = (front === 'a' ? clipA : clipB).dominantColor

  return (
    <div className={className} aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Layer ref={videoARef} clip={clipA} visible={front === 'a'} posterOnly={posterOnly} isMobile={isMobile} />
      <Layer ref={videoBRef} clip={clipB} visible={front === 'b'} posterOnly={posterOnly} isMobile={isMobile} />
      <Scrims dominantColor={scrimColor} />
    </div>
  )
}

interface LayerProps {
  clip: HeroClip
  visible: boolean
  posterOnly: boolean
  isMobile: boolean
}

const Layer = forwardRef<HTMLVideoElement, LayerProps>(function Layer({ clip, visible, posterOnly, isMobile }, ref) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const setRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = el
  }

  // On narrow screens use the subject-framed portrait crop when one exists, so
  // the subject isn't cover-cropped out of frame.
  const useMobileCrop = isMobile && !!clip.sourcesMobile?.length
  const poster = useMobileCrop ? clip.posterMobile! : clip.poster
  const source = useMobileCrop ? clip.sourcesMobile![0] : clip.sources[0]

  // React swapping <source> children does NOT reload a <video> — reload on
  // source change (clip OR mobile/desktop variant) so the staged clip plays.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    try {
      v.load()
    } catch {
      /* jsdom / partial DOM — ignore */
    }
  }, [source?.src])

  const cover: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    // Portrait crops are already subject-framed → center them.
    objectPosition: useMobileCrop ? '50% 50%' : objectPosition(clip),
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: visible ? 1 : 0,
        transition: `opacity ${CROSSFADE_MS}ms ease`,
        willChange: 'opacity',
      }}
    >
      <img data-testid="hero-poster" src={poster} alt="" aria-hidden="true" decoding="async" loading="eager" style={cover} />
      {!posterOnly && (
        <video
          ref={setRef}
          data-testid="hero-video"
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          poster={poster}
          onPlaying={() => signalHeroReady()}
          style={{ ...cover, pointerEvents: 'none' }}
        >
          <source src={source?.src} type={source?.type} />
        </video>
      )}
    </div>
  )
})

function Scrims({ dominantColor }: { dominantColor: string }) {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,7,12,.34)' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(6,7,12,.78), rgba(6,7,12,0) 45%, rgba(6,7,12,.55))',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(120% 70% at 50% 34%, rgba(6,7,12,.62), rgba(6,7,12,.30) 38%, transparent 64%)',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: dominantColor, opacity: 0.1, mixBlendMode: 'multiply' }} />
    </>
  )
}

export default HeroVideoStage
