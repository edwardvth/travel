/**
 * Fire-and-forget cover warm for the command pill (spec §3.1). The moment a
 * destination commits we resolve its cover URL (via the same service that backs
 * `useBackfillCoverImage`) into an in-memory cache and preload the image bytes,
 * so the materialization seed can read it SYNCHRONOUSLY and paint instantly.
 *
 * The seed reads cache-only via `peekCover` (never triggers a fetch). A cold or
 * failed warm leaves `null`, and the seed falls back to the branded gradient;
 * the real cover still resolves later in the planner via the existing backfill.
 *
 * No React hooks here — this is the plain service path.
 */
type Url = string | null
const cache = new Map<string, Url>()           // resolved value (or null on miss)
const inflight = new Map<string, Promise<void>>()

// Injectable resolver so tests don't hit the network. Production = resolveCoverImage([dest]).
// Lazy-imported so the Supabase client (which throws when env vars are absent) is only
// initialised at call-time, not at module-load time — this lets the test file import us
// without needing real Supabase env vars.
let resolver: (destination: string) => Promise<Url> =
  async (destination) => {
    const { resolveCoverImage } = await import('../trip/cover-image')
    return (await resolveCoverImage([destination]))?.url ?? null
  }

const key = (destination: string) => destination.trim().toLowerCase()

/** Cache-only read — undefined = never warmed, null = warmed-but-no-cover, string = URL. */
export function peekCover(destination: string): Url | undefined {
  return cache.get(key(destination))
}

/** Warm the cache for `destination`. Idempotent per destination; never throws. */
export function warmCover(destination: string): Promise<void> {
  const k = key(destination)
  if (!k) return Promise.resolve()
  if (cache.has(k)) return Promise.resolve()
  const existing = inflight.get(k)
  if (existing) return existing
  const p = (async () => {
    try {
      const url = await resolver(destination.trim())
      cache.set(k, url)
      if (url) preload(url)
    } catch {
      cache.set(k, null)             // best-effort: cache the miss
    } finally {
      inflight.delete(k)
    }
  })()
  inflight.set(k, p)
  return p
}

/** Preload image bytes into the HTTP cache so the seed paints with no flash. */
function preload(url: string): void {
  if (typeof Image === 'undefined') return
  const img = new Image()
  img.decoding = 'async'
  img.src = url
}

// ---- test seams ----
export function __setResolverForTest(fn: (destination: string) => Promise<Url>): void { resolver = fn }
export function __resetCoverCacheForTest(): void {
  cache.clear(); inflight.clear()
  resolver = async (destination) => {
    const { resolveCoverImage } = await import('../trip/cover-image')
    return (await resolveCoverImage([destination]))?.url ?? null
  }
}
