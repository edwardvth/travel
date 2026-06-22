/**
 * Swipe-to-progress motion tokens + the pure commit decision for the Guide
 * focused-stop card (a Tinder-style draggable). Ported from the approved design
 * prototype (`docs/design/UI consistency check/design_handoff_guide_swipe`).
 *
 * Behaviour the tokens drive: swipe LEFT = mark done + advance (card thrown
 * up-and-left, next stop rises from below); swipe RIGHT = step back to the
 * previous stop (thrown down-and-right, previous drops from above). The gesture
 * is horizontal; the throw is diagonal. Kept here (framework-free) so the commit
 * maths is unit-tested without mounting the component.
 */
export const SWIPE = {
  thresholdPx: 92, // commit if |offset.x| exceeds this
  velocityPxPerS: 500, // flick commits if |vx| > 500 px/s AND …
  minFlickPx: 36, // … |offset.x| exceeds this
  tiltDegPerPx: 0.05,
  maxTiltDeg: 8,
  enterY: 220, // incoming-from-above offset (swipe-back / prev drops from the top)
  // The forward "deck" peek: the next stop's card sits behind the focused one,
  // slightly smaller and dropped down. It's HIDDEN at rest (opacity 0) and only
  // fades/comes forward (scale→1, lift→0, opacity→1) as you drag left, so it
  // never shows beneath the card until you start swiping.
  peek: { scale: 0.95, y: 20 } as const,
  // The back peek (mirror): the previous stop descends from the top and
  // exponentially fades in as you drag right. Hidden at rest.
  prevPeek: { fromY: -110, opacity: 0.95 } as const,
  exit: {
    left: { x: -340, y: -230, rotate: -14, opacity: 0 }, // up-left
    right: { x: 340, y: 230, rotate: 14, opacity: 0 }, // down-right
  },
  throwSec: 0.34,
  enterSec: 0.32,
  enterDelaySec: 0.03,
  ease: [0.4, 0, 0.2, 1] as const,
  // Decelerating ease for the incoming card settling to the front of the deck.
  enterEase: [0.22, 1, 0.36, 1] as const,
  spring: { type: 'spring' as const, stiffness: 520, damping: 38 },
  reducedFadeSec: 0.14,
} as const

/** Where the incoming focused card animates in from, by transition cause. */
export type EnterFrom = 'none' | 'fade' | 'below' | 'above'

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Decide what a drag release commits to. Direction is the sign of the horizontal
 * offset; it commits when the drag passes the distance threshold OR is a flick
 * (fast enough AND moved a minimum distance). A swipe toward a disabled edge
 * (`leftNoop` past the last stop, `rightNoop` at the first) never commits.
 * Returns the committed direction, or null to spring back. Pure.
 */
export function swipeCommit(
  offsetX: number,
  velocityX: number,
  edges: { leftNoop: boolean; rightNoop: boolean },
): 'left' | 'right' | null {
  if (offsetX === 0) return null
  const dir = offsetX < 0 ? 'left' : 'right'
  const noop = (dir === 'left' && edges.leftNoop) || (dir === 'right' && edges.rightNoop)
  if (noop) return null
  const pass =
    Math.abs(offsetX) > SWIPE.thresholdPx ||
    (Math.abs(velocityX) > SWIPE.velocityPxPerS && Math.abs(offsetX) > SWIPE.minFlickPx)
  return pass ? dir : null
}
