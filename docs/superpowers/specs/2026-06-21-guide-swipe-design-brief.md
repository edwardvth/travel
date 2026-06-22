# Design brief — Guide swipe-to-progress (Tinder-style stop cards)

> **Paste everything below into a fresh Claude chat to prototype the interaction.**
> Attach the files listed under "Files to attach" so the prototype matches the
> real components and brand. The goal is an **interactive, on-brand prototype** I
> can feel on a phone, plus **documented motion tokens** (thresholds, distances,
> durations, easings, transforms) so the build can port the feel exactly.

---

## The product

**Voyager** is a premium travel-planning PWA. The **Guide** tab is a live "walking
companion" for the day you're on. It shows the day's stops as a vertical list:

```
┌ STOP 2 OF 5 ───────────────┐   ← progress header
▸ Completed (1)                  ← collapsible disclosure (collapsed by default)
┌───────────────────────────┐
│   [   hero photo        ] │   ← the FOCUSED stop = big "current stop card"
│   Gateway Arch            │
│   NOW · 480 m · 6 MIN  ◦  │     (live claret chip)
│   ♪ Listen                │
│   [Story][Facts][Experience]
│   [   Directions   ]  [✓] │
└───────────────────────────┘
  3 · City Museum      12 MIN    ← quiet upcoming rows (tappable)
  4 · Forest Park      20 MIN
```

- The day is a list. **Completed** stops live in a collapsed disclosure **above**
  the card; **upcoming** stops are quiet rows **below** it. The one **focused**
  stop renders as the big card inline where it sits in the list.
- "Current stop" = the first not-completed stop. You can also tap any row to
  focus/browse it non-linearly (completion is reversible).

## What we're adding

Make the focused card **swipeable, Tinder-style**, so progressing through stops
feels physical. **Locked decisions (do not change these):**

1. **Layout stays the inline list** — keep the Completed disclosure above and the
   upcoming rows below. Only the **focused hero card** becomes swipeable. (NOT a
   full-screen one-card deck.)
2. **Swipe LEFT = done + next.** Mark the focused stop **complete** and advance to
   the next stop. The card is **thrown up** (it's heading "up" into the Completed
   section, which sits above). The next stop's card comes in to take its place.
3. **Swipe RIGHT = back.** Move focus to the **previous** stop (no completion
   change — going back never un-completes anything). The card is **thrown down**
   (revealing the previous stop, which we're stepping back to).
4. The gesture is a **horizontal drag** (finger left/right, Tinder-style) but the
   **exit is vertical/diagonal**: left→up-and-away, right→down-and-away. The
   incoming card animates in from the opposite side it conceptually came from
   (after a left/up throw, the next card **rises from below**; after a
   right/down throw, the previous card **drops from above**).
5. The existing **✓ button = swipe-left** (done + next). Keep **Directions** and
   **✓** buttons — swipe is an *addition*, never the only way (accessibility).

### Feel to aim for (Tinder mechanics, vertical intent)

- While dragging: the card **follows the finger** on X, tilts slightly
  (rotateZ proportional to drag), and shows a soft directional hint — e.g. a
  faint claret "✓ Done" wash building on a left drag, a neutral "Back" wash on a
  right drag. Hint opacity scales with drag distance.
- **Release past the threshold** → the card flies off along its diagonal and the
  neighbor animates in. **Release under the threshold** → it springs back to
  center (rubber-band), nothing happens.
- A **flick** (high velocity, short distance) should also trigger — factor
  velocity into the threshold, not just displacement.
- Keep it **snappy and calm**, not bouncy/cartoonish. This is a premium editorial
  brand, not a game.
- **Edges:** swipe-right on the very first stop (nothing before it) and swipe-left
  on the last stop → rubber-band back, no-op. (On the last stop, the ✓ still
  completes it; design how "all done" reads, but you don't have to solve it here.)

## Brand & design tokens (match these exactly)

Dark-first. Theme via CSS variables (these are the real values):

**Dark (`:root`/`.dark`)**
```
--base:#0A0A0C;  --raised:#141417;  --overlay:#1B1B20;
--ink:#F4F3F0;   --muted:#8E8E96;
--hair:rgba(255,255,255,.10);  --hair-strong:rgba(255,255,255,.16);
--gold:#FFD9A8;  --sig:#9C3D3A;  --sig-btn:#B0473F;  --sig-link:#C56A60;   /* claret signature */
--fill:rgba(255,255,255,.06);  --fill-hover:rgba(255,255,255,.12);
--shadow-soft:0 1px 2px rgba(0,0,0,.4), 0 12px 40px -12px rgba(0,0,0,.7);
--shadow-lift:0 2px 6px rgba(0,0,0,.45), 0 30px 80px -28px rgba(0,0,0,.8);
```
**Light (`.light`)**
```
--base:#FAF8F5;  --raised:#FFFFFF;  --ink:#14141A;  --muted:#6A6A72;
--hair:rgba(20,20,26,.10);  --sig:#9C3D3A;  --sig-btn:#B0473F;  --sig-link:#8A2F2C;
```

**Fonts**
- Display / place names: **Fraunces** (serif), weight 500.
- Body / UI: **General Sans / Satoshi** (sans).
- Data / meta / chips: **JetBrains Mono** (uppercase, letter-spaced).

**Anti-slop rules (non-negotiable):**
- **lucide icons only** — no emoji. (The ✓ is `lucide-react`'s `Check`.)
- Token colors only (no hardcoded hex that breaks a theme); works in **dark + light**.
- a11y: ≥44px touch targets, `aria-*` on icon buttons, visible focus rings,
  keyboard operable (swipe is an enhancement on top of buttons/row taps).
- Honor **`prefers-reduced-motion`**: collapse the throw to a simple cross-fade /
  instant swap; no drag-tilt.

## The card anatomy (so the prototype card looks right)

The focused card (`CurrentStopCard.tsx`, attached) is a rounded `18px` `--raised`
panel with `--hair` border and `--shadow-lift`:
- **Hero** (160px) — photo (or a striped placeholder), with a top-left mono
  stop-number badge and a bottom-left claret pill chip: a pulsing dot + mono text
  `NOW · {dist} · {eta} · {heading}` (or `VISITED` once done).
- **Body** — Fraunces place name (~34px), a muted subtitle, a "Listen" pill, the
  Story / Interesting Facts / Experience tabs, then the actions row:
  `Directions` (claret filled, flex-1) + `✓` (44px square, outline → claret when done).

You can mock the hero with any placeholder image and keep tab/Listen content as
static stubs — the **swipe interaction + motion** is what matters.

## What to deliver back

1. **A single self-contained interactive prototype** (prefer one **React + TS**
   file using **framer-motion** — that's our stack — or a single HTML file if
   easier). Mobile-viewport. 4–5 fake stops. I should be able to drag the card
   left/right, see the throw + neighbor-in, and watch stops move into/out of the
   Completed disclosure. Include the reduced-motion variant.
2. **A short "motion tokens" block** I can copy into the real code, e.g.:
   - swipe trigger threshold (px) and velocity factor
   - drag tilt (deg per px, max deg), elastic/rubber-band amount
   - exit transform per direction (x, y, rotate, opacity) and travel distance
   - enter transform per direction (from-below / from-above offsets)
   - durations + easing curves (we use `cubic-bezier(0.4, 0, 0.2, 1)` ≈ 0.2–0.32s
     for card transitions; pick what feels right and tell me)
   - spring/return params for an under-threshold release
3. **Notes on anything you changed or recommend** (e.g., the directional hint
   treatment, how "all done" should read, whether right-swipe should be disabled
   at the first stop).

Keep our stack in mind so it ports cleanly: **React 18 + TypeScript + Tailwind +
framer-motion**, `lucide-react` icons, CSS-variable token theming.

---

## Files to attach (from the repo, for accurate structure/props)

Attach these so the prototype mirrors the real components (paths are in
`C:\Users\edwar\travel\app\src\`):

- `trip/guide/CurrentStopCard.tsx` — the card being swiped (full anatomy + classes).
- `trip/guide/StopList.tsx` — the active/upcoming list; renders the focused card
  in a stable-keyed slot.
- `trip/guide/CompletedSection.tsx` — the collapsible Completed disclosure (above).
- `trip/guide/UpcomingRow.tsx` — the quiet collapsed row style.
- `trip/guide/guide-helpers.ts` — `currentStopIndex`, `dayStopRows`,
  `completedStops` (the focus/progress model the swipe drives).
- `trip/Guide.tsx` — the orchestrator: focus state (`focusedStopIndex`,
  `userPickedRef`), `onComplete` (current swipe-left equivalent), the existing
  AnimatePresence flip we're replacing, and how the card slot is wired into the
  list. **This is the file the new interaction has to slot into.**

(Optional, only if you want the broader screen context:) `trip/guide/GuideProgress.tsx`,
`src/index.css` (token + keyframe definitions).

> When you bring the prototype back, I'll port the motion tokens into `Guide.tsx`
> + `CurrentStopCard.tsx`, wire the drag to the real `onComplete` / focus model,
> add keyboard + reduced-motion parity, and keep the test suite green.
