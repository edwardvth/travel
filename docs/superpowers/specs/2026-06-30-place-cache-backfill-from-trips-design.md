# Design — Free backfill of `place_cache` from existing stop descriptions

**Date:** 2026-06-30
**Status:** Approved (design)
**Project:** Passage (Supabase ref `wnpanbjzmcsvhfyjdczv`)

## Problem

The shared place-description cache (`place_cache`) is now live: when a `placeId`
stop needs a description, the app reads the shared library first (instant + free
on a hit) and generates+caches on a miss. See
`docs/superpowers/specs/2026-06-29-passage-app-store-readiness-design.md` neighbours
and memory `voyager-placeid-backfill`.

But many stops **already** carry good, AI-generated descriptions stored on the
stop itself (in `trips.data` JSONB: `history` / `facts` / `tips` / `notice` /
`goodFor`). Re-generating all of those through the AI to populate the cache would
**waste money** for content we already have. We want to **copy** the existing
good descriptions into `place_cache` for free, and **only** the genuinely
in-depth ones — thin stubs (a few words) must NOT be cached, because a cached
`ready` row is served verbatim and won't regenerate until a version bump.

## Goal

A one-time, idempotent, **$0** SQL migration (run in the Supabase SQL editor)
that seeds `place_cache` from qualifying existing stop descriptions. No
`ai-proxy`, no Google Place Details calls. Read-only on `trips`, insert-only on
`place_cache`.

## Quality bar (the key requirement)

A stop's description is "in depth / up to par" — and therefore eligible to cache
— only when **both**:

1. **Substantial Story:** `length(history) >= 300` characters (a real
   multi-sentence/2-paragraph Story, not a few words), **AND**
2. **At least one supporting section:** `jsonb_array_length(facts) >= 2`
   **OR** `length(tips) >= 40`.

Anything that fails this bar is **left uncached** and will regenerate fresh
(paid) on demand — that is the intended behaviour.

## Candidate selection

Walk `trips.data -> 'days'[] -> 'stops'[]`. A stop is a candidate iff:

- It has a `placeId` matching the app's own validation shape
  `^[A-Za-z0-9_-]{16,}$`. (The edge function `validatePlaceRequest` rejects other
  shapes before it ever reads the cache, so a row for a non-conforming id would
  be dead — never served. We therefore skip them.)
- It clears the **quality bar** above.

`facts` is read only when it is a JSONB array (`jsonb_typeof = 'array'`); a legacy
string `facts` contributes 0 to the count.

## Dedupe

`DISTINCT ON (placeId)`, ordered so the **richest** qualifying copy wins:
`ORDER BY placeId, (len(history) + len(tips) + 50 * facts_count) DESC`. A place
that appears in several trips is cached once, from its best version.

## Field mapping (stop → `place_cache` row)

| `place_cache` column   | source (stop JSON)                       |
|------------------------|------------------------------------------|
| `place_id`             | `s->>'placeId'`                          |
| `prompt_version`       | `3` (CURRENT_ENRICH_VERSION)             |
| `generation_status`    | `'ready'`                                |
| `generation_started_at`| `now()`                                  |
| `history`              | `s->>'history'`                          |
| `facts`                | `s->'facts'` (jsonb array)               |
| `tips`                 | `s->>'tips'`                             |
| `notice`               | `nullif(s->>'notice','')`                |
| `good_for`             | `nullif(s->>'goodFor','')` (may be NULL) |
| `place_name`           | `s->>'name'`                             |
| `address`              | `nullif(s->>'address','')`               |
| `lat` / `lng`          | `s->>'lat'` / `s->>'lng'` (cast)         |
| `place_types`          | `s->'placeTypes'` when array             |
| `content_source`       | `'generated'`                            |
| `model`                | `'migrated-from-trips'` (provenance)     |
| `generated_at` / `updated_at` / `last_verified_at` | `now()`      |

## Safety / reversibility

- `ON CONFLICT (place_id, prompt_version) DO NOTHING` — never overwrites an
  existing cache row, a freshly generated row, or a `manual_lock` curated edit.
- Inserts do **not** fire `place_cache_audit_trg` (it is AFTER UPDATE only), so
  no audit noise.
- Reversible in one statement:
  `delete from public.place_cache where model = 'migrated-from-trips';`
- Marking rows `prompt_version = 3` means the app serves them and won't
  auto-regenerate. When we later move to "Opus 4.7 everywhere" and bump
  `CURRENT_ENRICH_VERSION`, these migrated rows are naturally superseded and
  regenerate on-demand with the better model — no permanent lock-in.

## Accepted trade-offs

- Pre-chips stops have no `goodFor` → migrated with an empty chip. Selectively
  Re-generate (founder) to fill the chip on places that matter. We are
  deliberately NOT paying to regenerate for the chip alone.
- Migrated descriptions reflect whatever model/prompt originally produced them
  (likely fine — they passed the quality bar). The version-bump path above is the
  escape hatch for a future quality lift.

## Run sequence (operator, Supabase SQL editor)

1. **Preview** — counts of *qualifying* vs *excluded-as-too-thin* distinct
   places, plus a small sample of each, so the split is visible before any write.
2. **Insert** — the migration.
3. **Verify** — `count(*) where model = 'migrated-from-trips'` + spot-check 2 rows.

## Out of scope

- No AI generation, no Google verification, no `goodFor` synthesis.
- No changes to app code or edge functions (cache read path already shipped).
- The retired placeId *backfill admin tool* (branch `placeid-backfill`) is
  unrelated and stays out.

## Deliverable

One reviewed file: `docs/supabase/2026-06-30-place-cache-backfill-from-trips.sql`
with clearly separated PREVIEW / INSERT / VERIFY / ROLLBACK sections.
