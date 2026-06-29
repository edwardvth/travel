export const TS = '0 1px 3px rgba(0,0,0,.62), 0 4px 20px rgba(0,0,0,.55)'
export const TS_STRONG = '0 1px 4px rgba(0,0,0,.72), 0 6px 28px rgba(0,0,0,.62)'
export const HEADER_SCRIM = 'linear-gradient(to bottom, rgba(8,8,12,.30) 0%, rgba(8,8,12,.12) 32%, rgba(8,8,12,.58) 74%, rgba(8,8,12,.9) 100%)'
/** Soft diffuse dark halo behind a card/group so it separates from the background. */
export function SoftBackdrop() {
  return <div aria-hidden className="pointer-events-none absolute -inset-x-1 -inset-y-4 -z-10 rounded-[32px] bg-black/45 blur-[52px]" />
}

/** Footer media attribution for the home (Pexels videos + Unsplash photos). */
export function HomeCredits() {
  const link = 'underline-offset-2 transition-colors hover:text-white/65 hover:underline'
  return (
    <footer className="relative z-10 px-5 pb-9 pt-2 text-center font-mono text-[10.5px] tracking-wide text-white/35">
      Destination videos from{' '}
      <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className={link}>Pexels</a>
      {' · '}Trip photos from{' '}
      <a href="https://unsplash.com" target="_blank" rel="noreferrer" className={link}>Unsplash</a>
    </footer>
  )
}
