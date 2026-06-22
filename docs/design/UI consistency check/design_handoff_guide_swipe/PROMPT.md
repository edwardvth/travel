# Claude Code prompt — Guide swipe-to-progress

Paste this to Claude Code from the repo root. Read `README.md` (same folder) before starting.

---

Implement **swipe-to-progress** on the Guide tab's focused stop card, Tinder-style.

`Guide Swipe.dc.html` in this folder is a **design reference prototype only**. The fastest way to see
it is to open **`Guide-Swipe-prototype-standalone.html`** in a browser and drag the card; the
`screens/` PNGs show the key states. The gesture physics is readable plain JS inside the logic class
of `Guide Swipe.dc.html`. Do **not** copy any of its markup. Recreate only the *gesture + motion* in our real stack (**React 18 + TypeScript + Tailwind + framer-motion**, `lucide-react`, CSS-variable tokens), wiring into the existing components.

## Scope — change exactly two files
- `src/trip/Guide.tsx` — the orchestrator. Replace the existing `focusedCard` flip (`AnimatePresence mode="wait"` with `rotateY`) with a draggable card + directional throw/enter. Add a "focus previous" handler for right-swipe.
- `src/trip/guide/CurrentStopCard.tsx` — only if the drag wrapper + hint overlays must live inside it. Prefer wrapping it from `Guide.tsx` so the card stays pure presentation. If you add hint overlays, add them as a sibling layer, not by editing the hero/body/actions.

## DO NOT TOUCH (locked — these already differ from the prototype)
The prototype **re-mocks** these; our real components are the source of truth. Do not restyle, replace, or "sync to the prototype":
- `ListenButton` / the Listen pill — the real one renders differently (speed control, waveform). Leave it exactly as is.
- `StoryTabs`, `GuideProgress` (segmented bar), `UpcomingRow`, `CompletedSection`, `DayNav`, the tab bar, the top header, hero image resolution/enrichment.
- The completion model: `currentStopIndex`, `dayStopRows`, `completedStops`, `toggleCompleted`, `onComplete`. Reuse them; don't fork them.
Swipe is an **enhancement layered on top** — the ✓ button, row taps, and keyboard must keep working unchanged.

## Behavior (locked)
- **Swipe LEFT = done + next.** Mark the focused stop complete and advance focus — i.e. call the existing `onComplete` (it already marks complete *and* advances to the next not-completed stop). The card is thrown **up-and-left**; the next card **rises from below**.
- **Swipe RIGHT = back.** Move focus to the previous stop with **no completion change** (`setFocusedStopIndex(stopIndex - 1)` + `userPickedRef.current = true`, mirroring `onFocusStop`). The card is thrown **down-and-right**; the previous card **drops from above**.
- Drag is **horizontal** (follows finger on X, slight `rotateZ`); the **exit is diagonal** (left→up, right→down). Incoming neighbor enters from the opposite side of the throw.
- **Directional hints** while dragging: claret "Done · Next" wash building on left-drag, neutral scrim "Back" on right-drag; opacity tracks drag distance, capped low when the direction is a no-op.
- **Trigger** on distance **OR** velocity (flick). Under threshold → rubber-band back, no-op.
- **Edges:** right-swipe on the first stop and left-swipe on the last stop → resist (~0.3 elastic) and spring back, no-op. The ✓ button still completes the last stop in place.
- **`prefers-reduced-motion`** (use `useReducedMotion()`): no tilt, collapse the throw to a ~140ms cross-fade / instant swap.

## Motion tokens (port verbatim, tune to taste)
```ts
const SWIPE = {
  thresholdPx: 92,         // commit if |offset.x| exceeds
  velocity: 0.5,           // px/ms; flick commits if |vx|>0.5 AND |dx|>36
  minFlickPx: 36,
  tiltDegPerPx: 0.05, maxTiltDeg: 8,
  edgeElastic: 0.3,        // resistance on a no-op direction (framer dragElastic)
  exit:  { left:  { x: -340, y: -230, rotate: -14, opacity: 0 },   // up-left
           right: { x:  340, y:  230, rotate:  14, opacity: 0 } }, // down-right
  enter: { afterLeft:  { y:  130, opacity: 0 },   // next rises from below
           afterRight: { y: -130, opacity: 0 } }, // prev drops from above
  throwMs: 340, enterMs: 320, enterDelayMs: 30,
  ease: [0.4, 0, 0.2, 1],
  spring: { type: 'spring', stiffness: 520, damping: 38 }, // under-threshold return
  reducedFadeMs: 140,
};
```

## Suggested framer-motion shape
- Keep the stable-keyed focused slot from `StopList`/`CompletedSection`. Inside it, an `AnimatePresence` keyed on `stopIndex` with a `custom` direction (`'left'|'right'`) so exit/enter variants pick the right axis.
- The visible card is a `motion.div` with `drag="x"`, `dragSnapToOrigin`, `dragElastic={edgeElastic}` (or 0 with manual resistance), `style={{ x, rotate }}` where `rotate = useTransform(x, v => clamp(v*0.05, -8, 8))`.
- `onDragEnd(_, info)`: derive direction from `info.offset.x`; commit if `Math.abs(offset.x) > thresholdPx || (Math.abs(info.velocity.x) > 500 && Math.abs(offset.x) > minFlickPx)`; guard edges; left→`onComplete()`, right→focus prev. Set the `AnimatePresence` `custom` direction before the key changes so the exit plays the right way.
- Hint overlays: two absolutely-positioned siblings with `opacity = useTransform(x, [-threshold,0,threshold], [1,0,...])`, `pointer-events:none`.
- Reduced motion: skip `rotate`/diagonal; exit/enter variants become opacity-only at `reducedFadeMs`.

## Acceptance
- Drag left commits via `onComplete` and the completed stop appears in `CompletedSection`; drag right steps focus back without un-completing.
- Threshold + flick both trigger; under-threshold springs back.
- Edges no-op with resistance; ✓ still completes the last stop.
- `ListenButton`, tabs, progress bar, rows, and all other Guide UI are byte-for-byte unchanged.
- Keyboard + screen-reader path (buttons/rows) unaffected; reduced-motion variant verified.
- Existing test suite stays green.
