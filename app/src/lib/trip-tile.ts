/**
 * Deterministic placeholder art for a trip tile.
 *
 * Every trip card shows a real destination photo (Wikipedia landmark image) when
 * one is available. Until then — or when there's no image at all — we paint a
 * stable, muted gradient derived from the trip itself, so each trip reads as a
 * distinct "cover" rather than an empty grey box. The same seed always yields the
 * same hue, so a trip's colour never flickers between renders or reloads.
 *
 * The palette is deliberately low-saturation and dark-bottomed: it sits behind
 * white serif titles like a magazine cover, and matches the photographic tiles
 * tonally so the grid stays calm whether a tile has loaded its photo or not.
 */

/** FNV-ish string hash → stable hue in [0, 360). */
function hashHue(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 360
}

/** A CSS `background` value: an upper-left glow over a dark diagonal base. */
export function tripGradient(seed: string): string {
  const hue = hashHue(seed || 'voyager')
  const glow = `hsl(${hue} 36% 33%)`
  const top = `hsl(${hue} 30% 17%)`
  const bot = `hsl(${hue} 32% 8%)`
  return [
    `radial-gradient(115% 85% at 28% -8%, ${glow} 0%, transparent 58%)`,
    `linear-gradient(155deg, ${top} 0%, ${bot} 100%)`,
  ].join(', ')
}
