/**
 * The enrichment prompt version. Bump when the prompt template changes so the
 * cache regenerates at the new version (old-prompt content is never served).
 * The current value matches the "facts-separated / experience-routed" prompt;
 * the pre-existing browser prompt was implicitly version 1.
 * MIRROR: supabase/functions/enrich-place keeps the same integer.
 */
export const CURRENT_ENRICH_VERSION = 2

/**
 * A short, stable hex digest of the exact prompt template string — exact prompt
 * provenance beyond the integer version (FNV-1a, 32-bit). Pure.
 * MIRROR: copied verbatim into supabase/functions/enrich-place.
 */
export function promptId(template: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < template.length; i++) {
    h ^= template.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
