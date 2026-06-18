import { cn } from '../../lib/utils'

type Variant = 'primary' | 'claret' | 'ghost' | 'soft'
const styles: Record<Variant, string> = {
  primary: 'bg-ink text-base hover:shadow-lift',
  claret: 'bg-sig-btn text-white hover:brightness-110',
  ghost: 'bg-transparent text-ink border border-hair hover:bg-[rgba(255,255,255,.06)]',
  soft: 'bg-[rgba(255,255,255,.07)] text-ink hover:bg-[rgba(255,255,255,.12)]',
}
export function Button(
  { variant = 'primary', className, busy, children, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }
) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-btn px-5 py-3 font-sans font-bold text-[14.5px]',
        'transition-[transform,background,box-shadow] duration-150 active:translate-y-px',
        'disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
        styles[variant], className,
      )}
    >
      {busy ? 'Working…' : children}
    </button>
  )
}
