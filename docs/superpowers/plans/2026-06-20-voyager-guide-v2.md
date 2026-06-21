# Guide v2 — UX + Content Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD where there's logic; commit per task; verify each task with `cd app && npm test && npx tsc -b && npm run build`. Co-Authored-By: Claude Opus 4.8 (1M context) trailer on every commit. Branch `voyager-redesign`. Fidelity reference for any UI: `docs/design/Guide - Premium Modern.html`.

**Goal:** Turn Guide from a linear wizard into a living, browsable, content-rich companion: real-amplitude narration + speed control, full day navigation, non-linear stop browsing with reversible completion, fixed/relabelled content tabs, aggressive Wikipedia-first enrichment + hero images, and a narration-cache fix.

**Hard constraint:** NO new paid deps / API keys / quota services (no Google Places). Wikipedia (free REST APIs) + the existing landmark/photo + `ai-proxy` pipelines only. If a step would need a paid provider, skip it and fall through.

**Resolved decisions:**
- §2 speed: **local-only** (localStorage per device), applies to ElevenLabs `audio.playbackRate` AND Web-Speech `utterance.rate`.
- §4 Add Day: **confirm dialog → create empty day → navigate to the Plan page** (`/trip/:id` index).

**Known limitation (documented):** real-amplitude animation (§1) works for ElevenLabs audio via Web Audio `AnalyserNode`; the Web-Speech fallback exposes no audio stream, so that path keeps a subtle synthetic "speaking" motion.

**Existing Guide files:** `app/src/trip/Guide.tsx` (orchestrator) + `app/src/trip/guide/{GuideProgress,CurrentStopCard,StoryTabs,ListenButton,UpcomingRow,ArrivingBanner,ArrivalView,geo,arrival,maps,guide-helpers,narrate,voices}`. Content: `app/src/trip/{enrich,landmark,landmark-context,richtext,photo,helpers,itinerary-helpers}.ts`. Settings: `app/src/data/useAccountSettings.ts`.

---

## Group A — Narration: real-amplitude animation + speed control (§1, §2)

**A1 — Speed store + toggle (local-only).**
- Files: create `app/src/trip/guide/useNarrationSpeed.ts` (+ test) — a hook over `localStorage['voyager:narrationSpeed']`, pure helpers `nextSpeed(s)` (cycle `0.75→1→1.25→1.5→1.75→2→0.75`, default `1`), `parseSpeed`/`SPEEDS`. Create `app/src/trip/guide/SpeedToggle.tsx` — a small pill button beside Listen showing e.g. `1×`, advancing on tap.
- TDD `nextSpeed`/`parseSpeed` (exact cycle, default 1, clamp unknown→1).

**A2 — Real-amplitude equalizer in `ListenButton`.**
- Modify `ListenButton.tsx`: when playing ElevenLabs audio, build an `AudioContext` + `MediaElementAudioSourceNode(audio)` + `AnalyserNode` (fftSize 64), read `getByteFrequencyData` on a rAF loop, map a handful of bins → bar `scaleY` (subtle, premium; clamp 0.2–1). Pause → freeze bars; stop/idle → bars return to a low idle. Tear down the AudioContext + rAF on stop/unmount. For the Web-Speech path (no stream) keep the existing `vyEq` synthetic motion. Respect `prefers-reduced-motion` (skip rAF, show static bars).
- Wire `SpeedToggle` next to Listen; apply speed to `audio.playbackRate` and pass `rate` to `speakFallback` (extend `speakFallback(text, rate=1)` in `narrate.ts` + its test).
- Acceptance: bars visibly track the voice for ElevenLabs; pause freezes; speed cycles + persists across reload; suite green.

---

## Group B — Day navigation (§4)

**B1 — `DayNav` component.** Create `app/src/trip/guide/DayNav.tsx` (+ test for the pure neighbor/boundary logic, extracted to `guide-helpers.ts` as `dayNavModel(dayIndex, dayCount, dayLabels)` → `{ prevLabel|null, activeLabel, nextLabel|null, atStart, atEnd }`).
- Header: `‹  Aug 5  ›` using lucide `ChevronLeft`/`ChevronRight` (NOT text glyphs). Faded neighbor labels on each side (wheel-picker feel).
- At boundaries replace the missing neighbor with an **Add Day** affordance (`[Add Day]  Aug 5  Aug 6` / `Aug 8  Aug 9  [Add Day]`).
- Tapping the active date opens a lightweight week/calendar popover listing the trip's days (jump to any). Build with existing `Sheet`/popover + tokens; lucide `CalendarDays`.

**B2 — Wire DayNav into the orchestrator.** Replace the static day label (currently in `GuideProgress`/`Guide.tsx`) with `DayNav`. `onPrev`/`onNext` change the focused day (local Guide state, seeded from `activeDayIndex`); `onPickDay(i)` jumps. **Add Day** → `ConfirmDialog` ("Add {nextDate} to this trip?") → on confirm, append an empty day immutably (extend `config.numDays`, `config.dayLabels`, `config.dayTitles`, `data.days`) via `save` (reuse `applyTripBasics`/day helpers if cleaner), then `navigate('/trip/' + trip.id)` (Plan). Edit-gated by `canEdit`.
- Acceptance: can move across all days; boundaries show Add Day; date tap opens the picker; Add Day confirms → creates → lands on Plan; suite green.

---

## Group C — Non-linear browsing + reversible completion (§3, §9)

**C1 — Full-day stop list with focus + expand/collapse.** Modify `Guide.tsx` + add `app/src/trip/guide/StopList.tsx` (or extend the existing rows):
- Render **all** stops for the focused day: **completed** (completed styling — muted + ✓ — reopenable), **current** (expanded `CurrentStopCard`), **upcoming** (ALL remaining, collapsed rows that expand on tap into the same card content).
- A `focusedStopIndex` (local state) defaults to `currentStopIndex(...)`; tapping any row focuses+expands it (read its story/Directions/Listen). "Current" is still the first-incomplete, but focus is free.
- Reuse `UpcomingRow` for collapsed rows; expanding renders the `CurrentStopCard` body for that stop.

**C2 — Reversible completion.** 
- `toggleCompleted` already toggles both ways — surface an **un-complete** action on completed stops (✓ → tap to undo). Marking/un-marking recomputes progress immediately (derived from `data.completed`, already reactive). Allow focusing a previous stop to make it "current" (focus handles this).
- Acceptance: complete + un-complete both work; completed stops remain open/viewable; progress updates instantly; never forward-only; suite green.

---

## Group D — Content rendering + tab labels (§5, §6)

**D1 — Fix Story raw-HTML rendering.** Investigate where Story shows literal `<p></p>`. Add `app/src/trip/richtext.ts` helper `renderProse(text)` (or extend `formatInline`) that: strips/normalizes block tags (`<p>`, `<br>`, `</p>`→`\n\n`), keeps safe inline emphasis, and splits paragraphs — so both AI plain-text AND Wikipedia HTML extracts (Group E) render cleanly. Use it in `StoryTabs`/`CurrentStopCard`/`ArrivalView` for all three tab bodies. TDD `renderProse` (strips `<p>`, preserves text, paragraphs).

**D2 — Relabel tabs.** In `StoryTabs.tsx`, change the **middle tab label** "Notice" → **"Interesting Facts"** (keep the data key `notice` and the prop name `notice`; label only). Story + Experience unchanged. Adjust spacing if the longer label needs it. Update the enrich prompt (Group E) so the three fields answer: Story=why it matters, Interesting Facts=trivia/dates/architecture, Experience=how to experience it.

---

## Group E — Aggressive enrichment + hero images (§7, §8)

**E1 — Wikipedia content source (free REST).** Create `app/src/trip/wiki.ts` (+ test): `wikiSummaryUrl(query)` → REST `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=1&prop=extracts&exintro&explaintext&...&origin=*` (or the `page/summary` REST endpoint), `parseWikiExtract(json)` → plain-text extract or null. Always query **Name + Destination** (reuse `stopHeroQuery`). Pure URL+parse, fetch wrapper never throws → null.

**E2 — Layered enrichment in `enrich.ts`.** Update `generateStopDetail` to a priority chain: (1) Wikipedia extract for Story/context; (2) existing place metadata already on the stop (type, address, locality, coords, cached landmark, photo meta) folded into the prompt; (3) **AI synthesis** (existing `ai-proxy`) to produce Story / Interesting Facts (`notice`) / Experience (`tips`) from whatever context exists — explicitly instruct "use ONLY the provided facts; if unknown, leave blank; do NOT invent." (4) Final fallback: empty section, no hallucination. Keep returning `{ history, facts, notice, tips }`. Update the prompt per Group D's tab semantics. Update tests.

**E3 — Robust hero image.** The hero already does `coverPhoto(stop) ?? useLandmarkImage(stopHeroQuery(name, destination))`. Strengthen `landmark.ts`/the query: ensure Name+Destination is always used; add a second attempt with a simplified query (drop trailing words / try Name+City only) before the placeholder. No new providers. Update `useLandmarkImage`/`landmark-context` as needed + tests. Acceptance: recognizable attractions resolve a real image; placeholder only when truly nothing.

---

## Group F — Narration cache fix (function redeploy by operator)

**F1 — Service-role key in `narrate`.** The `narration` bucket exists but repeats still `X-Cache: MISS` → the function isn't reading the service-role key. Update `supabase/functions/narrate/index.ts` to resolve the key defensively: `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')`, and if Storage GET/PUT returns non-2xx, log the status (so failures are visible) — keep them non-fatal. Commit. **Operator step:** redeploy the function (slug `hyper-function`) and re-test: a repeat synth must return `X-Cache: HIT`. (Flag to user; not auto-run.)

---

## Sequencing & review
Build groups **A → B → C → D → E → F**. Each group: implementer subagent (opus) → independent spec+quality review → fix loop → push. Verify `cd app && npm test && npx tsc -b && npm run build` per task. Update `handoff.md` at the end; redeploy frontend after the UI groups land (flag to user before deploy).

## Out of scope (locked, unchanged from Guide v1)
No embedded map; narration never auto-plays (speed/playback are user-initiated); soft arrival; ambient discovery deferred; no paid providers.
