import { cn } from '../../lib/utils'
export function IconButton({ label, className, children, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...props} type="button" aria-label={label}
      className={cn('grid place-items-center w-9 h-9 rounded-[10px] bg-black/35 backdrop-blur border border-hair',
        'text-white/90 hover:text-white hover:bg-black/55 transition-colors', className)}>
      {children}
    </button>
  )
}
