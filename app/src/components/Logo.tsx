export function Mark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" stroke="currentColor"
      strokeWidth="4.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="16.5" y="10.8" width="8" height="12.6" rx="3" transform="rotate(-14 20.5 17.1)" fill="currentColor" stroke="none" />
      <circle cx="27.2" cy="8.6" r="3.3" fill="currentColor" stroke="none" />
      <path d="M26 12.2 L21.8 24.6" />
      <path d="M24.6 14.8 L30 20.2" strokeWidth="4.2" />
      <path d="M21.8 24.6 L26.4 38" />
      <path d="M21.8 24.6 L15.8 36.4" />
    </svg>
  )
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-sans font-extrabold tracking-tight ${className}`}>
      <span className="text-sig-link"><Mark size={26} /></span>
      <span className="text-[17px]">Voyager</span>
    </span>
  )
}
