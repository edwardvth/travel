/**
 * The quiet next-stop row from the Premium Modern reference: a small numbered
 * circle, the stop name, and a right-aligned mono meta (e.g. an ETA "12 MIN").
 * Deliberately understated — the current stop is the hero; what's next stays
 * peripheral. Pure presentation.
 */
export function UpcomingRow({
  index,
  name,
  meta,
}: {
  index: number
  name: string
  meta: string
}) {
  return (
    <div className="flex items-center gap-[11px] pt-[11px] px-0.5">
      <span
        className="flex-none grid place-items-center w-[19px] h-[19px] rounded-full border border-ink/20 text-muted font-mono text-[10px]"
        aria-hidden="true"
      >
        {index}
      </span>
      <span className="min-w-0 truncate text-[14px] text-ink/80">{name}</span>
      {meta && <span className="ml-auto flex-none font-mono text-[10.5px] text-muted">{meta}</span>}
    </div>
  )
}

export default UpcomingRow
