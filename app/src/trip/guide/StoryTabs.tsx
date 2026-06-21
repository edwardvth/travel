import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { renderProse } from '../richtext'

export type StoryTab = 'story' | 'notice' | 'experience'

/** Collapsed height (px) for a long tab body before "Read more". */
const CLAMP_PX = 190

// The data key stays `notice`; only the visible label is "Interesting Facts".
const TABS: { key: StoryTab; label: string }[] = [
  { key: 'story', label: 'Story' },
  { key: 'notice', label: 'Interesting Facts' },
  { key: 'experience', label: 'Experience' },
]

/**
 * Story / Interesting Facts / Experience tabs + the active body, built to the
 * Premium Modern reference: three mono, uppercase, letter-spaced tab labels with
 * a claret underline on the active one, and the chosen body rendered through
 * `renderProse` — block structure (HTML `<p>`/`<br>` or `\n\n`) becomes real
 * paragraphs and raw markup is stripped, so neither AI text nor Wikipedia HTML
 * extracts ever leak tags to the DOM (safe inline emphasis is preserved).
 *
 * Pure presentation — the parent owns `active` and is notified via `onChange`.
 * The bodies (`story`/`notice`/`experience`) are the stop's `history`/`notice`/
 * `tips` enrichment, mapped by the orchestrator.
 */
export function StoryTabs({
  story,
  notice,
  experience,
  active,
  onChange,
}: {
  story: string
  notice: string
  experience: string
  active: StoryTab
  onChange: (tab: StoryTab) => void
}) {
  const bodies: Record<StoryTab, string> = { story, notice, experience }
  const paragraphs = renderProse(bodies[active])
  const panelId = `story-panel-${active}`

  // Clamp long bodies to CLAMP_PX with a "Read more" toggle (for every tab).
  // `expanded` resets when the tab changes; `overflows` (measured) decides
  // whether the toggle shows. The fade uses a mask so it's background-agnostic.
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    setExpanded(false)
    const measure = () => {
      const el = contentRef.current
      if (el) setOverflows(el.scrollHeight > CLAMP_PX + 8)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [active, story, notice, experience])

  const clamp = !expanded && overflows
  const fadeMask = 'linear-gradient(to bottom, black 62%, transparent)'

  return (
    <div>
      <div
        role="tablist"
        aria-label="Stop details"
        className="flex flex-wrap gap-x-[18px] gap-y-1.5 border-b border-hair pb-2.5 mb-3.5"
      >
        {TABS.map(({ key, label }) => {
          const isActive = key === active
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`story-tab-${key}`}
              aria-selected={isActive}
              aria-controls={isActive ? panelId : undefined}
              onClick={() => onChange(key)}
              className={
                'relative font-mono text-[10.5px] tracking-[0.1em] uppercase whitespace-nowrap pb-1 -mb-1 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link rounded-sm ' +
                (isActive ? 'text-ink' : 'text-muted hover:text-ink')
              }
            >
              {label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 right-0 -bottom-[11px] h-[1.5px] bg-sig-btn"
                />
              )}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={`story-tab-${active}`}>
        <div
          ref={contentRef}
          className="text-[13.5px] leading-[1.55] text-ink/80 space-y-2.5"
          style={clamp ? { maxHeight: CLAMP_PX, overflow: 'hidden', maskImage: fadeMask, WebkitMaskImage: fadeMask } : undefined}
        >
          {paragraphs.length > 0 ? (
            paragraphs.map((html, i) => (
              <p key={i} dangerouslySetInnerHTML={{ __html: html }} />
            ))
          ) : (
            <p className="text-muted italic">Nothing here yet.</p>
          )}
        </div>
        {overflows && (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}
            className="mt-2 inline-flex items-center gap-1 font-mono text-[10.5px] tracking-[0.08em] uppercase text-sig-link hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link rounded-sm"
          >
            {expanded ? 'Read less' : 'Read more'}
            <ChevronDown
              size={13}
              aria-hidden="true"
              className={'transition-transform duration-200 motion-reduce:transition-none ' + (expanded ? 'rotate-180' : '')}
            />
          </button>
        )}
      </div>
    </div>
  )
}

export default StoryTabs
