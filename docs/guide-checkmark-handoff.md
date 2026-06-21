# Handoff — Guide checkmark → advance glitch (race with realtime)

> **For a fresh chat.** Self-contained brief: the symptom, the full code path, the root-cause analysis, the proposed fix plan, and the constraints. Read `CLAUDE.md` + `handoff.md` first for project conventions. Branch: **`voyager-redesign`** (local `C:\Users\edwar\travel`, app in `app/`, live https://voyager.edwardvth.workers.dev via `npx wrangler deploy`).

## What we're building

The **Guide** tab is a live "living itinerary" companion (Plan/Guide/Trip shell). On the focused/current stop card there's a **✓ checkmark** that marks the stop complete. Desired behavior when you complete the **current** stop:
1. Mark it done (it drops into the collapsed "Completed Stops" section).
2. **Auto-advance** focus to the next not-completed stop and open its card.
3. **Snap-scroll** that next card to the top of the viewport.
Completion must be **reversible** (tap ✓ again to un-complete), and browsing must stay non-linear (any stop reopenable).

## The symptom (bug to fix)

Completing a stop is **jittery/laggy and sometimes wrong**:
- Tap ✓ → the old card lingers a beat → then jumps to the next card.
- **Occasionally it advances to the next stop, then snaps *back* to the previous stop** (or jumps to the wrong index, e.g. "jumped to 4 and back").
- Worse when **clicking quickly** (completing several stops in a row).

User's (correct) hypothesis: a fast click "pulls wrong information" — a stale read races the local edit.

## Root-cause analysis (traced end-to-end)

**Completion is already optimistic + local-first** — that is NOT the problem:
- `app/src/trip/guide/CurrentStopCard.tsx` ✓ button → `onComplete` (orchestrator).
- `app/src/trip/Guide.tsx` `onComplete` → `onToggleCompleteAt(stopIndex)` → `save({ data: { ...trip.data, completed: toggleCompleted(...) } })`.
- `app/src/trip/useSaveTrip.ts` `save()` (line ~150): **synchronously** `qc.setQueryData(tripKey, merged)` (optimistic local cache) + stamps `data.savedAt`, then **debounced 800ms** (`DEBOUNCE_MS`) Supabase `upsert`. So the UI's `trip.data.completed` updates immediately.

**The clobber — `app/src/trip/useTrip.ts` lines 66–77 (THE ROOT CAUSE):**
```ts
.on('postgres_changes', { event: '*', table: 'trips', filter: 'id=eq.'+tripId },
   () => { qc.invalidateQueries({ queryKey: tripKey(tripId) }) })  // blind refetch
```
- Supabase Realtime echoes the client's **own** writes back. Every autosave → this fires → `invalidateQueries` → **full refetch from the server**, replacing the cache (including `completed`) with the server row.
- When the user has made **newer optimistic edits** than the last committed upsert (fast clicking, or the in-flight debounce window), the refetched server row is **stale** → it **reverts `completed`** to an older value.
- The `savedAt` field (meant for "realtime peers resolve last-write-wins") is **never compared** here — the handler blindly refetches. So there is no actual last-write-wins protection.

**Why focus jumps (amplifier) — `Guide.tsx`:**
- `currentIndex = currentStopIndex(dayIndex, stopNames, data?.completed)` (derived from `completed`).
- Seeding effect (~line 128): `useEffect(() => { if (userPickedRef.current) return; setFocusedStopIndex(currentIndex...) }, [dayIndex, currentIndex])` — re-seeds focus whenever `currentIndex` changes and the user hasn't manually picked.
- So when the realtime refetch **reverts `completed`**, `currentIndex` changes → the seeding effect **moves focus backward** → the visible "jump back." (We already added a guard so `onComplete` only advances when completing the current stop and only forward, and made the scroll instant — that reduced but did not eliminate it, because the upstream data revert still happens.)

## Files involved (exact)

- `app/src/trip/useTrip.ts` — realtime subscription (**fix here**), trip fetch, `tripKey`.
- `app/src/trip/useSaveTrip.ts` — optimistic cache write + `savedAt` stamp + debounced upsert.
- `app/src/trip/Guide.tsx` — `onComplete` (~275), `onToggleCompleteAt` (~260), seeding effect (~128), `currentIndex` (~101), `focusedStopIndex`/`userPickedRef`, scroll effect.
- `app/src/trip/itinerary-helpers.ts` — `toggleCompleted` (immutable). `app/src/trip/helpers.ts` — `completedKey`/`isCompleted`. `app/src/trip/guide/guide-helpers.ts` — `currentStopIndex`.
- `app/src/trip/PlannerLayout.tsx` — wires `save`/`canEdit`/`activeDay` into `PlannerOutletContext`.

## Proposed fix plan (solve it correctly)

**1. Make realtime non-clobbering — real last-write-wins (primary fix, `useTrip.ts`).**
Replace the blind `invalidateQueries` with a handler that uses the realtime **`payload.new`** row and applies it to the cache **only if it is newer** than the local cache, comparing `data.savedAt` (ISO string):
- Extract a **pure, unit-tested** helper, e.g. `mergeRealtimeTrip(local: Trip | undefined, incoming: Trip): Trip` → returns `incoming` only when `incoming.data.savedAt > local.data.savedAt` (string/Date compare), else keeps `local`. This makes the client ignore echoes of its own/older writes (their `savedAt` ≤ the optimistic cache's), while still applying genuinely newer edits from other devices.
- In the handler: `qc.setQueryData(tripKey, prev => mergeRealtimeTrip(prev, payload.new as Trip))`. Handle DELETE (`payload.eventType === 'DELETE'`) and missing/equal `savedAt` defensively (ignore). Keep a fallback `invalidate` only when `payload.new` lacks `data` (shouldn't happen with default replica identity).
- Verify Supabase Realtime delivers the full `new` row for UPDATE (default replica identity includes changed + key cols; `data`/`config` are jsonb columns and should be present). If not, set the table to `REPLICA IDENTITY FULL` (a one-line SQL migration) so `payload.new` is complete.

**2. (Belt-and-suspenders) ignore self-echoes while a save is pending.** Optional once #1 lands: track the last locally-applied `savedAt`; drop realtime rows with `savedAt ≤ lastApplied`. The `mergeRealtimeTrip` comparison already covers this, so only add if needed.

**3. Make Guide focus resilient (secondary).** With #1, `completed` won't revert, so the seeding effect stays stable. Keep the existing `onComplete` guard (`stopIndex === currentIndex && nextIdx > stopIndex`) and the instant scroll. Re-verify no backward jump under fast completion. Consider whether the seeding effect should also bail while a save is in-flight (probably unnecessary after #1).

**4. Regression test the race.** Add a unit test for `mergeRealtimeTrip` (stale echo ignored, newer applied, equal ignored, missing savedAt safe). Manually repro: rapidly complete 4–5 stops and confirm `completed` + focus stay monotonic (no flicker / backward jump). Keep the full suite green.

## Constraints / conventions (don't violate)

- Anti-slop: lucide icons only, token theming light+dark, a11y, `prefers-reduced-motion`. Immutable saves through the lifted `save` (never mutate `trip`/`data`). Edit-gated by `canEdit`.
- **No new paid deps / API keys / quota services.** Free/local only here.
- Build method: small commits with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. Verify every change: `cd app && npm test && npx tsc -b && npm run build` (≈498 tests should stay green). Deploy: `cd app && npm run build && npx wrangler deploy` from repo root (Wrangler already authed). Smoke-test `/`, `/trips`, `/trip/<id>/guide` → 200.
- Live Supabase project is **`wnpanbjzmcsvhfyjdczv`** (NOT the stale `gvhtvarqgzjhbjzupdlv` in old docs). Edge functions: `ai-proxy`, narration `hyper-function` (slug), `place-photo`.

## Current status

Latest deploy `9f8af758` has: completed-stops collapse (toggle lives on the progress header's "n complete" line), day-switch + collapse animations, Read-more clamp on tab bodies, instant scroll-to-top on advance, stop-number badge on the hero, and the `onComplete` forward-only guard. The realtime-clobber race (this doc) is **still open** and is the next thing to fix.
