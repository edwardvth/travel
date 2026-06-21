/**
 * Small pill button that shows the current narration speed (e.g. `1×`, `1.25×`)
 * and advances through the cycle on tap. Local-only preference — the parent
 * owns the value via `useNarrationSpeed` and passes it down.
 *
 * Anti-slop: token classes (light + dark), ≥44px hit area, labelled for screen
 * readers, focus ring. No layout shift on hover (color/opacity only).
 */
export function SpeedToggle({ speed, onCycle }: { speed: number; onCycle: () => void }) {
  // Trim a trailing `.00`/`.0` so 1 → "1×" while 1.25 stays "1.25×".
  const label = `${Number(speed.toFixed(2))}×`
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`Narration speed, currently ${speed}x`}
      className="flex-none grid place-items-center min-w-[44px] min-h-[44px] px-2.5 cursor-pointer select-none rounded-full font-mono text-[11px] font-semibold text-muted hover:text-ink hover:bg-fill-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link focus-visible:ring-offset-2 focus-visible:ring-offset-base"
    >
      <span aria-hidden="true">{label}</span>
    </button>
  )
}

export default SpeedToggle
