import { useEffect, useRef, useState } from 'react'
import { fetchNarrationUrl, speakFallback } from './narrate'
import { Loader2, Pause, Play } from 'lucide-react'

/** mm:ss for a finite, non-negative seconds value; null otherwise. */
function formatDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Six equalizer bars, animated (vyEq) only while `playing`. */
function Equalizer({ playing }: { playing: boolean }) {
  const delays = ['0s', '.14s', '.28s', '.07s', '.36s', '.2s']
  return (
    <div className="flex items-end gap-[2.5px] h-[18px]" aria-hidden="true">
      {delays.map((d, i) => (
        <span
          key={i}
          className="w-[2.5px] h-[18px] rounded-[2px] bg-sig-link origin-bottom"
          style={{
            animation: 'vyEq .9s ease-in-out infinite',
            animationDelay: d,
            animationPlayState: playing ? 'running' : 'paused',
          }}
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
 * to on-device Web Speech (`speakFallback`). The equalizer bars (`vyEq`) animate
 * only while playing, and a `0:52`-style duration appears once known.
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
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const usingFallbackRef = useRef(false)

  /** Tear down audio + revoke the blob URL. Safe to call repeatedly. */
  function teardown() {
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
      void audioRef.current.play().catch(() => setPhase('idle'))
      setPhase('playing')
      return
    }

    // First play (idle) — fetch + start. NEVER runs on mount; only on tap.
    setPhase('loading')
    const url = await fetchNarrationUrl(text, voiceId)
    if (url == null) {
      // Proxy unavailable → free on-device fallback. Listen always works.
      const ok = speakFallback(text)
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
        <div className="ml-auto">
          <Equalizer playing={playing} />
        </div>
      </div>
    )
  }

  // pill variant
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? 'Pause narration' : 'Listen to the story'}
      aria-pressed={playing}
      className="flex items-center gap-[11px] w-full my-[15px] rounded-[13px] bg-sig-btn/[0.14] border border-sig-btn/[0.34] px-[13px] py-2.5 cursor-pointer min-h-[44px] transition-colors hover:bg-sig-btn/[0.2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
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
      <Equalizer playing={playing} />
      <span className="ml-auto font-mono text-[11px] text-sig-link">
        {durLabel ? `Listen · ${durLabel}` : 'Listen'}
      </span>
    </button>
  )
}

export default ListenButton
