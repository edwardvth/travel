import { cn } from '../../lib/utils'
export function Segmented<T extends string>(
  { value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }
) {
  return (
    <div className="inline-flex p-1 rounded-btn bg-fill border border-hair">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn('px-4 py-2 rounded-[10px] text-[13px] font-bold transition-colors',
            value === o.value ? 'bg-sig-btn text-white' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
