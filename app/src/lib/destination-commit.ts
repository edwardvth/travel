/**
 * Decide the destination label to commit from the pill (spec §3.2). Structured
 * data first: an explicitly chosen suggestion wins; else the top Photon result;
 * else trimmed raw text as a last resort. Pure.
 */
export interface CommitInput {
  /** The suggestion the user explicitly clicked, if any. */
  chosen: string | null
  /** The raw typed text. */
  raw: string
  /** Current Photon suggestions, best-first. */
  suggestions: string[]
}

export function resolveCommitLabel({ chosen, raw, suggestions }: CommitInput): string {
  if (chosen && chosen.trim()) return chosen.trim()
  if (suggestions.length > 0 && suggestions[0].trim()) return suggestions[0].trim()
  return raw.trim()
}
