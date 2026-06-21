import type { Stop } from '../../types'
import { ListenButton } from './ListenButton'
import { StoryTabs, type StoryTab } from './StoryTabs'
import { Check } from 'lucide-react'

/** "480 m" / "1.2 km" from a distance in metres; null when unknown. */
function formatDistance(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m)) return null
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`
}

/** Striped-gradient placeholder when a stop has no hero photo (per the reference). */
function HeroPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        background:
          'repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 1px,transparent 1px 12px),linear-gradient(160deg,#2a201d,#15110f)',
      }}
    />
  )
}

/**
 * The image-forward current-stop card — the primary "traveling" surface, built
 * to the Premium Modern reference. A hero photo (or striped placeholder) carries
 * a live claret chip ("NOW · {dist} · {eta} · {heading}" with a `vyPulse` dot),
 * then a Fraunces place name, a subtitle, the ListenButton, the Story/Notice/
 * Experience tabs, and the Directions (claret) + ✓ complete actions.
 *
 * LOCKED: there is no embedded map here — Directions hands off to the device's
 * maps app (the parent wires `onDirections`). Pure presentation: props in,
 * callbacks out.
 */
export function CurrentStopCard({
  stop,
  heroUrl,
  distanceM,
  etaMin,
  headingLabel,
  story,
  notice,
  experience,
  voiceId,
  onDirections,
  onComplete,
  activeTab,
  onTabChange,
}: {
  stop: Stop
  heroUrl?: string | null
  distanceM?: number | null
  etaMin?: number | null
  headingLabel?: string | null
  story: string
  notice: string
  experience: string
  voiceId: string
  onDirections: () => void
  onComplete: () => void
  activeTab: StoryTab
  onTabChange: (tab: StoryTab) => void
}) {
  const dist = formatDistance(distanceM)
  const eta = etaMin != null && Number.isFinite(etaMin) ? `${Math.round(etaMin)} MIN` : null
  const heading = headingLabel ? `heading ${headingLabel}` : null

  // The live chip: "NOW" plus whatever telemetry is known, joined by · separators.
  const chipParts = ['NOW', dist, eta].filter(Boolean) as string[]

  // Subtitle: type · facts-derived detail · heading. Keep it calm; fall back gracefully.
  const subtitleParts = [stop.type, heading].filter(Boolean) as string[]

  const listenText = story || notice || experience || stop.name

  return (
    <div className="rounded-[18px] overflow-hidden bg-raised border border-hair shadow-[0_1px_2px_rgba(0,0,0,.4),0_26px_60px_-28px_rgba(0,0,0,.9)]">
      {/* Hero */}
      <div className="relative h-[160px] overflow-hidden bg-raised">
        {heroUrl ? (
          <img src={heroUrl} alt={stop.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <HeroPlaceholder />
        )}
        <div
          className="absolute inset-0"
          aria-hidden="true"
          style={{ background: 'linear-gradient(180deg,transparent 40%,rgba(0,0,0,.55))' }}
        />
        <div className="absolute left-[13px] bottom-[11px] inline-flex items-center gap-[7px] font-mono text-[10px] tracking-[0.07em] text-white bg-sig-btn/85 px-2.5 py-[5px] rounded-full backdrop-blur-[4px]">
          <span
            className="w-[6px] h-[6px] rounded-full bg-white"
            style={{ animation: 'vyPulse 1.4s ease-in-out infinite' }}
            aria-hidden="true"
          />
          {chipParts.join(' · ')}
        </div>
      </div>

      {/* Body */}
      <div className="px-[17px] pt-4 pb-[15px]">
        <h2 className="font-serif font-medium text-[34px] leading-[1.02] tracking-[-0.02em] text-ink">
          {stop.name}
        </h2>
        {subtitleParts.length > 0 && (
          <p className="text-[12.5px] text-muted mt-[5px]">{subtitleParts.join(' · ')}</p>
        )}

        <ListenButton text={listenText} voiceId={voiceId} variant="pill" />

        <StoryTabs
          story={story}
          notice={notice}
          experience={experience}
          active={activeTab}
          onChange={onTabChange}
        />

        <div className="flex gap-[9px] mt-3.5">
          <button
            type="button"
            onClick={onDirections}
            className="flex-1 rounded-[12px] bg-sig-btn text-white font-semibold text-[13.5px] py-[11px] min-h-[44px] cursor-pointer transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
          >
            Directions
          </button>
          <button
            type="button"
            onClick={onComplete}
            aria-label={`Mark ${stop.name} complete`}
            className="flex-none grid place-items-center w-11 min-h-[44px] rounded-[12px] border border-hair-strong bg-transparent text-ink/80 cursor-pointer transition-colors hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
          >
            <Check size={16} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default CurrentStopCard
