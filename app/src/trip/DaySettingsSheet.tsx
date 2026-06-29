import { useEffect, useState } from 'react'
import { Sheet } from '../components/ui/Sheet'
import { Button } from '../components/ui/Button'

const inputClass =
  'w-full rounded-btn bg-fill border border-hair px-4 py-3 text-[15px] text-ink outline-none focus:border-sig-link'

/**
 * Edit a day's title & note. Title is optional — when blank the day falls back
 * to its date label. Immutable: the parent persists via `onSave` → `setDayMeta`.
 * Reuses `Sheet` (focus-trap + esc + restore). Edit-gated by the caller.
 */
export function DaySettingsSheet({
  open, title, note, dateLabel, onClose, onSave,
}: {
  open: boolean
  title: string
  note: string
  /** The day's date label, shown as context + the title placeholder. */
  dateLabel: string
  onClose: () => void
  onSave: (meta: { title: string; note: string }) => void
}) {
  const [t, setT] = useState(title)
  const [n, setN] = useState(note)

  // Re-seed the fields whenever the sheet opens for a (possibly different) day.
  useEffect(() => {
    if (open) { setT(title); setN(note) }
  }, [open, title, note])

  if (!open) return null

  return (
    <Sheet open={open} onClose={onClose} labelledBy="day-settings-title">
      <h2 id="day-settings-title" className="font-serif text-2xl">Edit day</h2>
      <p className="text-muted text-[13px] mt-1">{dateLabel}</p>

      <label className="block mt-4">
        <span className="block text-[12.5px] font-bold text-muted mb-1.5">Title</span>
        <input
          className={inputClass}
          value={t}
          onChange={e => setT(e.target.value)}
          placeholder={dateLabel || 'Day title'}
          maxLength={80}
        />
      </label>

      <label className="block mt-3">
        <span className="block text-[12.5px] font-bold text-muted mb-1.5">Note</span>
        <input
          className={inputClass}
          value={n}
          onChange={e => setN(e.target.value)}
          placeholder="e.g. slow morning, pack sunscreen"
          maxLength={280}
        />
      </label>

      <div className="mt-6 flex gap-2.5">
        <Button variant="soft" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button
          variant="claret"
          className="flex-1"
          onClick={() => { onSave({ title: t.trim(), note: n.trim() }); onClose() }}
        >
          Save
        </Button>
      </div>
    </Sheet>
  )
}
