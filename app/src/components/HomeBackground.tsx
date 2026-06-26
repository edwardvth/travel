import { useMemo } from 'react'
import { StaticBackdrop } from './StaticBackdrop'
import { FieldGlobe } from '../home/FieldGlobe'
import { supportsWebGL2 } from '../home/webgl-support'

/**
 * HomeBackground — the launchpad background boundary. ALWAYS renders
 * StaticBackdrop first/immediately (the hero never waits). When WebGL2 is
 * supported, layers the FieldGlobe shader above it (transparent until its first
 * frame, then fades in). A soft top scrim keeps the headline + pill dominant
 * over the bright atmospheric limb (subordination, spec §6).
 */
export function HomeBackground() {
  const enableShader = useMemo(() => supportsWebGL2(), [])
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <StaticBackdrop />
      {enableShader && <FieldGlobe className="absolute inset-0" />}
      {/* Subordination scrim: darkens the top band where the headline sits. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(5,5,9,0.55) 0%, rgba(5,5,9,0.18) 32%, rgba(5,5,9,0) 60%)',
        }}
      />
    </div>
  )
}
