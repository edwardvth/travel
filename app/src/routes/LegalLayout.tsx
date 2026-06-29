import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '../components/Logo'

/**
 * Shared chrome for the public legal pages (Privacy Policy, Terms). Token-themed
 * (light + dark), readable prose width, brand header, and a back link home. These
 * routes are public (no auth) so the App Store + Google/Apple consent screens can
 * link straight to https://mypassage.ai/privacy-policy and /tos.
 */
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  useEffect(() => {
    const prev = document.title
    document.title = `${title} · Passage`
    return () => { document.title = prev }
  }, [title])

  return (
    <div className="min-h-[100svh] bg-base text-ink">
      <header className="border-b border-hair">
        <div className="mx-auto max-w-3xl px-5 py-4 flex items-center justify-between gap-4">
          <Link to="/" aria-label="Passage home" className="shrink-0">
            <Logo />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink transition-colors min-h-[44px]"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-serif text-3xl sm:text-4xl tracking-tight">{title}</h1>
        <p className="text-muted text-[13px] mt-2">Last updated {updated}</p>
        <article className="mt-8">{children}</article>
      </main>
    </div>
  )
}

/** A titled section. */
export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="font-serif text-xl tracking-tight">{heading}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-ink/90">{children}</div>
    </section>
  )
}
