import { renderProse } from '../richtext'

export type StoryTab = 'story' | 'notice' | 'experience'

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
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`story-tab-${active}`}
        className="text-[13.5px] leading-[1.55] text-ink/80 space-y-2.5"
      >
        {paragraphs.length > 0 ? (
          paragraphs.map((html, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: html }} />
          ))
        ) : (
          <p className="text-muted italic">Nothing here yet.</p>
        )}
      </div>
    </div>
  )
}

export default StoryTabs
