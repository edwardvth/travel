import { MAX_ARC_SAMPLES } from './field-globe.glsl'

/**
 * Adaptive quality ladder. FieldGlobe samples a rolling average of frame time
 * and, when the device can't hold ~60fps, steps DOWN to a cheaper level that
 * preserves the composition (limb/earth/lights/palette) — it trims cost, never
 * changes the look. Reductions, least-visible first: fewer arc bezier samples →
 * lower DPR cap → reduced animation cadence. Recovers (steps up) when fast again.
 */
export interface QualityConfig {
  /** Cap for the shader's per-pixel arc bezier loop (uArcSamples). */
  arcSamples: number
  /** Device-pixel-ratio cap for the render target. */
  dprCap: number
  /** Minimum ms between rendered frames (0 = uncapped / every rAF). */
  cadenceMs: number
  /** When true, the live shader is abandoned for the static image. */
  static?: boolean
}

export const QUALITY_LEVELS: readonly QualityConfig[] = [
  { arcSamples: MAX_ARC_SAMPLES, dprCap: 1.5, cadenceMs: 0 },
  { arcSamples: 14, dprCap: 1.5, cadenceMs: 0 },
  { arcSamples: 14, dprCap: 1.0, cadenceMs: 0 },
  { arcSamples: 10, dprCap: 1.0, cadenceMs: 1000 / 30 },
  { arcSamples: 0, dprCap: 1.0, cadenceMs: 0, static: true },
]

/** Sustained avg frame time (ms) above which we step down. */
export const DEGRADE_MS = 22
/** Sustained avg frame time (ms) below which we step back up. */
export const RECOVER_MS = 14

export function qualityFor(level: number): QualityConfig {
  const i = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, level))
  return QUALITY_LEVELS[i]
}

export function isStaticLevel(level: number): boolean {
  return !!qualityFor(level).static
}

export function nextLevel(level: number, avgFrameMs: number): number {
  if (avgFrameMs > DEGRADE_MS && level < QUALITY_LEVELS.length - 1) return level + 1
  if (avgFrameMs < RECOVER_MS && level > 0) return level - 1
  return level
}
