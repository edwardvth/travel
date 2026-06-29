/**
 * Bento placement on the lg+ 4-column board. A trip "block" is a 4×2 region:
 * one 2×2 feature, one 2×1 wide, two 1×1 cells — a repeating editorial rhythm.
 * With one or two cells each takes a tall 2×2 half so the board never looks
 * lopsided. Below lg the grid is plain (1→2 cols) and these classes are inert.
 */
export function spanClass(i: number, n: number): string {
  if (n <= 2) return 'lg:col-span-2 lg:row-span-2'
  const m = i % 4
  if (m === 0) return 'lg:col-span-2 lg:row-span-2'
  if (m === 1) return 'lg:col-span-2 lg:row-span-1'
  return 'lg:col-span-1 lg:row-span-1'
}

/** True when cell `i` is the big 2×2 feature (gets the larger tile variant). */
export function isFeature(i: number, n: number): boolean {
  return n <= 2 || i % 4 === 0
}
