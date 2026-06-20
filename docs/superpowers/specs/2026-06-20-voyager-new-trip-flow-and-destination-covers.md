# Voyager — New-Trip Flow + Destination-Driven Covers

> **Status:** Ready to implement · **Date:** 2026-06-20 · **Branch:** `voyager-redesign`
> Fixes the "stl → suitcase" cover bug at its root (the trip never captured a destination) and removes the technical "Trip ID" field from creation. Companion to the separately-tracked **RLS ownership hardening** task (see memory `voyager-rls-ownership-gap`) — *that* is not part of this spec.

## Problem

Creating a trip asks for **Trip ID** (the slug — a DB primary key + URL, a technical artifact leaking into UX) and a **title**, but never the **destination**. Every cover-image path then falls back to searching Wikipedia for the literal title string, so a title like "stl" resolves to a generic article (a suitcase) instead of the city. The abbreviation map (`expandDestination`) was a brittle ~14-city band-aid.

## Principles (preserved)

- The **stop** remains the atomic object; destination is trip-level metadata on `config`, not a new object system.
- **One data model, many lenses** — destination/notes live in `config` (JSONB), read by every cover lens.
- **Extend, don't fork** — additive `config.destination`; no schema migration; backward compatible (old trips fall back to title).

## Schema verdict

**No migration required.** `config` is JSONB; `config.destination` (new) and `config.notes` (already used) are additive. Slug uniqueness is already enforced by the existing `trips.id` text PK; collisions are handled in app code by retry-with-suffix. (Separately: DB-level RLS ownership is a known gap, tracked in its own task — out of scope here.)

---

## Task 1 — Redesign the new-trip flow

**Step 1 fields become: Title · Destination · Notes.** Remove the **Trip ID** and **Subtitle** inputs from the form. Step 2 stays date selection. Subtitle stays in the model (defaulted `''`) for back-compat.

**Slug/ID:** auto-generated, never shown.
- `slugify(title)`: lowercase, trim, spaces/punctuation → single dashes, strip to `[a-z0-9-]`, collapse/trim dashes. Non-ASCII-only titles (e.g. "京都") → fall back to a short generated token (so the id is always a valid non-empty slug).
- On PK collision (`create_trip` returns `slug_taken`), retry with a short suffix (`-2`, `-3`, … then a random base-36 token) — a bounded loop in `useCreateTrip`. The `id` PK guarantees global uniqueness; the loop guarantees the insert eventually succeeds. Clean URLs when free, suffixed only on collision.

**Threading:** `NewTripInput` gains `destination` + `notes`; `buildNewTripPayload` writes `config.destination` and `config.notes` (omit empty). On create, `useBackfillCoverImage` is fired as today (now with a real destination to query).

### Destination autocomplete (Photon)

**Provider: Photon (komoot)** — OSM-backed, no API key, CORS-enabled, purpose-built for typeahead; matches Voyager's free/no-client-key ethos. Mapbox Search Box (public restricted token, 100k/mo free) is the documented future upgrade if a stronger SLA is ever needed.

- **Endpoint:** `https://photon.komoot.io/api?q=<query>&limit=6&lang=en` filtered to place-level results (cities/towns/regions/countries — e.g. `osm_value`/`type` in {city, town, village, state, country, county}). Assemble a clean human label: `"<name>, <state/region>, <country>"` (e.g. `"St. Louis, Missouri, United States"`), de-duplicated.
- **Stored value:** the clean label string in `config.destination`. (Coords are available in the same response — noted as an optional future stash for map-centering; **not** stored in this task to keep it minimal.)
- **Request hygiene:** debounce ~280ms, min 3 chars, `AbortController` to cancel in-flight requests, TanStack Query cache keyed on the lowercased query with a long `staleTime` (suggestions are static) — mirrors `useLandmarkImage`. Keeps us well within Photon fair-use; escape hatch (if ever needed) is a Supabase edge-function proxy with per-IP limits + server cache.
- **Component:** `DestinationInput` (new). Dropdown overlays *below* the input (no layout shift); ≥44px rows; `autoComplete="off"` + appropriate `inputMode`; full keyboard nav (↑/↓/Enter/Esc) + tap; focus-visible rings; subtle loading state; dismiss on blur/Esc. Anti-slop: lucide `MapPin`/`Search`, token classes, light+dark, a11y. Selecting a suggestion fills the field with the clean label; free-typed text is still accepted as-is.

**Tests:** `slugify` (spaces, punctuation, non-ASCII fallback, collapse/trim), collision-retry logic, `buildNewTripPayload` (destination/notes threaded, empties omitted), and a **pure Photon-response → label** parser (filtering + label assembly + dedupe). Debounce/abort covered where unit-testable.

## Task 2 — Destination-driven covers

- Add `destination?: string` to `TripConfig` (type only).
- `destinationOf(trip)` returns `config.destination` first, then `config.title`, then row title — so every lens (TripCard, TripRow, backfill, stop-locality) queries the real city.
- **Delete** `expandDestination` + the `DESTINATION_ABBREVIATIONS` map; simplify `coverImageQueries` (drop the expansion call). Update `landmark-context.test.ts` accordingly.
- Make destination **editable later** in the "Edit trip…" sheet (`TripBasicsEditor`) using the same `DestinationInput`, persisting `config.destination` immutably.

## Task 3 — Manual cover override (in "Manage this trip")

- New **"Cover photo"** card inside `ManageSection`'s disclosure panel (above Export/Import), edit-gated by `canEdit`:
  - Current-cover thumbnail (or placeholder).
  - **Upload cover…** → `resizeToDataUrl` (single image) → `save({ config: { …, coverImage } })`.
  - **Reset to automatic** → `delete config.coverImage` → destination-driven auto-pick resumes.
- Manual selection always wins — `config.coverImage` is already top-priority in `useTripCover`/`TripRow`. Immutable saves; anti-slop (lucide `ImageIcon`/`Upload`/`RotateCcw`, tokens, focus-trap, ≥44px, no layout shift).

## Task 4 — Secret hygiene (no per-trip API keys in `config`)

**Background:** legacy trips carry `config.anthropicKey` (and the old model also used `config.aiKey`) — plaintext API keys duplicated per trip, left over from the pre-redesign per-trip AI model. The current model keeps exactly one key **server-side** in the `ai-proxy` edge function; nothing in the client reads a per-trip key. These leftover keys are dead weight in a public-readable table.

- **Code guard (self-healing):** add a pure `sanitizeConfig(config)` helper that strips a denylist of secret keys (`anthropicKey`, `aiKey`) and apply it on **every persist** — in `buildNewTripPayload` (creation) and in the autosave path (`useSaveTrip` before the `upsert`). Result: the app can never write a secret into `config`, and any trip edited going forward scrubs itself. Pure + unit-tested (strips listed keys, preserves everything else, no-op when absent).
- **One-time bulk cleanup (operator-run SQL, gated on key rotation):** after rotating the leaked keys, run once — non-destructive, removes only the named key from all rows:
  ```sql
  update trips set config = config - 'anthropicKey' where config ? 'anthropicKey';
  update trips set config = config - 'aiKey'        where config ? 'aiKey';
  ```
- **Note:** rotating the leaked keys at console.anthropic.com is the actual security remediation; stripping only stops further exposure. This is documented for the operator, not automated by the app.

## Notes back-compat (folds into Task 1/2)

New trips write notes to `config.notes` (what the React app's Trip Details reads). Legacy trips store notes under **`config.travelerNotes`**. Where notes are read/displayed, fall back to `travelerNotes` when `notes` is absent, so existing trips' notes still surface.

## Out of scope (this spec)

- DB-level RLS ownership hardening (separate spec/task; see memory `voyager-rls-ownership-gap`).
- Storing destination coordinates / centering the map on the destination (future, additive).
- Updating the stale `SUPABASE_SETUP.md` to the real schema (housekeeping follow-up).

## Build method

Subagent-driven (opus) implementer per task → spec + code-quality review → commit per task → push to `voyager-redesign`. Each task verified: `cd app && npm test && npx tsc -b && npm run build`. Update `handoff.md` when shipped.
