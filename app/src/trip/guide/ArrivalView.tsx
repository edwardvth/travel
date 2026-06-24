import { useState } from 'react'
import type { Stop } from '../../types'
import { ListenButton } from './ListenButton'
import { StoryTabs, type StoryTab } from './StoryTabs'
import { Check } from 'lucide-react'

/** Striped-gradient placeholder for the full-bleed hero when there's no photo. */
function HeroPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        background:
          'repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 1px,transparent 1px 13px),linear-gradient(165deg,#2c211d,#140f0d)',
      }}
    />
  )
}

/**
 * The Arrival state — story-first, built to the Premium Modern reference. A
 * full-bleed hero photo (or striped placeholder) blooms behind a `vySonar` ✓
 * "YOU'VE ARRIVED" badge; the Fraunces place name + a mono telemetry line settle
 * at its base. Below, a content sheet carries the ListenButton (row variant), the
 * Story/Interesting Facts/Experience tabs, and the body; the footer holds "Mark complete &
 * continue →" with an advancing toast that slides in once tapped.
 *
 * LOCKED: no embedded map; narration never auto-plays. Pure presentation — the
 * parent supplies content + `onComplete` and owns advancing to the next stop.
 */
export function ArrivalView({
  stop,
  heroUrl,
  story,
  notice,
  experience,
  facts = [],
  voiceId,
  onComplete,
  activeTab,
  onTabChange,
  telemetry,
  nextLabel,
}: {
  stop: Stop
  heroUrl?: string | null
  story: string
  notice: string
  experience: string
  /** Structured interesting facts — rendered as a list in the Facts tab. */
  facts?: string[]
  voiceId: string
  onComplete: () => void
  activeTab: StoryTab
  onTabChange: (tab: StoryTab) => void
  /** Optional mono telemetry line under the name, e.g. "SAARINEN · 1965 · 630 FT". */
  telemetry?: string
  /** Optional next-stop label for the advancing toast, e.g. "City Museum · 8 MIN". */
  nextLabel?: string
}) {
  const [completed, setCompleted] = useState(false)
  const listenText = story || notice || experience || stop.name

  function handleComplete() {
    if (completed) return
    setCompleted(true) // show the advancing toast + settle the button before handing off
    onComplete()
  }

  return (
    <div className="relative w-full h-full bg-base rounded-[inherit] overflow-hidden flex flex-col">
      {/* Full-bleed hero */}
      <div className="relative h-[300px] flex-none overflow-hidden">
        {heroUrl ? (
          <img src={heroUrl} alt={stop.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <HeroPlaceholder />
        )}

        {/* Sonar ✓ + YOU'VE ARRIVED */}
        <div className="absolute left-4 top-[84px] flex items-center gap-2.5">
          <span className="relative inline-flex items-center justify-center w-[26px] h-[26px]">
            <span
              className="absolute inset-0 rounded-full border-[1.5px] border-sig-link"
              style={{ animation: 'vySonar 2.1s ease-out infinite' }}
              aria-hidden="true"
            />
            <span className="grid place-items-center w-[26px] h-[26px] rounded-full bg-sig-btn text-white">
              <Check size={13} strokeWidth={3} aria-hidden="true" />
            </span>
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.14em] text-white [text-shadow:0_1px_6px_rgba(0,0,0,.6)]">
            YOU'VE ARRIVED
          </span>
        </div>

        {/* Scrim → name + telemetry */}
        <div
          className="absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'linear-gradient(180deg,rgba(0,0,0,.25) 0%,transparent 30%,rgba(10,10,12,.2) 60%,var(--base) 100%)',
          }}
        />
        <div className="absolute left-[22px] right-[22px] bottom-3.5">
          <h2 className="font-serif font-medium text-[42px] leading-none tracking-[-0.02em] text-ink">
            {stop.name}
          </h2>
          {telemetry && (
            <p className="font-mono text-[10.5px] tracking-[0.04em] text-ink/70 mt-[7px]">{telemetry}</p>
          )}
        </div>
      </div>

      {/* Content sheet */}
      <div className="flex-1 overflow-y-auto px-[22px] pt-[18px]">
        <div className="mb-[18px]">
          <ListenButton text={listenText} voiceId={voiceId} variant="row" />
        </div>
        <StoryTabs
          story={story}
          notice={notice}
          experience={experience}
          facts={facts}
          active={activeTab}
          onChange={onTabChange}
        />
      </div>

      {/* Footer: advancing toast + CTA */}
      <div className="flex-none px-[22px] pt-3.5 pb-3 relative">
        <div
          role="status"
          aria-live="polite"
          className={
            'absolute left-[22px] right-[22px] -top-[30px] flex items-center gap-2 bg-overlay border border-sig-btn/40 rounded-[10px] px-3 py-2 transition-all duration-300 ease-out ' +
            (completed && nextLabel ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none')
          }
        >
          <span className="flex-none w-1.5 h-1.5 rounded-full bg-sig-link" aria-hidden="true" />
          <span className="font-mono text-[10.5px] tracking-[0.04em] text-sig-link truncate">
            {nextLabel ? `ADVANCING TO ${nextLabel.toUpperCase()}` : ''}
          </span>
        </div>

        <button
          type="button"
          onClick={handleComplete}
          disabled={completed}
          className={
            'w-full rounded-[14px] font-semibold text-[15.5px] py-[15px] min-h-[44px] flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link focus-visible:ring-offset-2 focus-visible:ring-offset-base ' +
            (completed
              ? 'bg-overlay text-sig-link cursor-default'
              : 'bg-sig-btn text-white cursor-pointer shadow-[0_10px_26px_-12px_rgba(176,71,63,.9)] hover:brightness-110')
          }
        >
          <span>{completed ? 'Completed' : 'Mark complete & continue'}</span>
          <span aria-hidden="true">{completed ? '✓' : '→'}</span>
        </button>
      </div>
    </div>
  )
}

export default ArrivalView
