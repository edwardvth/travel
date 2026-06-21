import { Check } from 'lucide-react'

/**
 * A quiet collapsed stop row from the Premium Modern reference: a small numbered
 * circle (or a ✓ when `done`), the stop name, and a right-aligned mono meta
 * (e.g. an ETA "12 MIN"). Deliberately understated — the focused stop is the
 * hero; the rest stay peripheral.
 *
 * Now interactive: tapping the row focuses+expands the stop (`onClick`). A
 * completed row reads muted with a ✓ and, when `onToggleComplete` is provided
 * (edit-gated), that ✓ becomes its own tap-to-undo button ("Mark not complete").
 *
 * To keep the markup valid (no button-in-button) the row is a `<button>` only
 * when there is no nested ✓ control; when there is, the row is a plain row whose
 * name is the focus button and whose ✓ is the un-complete button — two siblings.
 * Pure presentation — the parent owns the state.
 */
export function UpcomingRow({
  index,
  name,
  meta,
  done = false,
  onClick,
  onToggleComplete,
}: {
  index: number
  name: string
  meta: string
  done?: boolean
  onClick?: () => void
  onToggleComplete?: () => void
}) {
  const checkMarker = (
    <span className="grid place-items-center w-[19px] h-[19px] rounded-full border border-sig/30 bg-sig/[0.08] text-sig">
      <Check size={11} strokeWidth={2.5} aria-hidden="true" />
    </span>
  )
  const numberMarker = (
    <span
      className="grid place-items-center w-[19px] h-[19px] rounded-full border border-ink/20 text-muted font-mono text-[10px]"
      aria-hidden="true"
    >
      {index}
    </span>
  )

  const label = (
    <span className={'min-w-0 truncate text-[14px] ' + (done ? 'text-muted line-through decoration-hair' : 'text-ink/80')}>
      {name}
    </span>
  )
  const metaEl = meta ? <span className="ml-auto flex-none font-mono text-[10.5px] text-muted">{meta}</span> : null

  // Completed + reversible: the ✓ is its own button, so the row can't itself be a
  // button (no nesting). The name area carries the focus/expand tap instead.
  if (done && onToggleComplete) {
    return (
      <div className="flex items-center gap-[11px] pt-[11px] px-0.5">
        <button
          type="button"
          onClick={onToggleComplete}
          aria-label={`Mark ${name} not complete`}
          aria-pressed={true}
          className="flex-none rounded-full cursor-pointer transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          {checkMarker}
        </button>
        <button
          type="button"
          onClick={onClick}
          aria-label={`Open ${name}`}
          disabled={!onClick}
          className="flex min-w-0 flex-1 items-center gap-[11px] py-[2px] text-left rounded-md cursor-pointer transition-colors hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link disabled:cursor-default disabled:hover:bg-transparent"
        >
          {label}
          {metaEl}
        </button>
      </div>
    )
  }

  const inner = (
    <>
      {done ? checkMarker : numberMarker}
      {label}
      {metaEl}
    </>
  )

  if (!onClick) {
    return <div className="flex items-center gap-[11px] pt-[11px] px-0.5">{inner}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${name}`}
      className="flex w-full items-center gap-[11px] pt-[11px] pb-[2px] px-0.5 text-left rounded-md cursor-pointer transition-colors hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
    >
      {inner}
    </button>
  )
}

export default UpcomingRow
