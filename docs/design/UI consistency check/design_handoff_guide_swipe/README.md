# Handoff: Guide swipe-to-progress (Tinder-style stop cards)

## Overview
Adds a swipeable focused stop card to the **Guide** tab (the live walking companion). Swiping the
hero card **left** marks the current stop done and advances to the next; swiping **right** steps
focus back to the previous stop. The drag is horizontal (Tinder-style) with a diagonal throw:
left→up, right→down. The inline list layout is unchanged — Completed disclosure above, the focused
card in the middle, upcoming rows below.

## About the design files
`Guide Swipe.dc.html` in this bundle is a **design reference created in HTML** — a prototype that
demonstrates the intended gesture, motion, and feel, with the drag physics already worked out. It is
**not** production code and its markup must **not** be copied.

The task is to **recreate only the gesture + motion** inside the existing app environment
(**React 18 + TypeScript + Tailwind + framer-motion**, `lucide-react`, CSS-variable token theming),
wiring it into the real components — **not** to ship the HTML.

> ⚠️ **Critical:** the prototype *re-mocks* several surrounding components (the Listen pill, story
> tabs, the segmented progress bar, the rows, the header and tab bar) purely so the screen reads as a
> whole. Those mocks **differ from the real components** — most visibly the **Listen** control, which
> in the real app has a speed control and waveform. **Do not** sync any of those to the prototype.
> The real components are the source of truth; the swipe layers on top of them.

## Fidelity
**High-fidelity** for the *interaction and motion* (exact thresholds, transforms, easings, durations
are specified below and in `PROMPT.md`). The surrounding **visual UI is already built** in the repo —
reuse it as-is. Treat the prototype's chrome (header / day strip / tab bar / Listen / tabs / progress)
as throwaway scaffolding for context only.

## Files to change (exactly two)
- `src/trip/Guide.tsx` — orchestrator. Replace the current `focusedCard` flip
  (`AnimatePresence mode="wait"` with a `rotateY` flip) with a draggable card + directional
  throw/enter. Add a "focus previous" handler for right-swipe.
- `src/trip/guide/CurrentStopCard.tsx` — touch **only** if the drag wrapper / hint overlays must live
  inside it. Prefer wrapping it from `Guide.tsx` so the card stays pure presentation. If overlays are
  added, add them as a sibling layer; do not edit the hero, body, Listen, tabs, or actions.

## Do NOT touch
`ListenButton`, `StoryTabs`, `GuideProgress`, `UpcomingRow`, `CompletedSection`, `StopList`, `DayNav`,
hero image resolution/enrichment, and the completion model helpers (`currentStopIndex`, `dayStopRows`,
`completedStops`, `toggleCompleted`). Reuse them; do not fork or restyle them.

## Interaction & behavior

**Swipe LEFT = done + next**
- Marks the focused stop complete and advances focus. Use the **existing** `onComplete` from
  `Guide.tsx` — it already pushes `${dayIndex}-${stopIndex}` into `completed` *and* advances focus to
  the next not-completed stop (and flags the scroll-to-top). Do not reimplement that logic.
- The card is thrown **up-and-left**; the next stop's card **rises from below**.

**Swipe RIGHT = back**
- Moves focus to the previous stop with **no completion change**. Mirror `onFocusStop`:
  `userPickedRef.current = true; setFocusedStopIndex(stopIndex - 1); setActiveTab('story')`.
- The card is thrown **down-and-right**; the previous stop's card **drops from above**.

**Drag feel**
- Card follows the finger on X and tilts (`rotateZ`, `0.05°/px`, clamped `±8°`). Exit is diagonal
  (left→up, right→down); the incoming neighbor enters from the opposite side of the throw.
- Directional hints while dragging: a claret **"Done · Next"** wash building on left-drag, a neutral
  scrim **"Back"** on right-drag. Hint opacity scales with drag distance, capped (~0.42×) when the
  direction is a no-op at an edge.
- **Release past threshold OR a flick** (velocity) commits; **under threshold** rubber-bands back to
  center (nothing happens).

**Edges**
- Right-swipe on the **first** stop and left-swipe on the **last** stop resist (~0.3 elastic) and
  spring back — no-op. The ✓ button still completes the last stop in place (it becomes `VISITED`;
  design how "all done" reads — the Guide already has an all-complete state).

**Accessibility / parity**
- Swipe is an **enhancement only**. The existing ✓ button (it already calls `onComplete`), the row
  taps (`onFocusStop`), keyboard operation, focus rings, and `aria-*` must all keep working unchanged.
- Honor `prefers-reduced-motion` via `useReducedMotion()`: no tilt, collapse the throw to a ~140ms
  cross-fade / instant swap.

## Motion tokens (port verbatim, tune to taste)
| Token | Value | Notes |
|---|---|---|
| swipe threshold | **92 px** | commit if `|offset.x|` exceeds |
| velocity trigger | **0.5 px/ms** (≈500 px/s) | flick commits if `|vx|>0.5` **and** `|dx|>36 px` |
| min flick distance | **36 px** | |
| drag tilt | **0.05 deg/px**, clamp **±8°** | `rotate = useTransform(x, v => clamp(v*0.05, -8, 8))` |
| edge elastic | **0.3** | resistance on a no-op direction (framer `dragElastic`) |
| exit LEFT | `x:-340, y:-230, rotate:-14, opacity:0` | up-left |
| exit RIGHT | `x:+340, y:+230, rotate:+14, opacity:0` | down-right |
| enter after LEFT | from `y:+130, opacity:0` | next rises from below |
| enter after RIGHT | from `y:-130, opacity:0` | prev drops from above |
| throw / enter duration | **340 ms / 320 ms** (enter delay **30 ms**) | ease `cubic-bezier(0.4, 0, 0.2, 1)` |
| under-threshold return | spring `stiffness:520, damping:38` (≈460 ms settle) | `dragSnapToOrigin` also fine |
| reduced motion | no tilt, **140 ms** cross-fade | |

## State management
No new global/server state. Drives the **existing** focus/progress model:
- `focusedStopIndex` (+ `userPickedRef`) — set by right-swipe (back) exactly as a manual row pick.
- `completed` (via `onComplete` / `toggleCompleted`) — set by left-swipe and the ✓ button.
- Local-only: a framer `useMotionValue` `x` for the drag, and an `AnimatePresence` `custom` direction
  (`'left'|'right'`) so the keyed slot plays the correct exit/enter variant.
- Keep the stable slot keys in `StopList` / `CompletedSection` (`key="focused-card"`) so the throw
  animates instead of remounting.

## Design tokens (already in `src/index.css` — use the CSS variables, not hardcoded hex)
Dark (`:root`/`.dark`): `--base #0A0A0C`, `--raised #141417`, `--ink #F4F3F0`, `--muted #8E8E96`,
`--hair rgba(255,255,255,.10)`, `--sig #9C3D3A`, `--sig-btn #B0473F`, `--sig-link #C56A60`.
Light (`.light`): `--base #FAF8F5`, `--raised #FFFFFF`, `--ink #14141A`, `--sig-link #8A2F2C`.
The claret hint wash and the chip use `--sig`/`--sig-btn`; must work in dark **and** light.

## Assets
None new. Icons are `lucide-react` (the ✓ is `Check`). Hero photos come from the existing
`useHeroImage` chain → striped placeholder; the prototype's gradient placeholders are stand-ins only.

## How to view the prototype
- **`Guide-Swipe-prototype-standalone.html`** — open this in any browser (double-click; works
  offline). It's the full interactive prototype: **drag the focused card left/right**, watch the
  throw + neighbour-in, toggle **Reduced motion**, and **Reset**. This is the fastest way to *feel*
  the interaction. (Body font falls back to system sans offline; that's cosmetic only.)
- **`screens/`** — static reference shots of the key states (see below).
- **`Guide Swipe.dc.html`** — the original source. The **gesture physics is plain, readable
  JavaScript** in its `<script data-dc-script>` logic class (`onPointerDown/Move/Up`, `commit`,
  `springBack`, and the `T = {…}` motion-token table) — read it directly for the exact maths; do not
  copy its markup.

## Screens (in `screens/`)
- `01-default.png` — full screen at "STOP 3 OF 12": segmented progress, the "2 stops complete · …"
  disclosure (open), completed rows, and the focused **Rembrandt Square** card. Shows the real
  surrounding UI the swipe must not disturb (note the Listen pill, tabs, rows).
- `02-swipe-left-done.png` — mid left-drag: card tilts left, the claret **"Done · Next"** hint wash
  builds (fill shown solid for capture; in-app it ramps with drag distance). Commit → throw up-left,
  next rises from below.
- `03-swipe-right-back.png` — mid right-drag: card tilts right, neutral **"Back"** scrim. Commit →
  throw down-right, previous drops from above.

## Files in this bundle
- `Guide-Swipe-prototype-standalone.html` — **runnable** self-contained prototype (open in a browser).
- `Guide Swipe.dc.html` — original source; gesture logic is readable plain JS (see above).
- `screens/*.png` — static state references.
- `PROMPT.md` — a ready-to-paste implementation prompt for Claude Code.
- `README.md` — this document (self-sufficient; implementable without the original conversation).

## Acceptance checklist
- [ ] Left commits via the existing `onComplete`; the stop appears in `CompletedSection`.
- [ ] Right steps focus back without un-completing anything.
- [ ] Distance **and** flick both trigger; under-threshold springs back.
- [ ] Edges no-op with resistance; ✓ still completes the last stop.
- [ ] `ListenButton`, `StoryTabs`, `GuideProgress`, rows, header, tab bar — all unchanged.
- [ ] Keyboard + screen-reader path unaffected; reduced-motion variant verified.
- [ ] Existing test suite stays green.
