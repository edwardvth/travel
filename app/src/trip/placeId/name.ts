/**
 * Normalize a place name for comparison: strip accents, lowercase, drop
 * punctuation, collapse whitespace. Pure.
 */
export function normalizeName(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const tokens = (s: string): string[] => normalizeName(s).split(' ').filter(Boolean)

/** Three-level name match verdict between a stop name and a candidate name. Pure. */
export function nameSimilarity(a: string, b: string): 'exact' | 'close' | 'none' {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 'none'
  if (na === nb) return 'exact'
  if (na.includes(nb) || nb.includes(na)) return 'close'
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (ta.size === 0 || tb.size === 0) return 'none'
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const jaccard = inter / (ta.size + tb.size - inter)
  return jaccard >= 0.5 ? 'close' : 'none'
}
