import { cn } from '../../lib/utils'
export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={cn(
      'w-full rounded-btn bg-[rgba(255,255,255,.04)] border border-hair px-4 py-3 text-[15px] text-ink',
      'placeholder:text-muted outline-none focus:border-sig-link transition-colors', props.className,
    )}
  />
)
