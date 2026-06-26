import { StaticBackdrop } from './StaticBackdrop'

/**
 * HomeBackground — the launchpad background boundary. ALWAYS renders
 * StaticBackdrop as the first, immediate paint (the hero never waits on it).
 * The Phase 2 FieldGlobe shader is layered above this in Task 7 as a progressive
 * enhancement; the static layer remains underneath permanently as the fallback.
 */
export function HomeBackground() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <StaticBackdrop />
    </div>
  )
}
