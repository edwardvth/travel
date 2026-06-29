/**
 * Pure decision logic for the trip-creation pill's destination step.
 *
 * The pill must NEVER advance on raw typed text — only on a resolved autocomplete
 * prediction. These helpers model that as explicit state so the rule is testable
 * in isolation from React/timing. See `components/home/CommandPill.tsx`.
 */

export type AutocompleteStatus =
  | 'idle' // too short to search — no predictions possible
  | 'loading' // debounce or fetch in flight — predictions not yet current
  | 'ready' // predictions for the CURRENT text are available
  | 'empty' // searched, settled, but no matching place

export interface StatusInput {
  /** Length of the trimmed raw query. */
  trimmedLength: number
  /** Minimum chars before we search (below this → idle). */
  minQuery: number
  /** The debounce has caught up: predictions reflect the CURRENT text, not a
   *  mid-debounce stale query. This is the stale-result guard. */
  settled: boolean
  /** A fetch is in flight for the settled query. */
  loading: boolean
  /** Number of predictions currently available. */
  predictionCount: number
}

/**
 * Derive the autocomplete status. `loading` covers BOTH a pending debounce
 * (`!settled`) and an in-flight fetch, so stale predictions from a previous
 * query can never be treated as "ready" for the current text.
 */
export function deriveAutocompleteStatus({
  trimmedLength,
  minQuery,
  settled,
  loading,
  predictionCount,
}: StatusInput): AutocompleteStatus {
  if (trimmedLength < minQuery) return 'idle'
  if (!settled || loading) return 'loading'
  return predictionCount > 0 ? 'ready' : 'empty'
}

export type ContinueAction =
  | { kind: 'advance'; label: string } // resolved → proceed with this place
  | { kind: 'wait' } // still resolving → shake + defer until predictions land
  | { kind: 'invalid' } // nothing resolvable → shake + inline hint

/**
 * Decide what a "continue" attempt (Enter / submit button / mobile Go) should do.
 * Only ever yields `advance` with a real prediction — the highlighted one if any,
 * else the top result. Raw text is never an output.
 */
export function resolveContinue(
  status: AutocompleteStatus,
  active: number,
  predictions: string[],
): ContinueAction {
  if (status === 'ready' && predictions.length > 0) {
    const idx = active >= 0 && active < predictions.length ? active : 0
    return { kind: 'advance', label: predictions[idx] }
  }
  if (status === 'loading') return { kind: 'wait' }
  return { kind: 'invalid' }
}
