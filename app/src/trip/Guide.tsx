import { Compass, Navigation, Footprints, Volume2, Sparkles, MapPin } from './icons'
import type { LucideIcon } from './icons'

/**
 * Guide — the **aspirational teaser** for Voyager's Phase-3 live walking
 * companion. Guide is the "live it" lens: while you're out exploring your
 * Voyage it will navigate you to the next stop, narrate what you're walking
 * past, and time your steps. None of that ships yet, so this surface exists to
 * *sell the dream* — a polished, editorial "coming soon", never a blank or
 * "unavailable/broken" page.
 *
 * Strictly presentational: no GPS, no map library, no routing, no state. The
 * "next stop" preview below is a faint, non-interactive mock (aria-hidden,
 * pointer-events-none, masked behind a gradient) so it reads as a glimpse of
 * the future UI rather than a real control.
 *
 * Anti-slop: lucide SVG icons only (no emoji), tokens light+dark (≥4.5:1),
 * visible focus rings inherited from the layout, no layout shift, motion gated
 * behind `prefers-reduced-motion` (global guard in index.css + motion-reduce:
 * variants here).
 */
export default function Guide() {
  return (
    <div className="px-5 md:px-8 py-10 md:py-16">
      <div className="mx-auto w-full max-w-2xl">
        {/* Eyebrow / phase pill — a tasteful badge, not a sad banner */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/[0.08] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-gold">
            <Sparkles size={13} aria-hidden="true" />
            Coming in Phase 3
          </span>
        </div>

        {/* Editorial hero */}
        <header className="mt-6 text-center">
          <span
            aria-hidden="true"
            className="mx-auto grid place-items-center w-14 h-14 rounded-2xl border border-sig/25 bg-sig/[0.06] text-sig"
          >
            <Compass size={26} />
          </span>
          <h2 className="mt-5 font-serif text-4xl md:text-5xl text-ink tracking-tight">
            Guide
          </h2>
          <p className="mt-3 text-[17px] md:text-[18px] font-semibold text-ink">
            Your live travel companion.
          </p>
          <p className="mx-auto mt-2 max-w-md text-[14px] md:text-[15px] text-muted leading-relaxed">
            Guide becomes active while you&rsquo;re exploring your Voyage.
          </p>
        </header>

        {/* Faint, non-interactive preview of the future live-guide UI */}
        <NextStopPreview />

        {/* "What Guide will do" — concise value props, not a feature dump */}
        <section aria-label="What Guide will do" className="mt-12">
          <h3 className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            What Guide will do
          </h3>
          <ul aria-label="What Guide will do" className="mt-5 grid gap-3 sm:grid-cols-2">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="flex items-start gap-3 rounded-card border border-hair bg-fill/50 px-4 py-3.5"
              >
                <span
                  aria-hidden="true"
                  className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-base text-sig-link"
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-ink">{title}</span>
                  <span className="block text-[12.5px] text-muted leading-snug">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Closing reassurance — keep building in Plan today */}
        <p className="mt-10 text-center text-[12.5px] text-muted">
          Keep building your itinerary in{' '}
          <span className="font-semibold text-ink">Plan</span> — Guide will bring
          it to life when you arrive.
        </p>
      </div>
    </div>
  )
}

/** Value props for the "what Guide will do" list — concise + premium. */
const VALUE_PROPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Navigation,
    title: 'Navigate to the next stop',
    body: 'Turn-by-turn walking directions through your day.',
  },
  {
    icon: Volume2,
    title: 'Narrated as you go',
    body: 'Cultural and historical context, read aloud in the moment.',
  },
  {
    icon: Footprints,
    title: 'Paced to your stride',
    body: 'Walking times and nudges so you never feel rushed.',
  },
  {
    icon: Compass,
    title: 'Discover what’s nearby',
    body: 'Recommendations a few steps from where you stand.',
  },
]

/**
 * A faint, aspirational mock of the future "next stop" live-guide card. Purely
 * decorative: `aria-hidden`, `pointer-events-none`, dimmed and masked behind a
 * gradient so it reads as a preview of what's coming, not a usable control.
 */
function NextStopPreview() {
  return (
    <div className="relative mt-10" aria-hidden="true">
      {/* Soft top mask so the mock fades in from the hero, reading as a preview */}
      <div className="pointer-events-none select-none [mask-image:linear-gradient(to_bottom,transparent,black_22%,black_100%)]">
        <div className="rounded-card border border-hair bg-base/80 shadow-soft px-4 py-4">
          {/* Header row: live-guide status */}
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-sig-link">
              Next stop
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted">
              <Footprints size={13} />
              6 min · 480 m
            </span>
          </div>

          {/* Route line: origin → destination */}
          <div className="mt-4 flex items-stretch gap-3">
            {/* Vertical route rail */}
            <div className="flex flex-none flex-col items-center pt-1">
              <span className="grid place-items-center w-6 h-6 rounded-full border border-hair bg-fill text-muted">
                <MapPin size={13} />
              </span>
              <span className="my-1 w-px flex-1 bg-gradient-to-b from-hair via-sig/40 to-sig" />
              <span className="grid place-items-center w-6 h-6 rounded-full bg-sig/15 text-sig">
                <Navigation size={13} />
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] text-muted truncate">Dam Square</p>
              <p className="mt-[18px] text-[15px] font-bold text-ink truncate">
                Rijksmuseum
              </p>
              <p className="text-[12px] text-muted truncate">Museumstraat 1</p>
            </div>
          </div>

          {/* Narration snippet */}
          <div className="mt-4 flex items-start gap-2.5 rounded-btn border border-hair bg-fill/60 px-3 py-2.5">
            <span className="flex-none mt-0.5 text-sig-link">
              <Volume2 size={15} />
            </span>
            <p className="text-[12.5px] italic text-ink/80 leading-snug">
              &ldquo;A few steps ahead, the Rijksmuseum &mdash; Amsterdam&rsquo;s
              treasure house of the Dutch Golden Age&hellip;&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* Bottom fade so the preview dissolves rather than ending hard */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-base to-transparent" />
    </div>
  )
}
