-- docs/supabase/2026-06-29-place-cache-goodfor.sql
-- Run once in the Supabase SQL editor (project wnpanbjzmcsvhfyjdczv).
--
-- Adds the `good_for` column to the shared place-description cache so the
-- enrich-place edge function (v3 prompt) can store/serve the audience/occasion
-- chip ("Romantic dinner", "Architecture lovers", ...) alongside history/facts/
-- tips/notice. Additive + idempotent — existing rows get NULL (served as '').
-- Pre-v3 cache rows simply lack the chip until they regenerate under v3.

alter table public.place_cache add column if not exists good_for text;
