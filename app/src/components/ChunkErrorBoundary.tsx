import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './ui/Button'

/** Matches the dynamic-import failure messages across browsers. */
const CHUNK_ERR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk \d+ failed/i

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Catches errors from lazy route chunks so a failed fetch (stale chunk after a
 * deploy, network blip, offline resume) never white-screens. Distinguishes a
 * chunk-load failure from a generic render crash for honest messaging + tagged
 * logs. Recovery is a full reload — the only reliable fix for a stale chunk hash
 * (the old URL is gone); autosave persists to Supabase, so no work is lost.
 *
 * The one class component in the codebase, because React error boundaries must
 * be classes.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    const isChunk = CHUNK_ERR.test(error?.message ?? '')
    console.error(isChunk ? '[chunk-load]' : '[render-crash]', error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isChunk = CHUNK_ERR.test(error.message ?? '')
    return (
      <div role="alert" className="grid place-items-center min-h-[50vh] px-6 text-center">
        <div className="max-w-sm">
          <span
            aria-hidden="true"
            className="mx-auto grid place-items-center w-12 h-12 rounded-2xl border border-hair bg-fill text-muted"
          >
            <AlertTriangle size={22} />
          </span>
          <h2 className="mt-4 font-serif text-2xl text-ink">
            {isChunk ? "Couldn't load the latest version of Passage." : 'Something went wrong.'}
          </h2>
          <p className="mt-2 text-[14px] text-muted leading-relaxed">
            {isChunk
              ? 'A new version may have just shipped. Reload to get it.'
              : 'An unexpected error occurred. Reloading usually clears it.'}
          </p>
          <div className="mt-5">
            <Button variant="claret" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
