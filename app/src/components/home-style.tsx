export const TS = '0 1px 3px rgba(0,0,0,.62), 0 4px 20px rgba(0,0,0,.55)'
export const TS_STRONG = '0 1px 4px rgba(0,0,0,.72), 0 6px 28px rgba(0,0,0,.62)'
export const HEADER_SCRIM = 'linear-gradient(to bottom, rgba(8,8,12,.30) 0%, rgba(8,8,12,.12) 32%, rgba(8,8,12,.58) 74%, rgba(8,8,12,.9) 100%)'
/** Soft diffuse dark halo behind a card/group so it separates from the background. */
export function SoftBackdrop() {
  return <div aria-hidden className="pointer-events-none absolute -inset-x-1 -inset-y-4 -z-10 rounded-[32px] bg-black/45 blur-[52px]" />
}
