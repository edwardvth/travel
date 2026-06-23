import * as React from 'react'
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  MotionConfig,
  type PanInfo,
  type MotionValue,
} from 'framer-motion'
import { cn } from '../lib/utils'
import { toInputTime } from './time'

/**
 * A 3D wheel / drum time picker — hour · minute · AM/PM. Adapted from a
 * framer-motion date wheel and restyled to Voyager's tokens. Controlled by a
 * display-string `value` ("7:30 PM"); every drag/scroll/tap emits a new display
 * string. Mobile surface only (desktop keeps the native field). Respects
 * `prefers-reduced-motion` via MotionConfig.
 */

const ITEM_HEIGHT = 40
const VISIBLE_ITEMS = 5
const CENTER_OFFSET = Math.floor(VISIBLE_ITEMS / 2) * ITEM_HEIGHT
const PERSPECTIVE_ORIGIN = ITEM_HEIGHT * 2

function WheelItem({
  item,
  index,
  y,
  isSelected,
  onClick,
}: {
  item: string | number
  index: number
  y: MotionValue<number>
  isSelected: boolean
  onClick: () => void
}) {
  const itemY = useTransform(y, (latest) => index * ITEM_HEIGHT + latest + CENTER_OFFSET)
  const rotateX = useTransform(itemY, [0, CENTER_OFFSET, ITEM_HEIGHT * VISIBLE_ITEMS], [45, 0, -45])
  const scale = useTransform(itemY, [0, CENTER_OFFSET, ITEM_HEIGHT * VISIBLE_ITEMS], [0.8, 1, 0.8])
  const opacity = useTransform(
    itemY,
    [0, CENTER_OFFSET * 0.5, CENTER_OFFSET, CENTER_OFFSET * 1.5, ITEM_HEIGHT * VISIBLE_ITEMS],
    [0.25, 0.55, 1, 0.55, 0.25],
  )

  return (
    <motion.div
      className="flex items-center justify-center select-none"
      style={{
        height: ITEM_HEIGHT,
        rotateX,
        scale,
        opacity,
        transformStyle: 'preserve-3d',
        transformOrigin: `center center -${PERSPECTIVE_ORIGIN}px`,
      }}
      onClick={onClick}
    >
      <span className={cn('font-mono tabular-nums text-[17px] transition-colors', isSelected ? 'font-bold text-ink' : 'text-muted')}>
        {item}
      </span>
    </motion.div>
  )
}

function WheelColumn({
  items,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  items: (string | number)[]
  value: number
  onChange: (index: number) => void
  className?: string
  ariaLabel: string
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const y = useMotionValue(-value * ITEM_HEIGHT)

  // Keep latest props in refs for the native wheel listener.
  const valueRef = React.useRef(value)
  const onChangeRef = React.useRef(onChange)
  const lenRef = React.useRef(items.length)
  React.useEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
    lenRef.current = items.length
  })

  // Animate the wheel to the selected value whenever it changes.
  React.useEffect(() => {
    animate(y, -value * ITEM_HEIGHT, { type: 'spring', stiffness: 300, damping: 30 })
  }, [value, y])

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const projectedY = y.get() + info.velocity.y * 0.2
    const i = Math.max(0, Math.min(items.length - 1, Math.round(-projectedY / ITEM_HEIGHT)))
    onChange(i)
  }

  // Trackpad / mouse-wheel scrubbing (non-passive so we can preventDefault).
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const dir = e.deltaY > 0 ? 1 : -1
      const next = Math.max(0, Math.min(lenRef.current - 1, valueRef.current + dir))
      if (next !== valueRef.current) onChangeRef.current(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const max = items.length - 1
    let next = value
    if (e.key === 'ArrowUp') { e.preventDefault(); next = Math.max(0, value - 1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); next = Math.min(max, value + 1) }
    else if (e.key === 'Home') { e.preventDefault(); next = 0 }
    else if (e.key === 'End') { e.preventDefault(); next = max }
    else return
    if (next !== value) onChange(next)
  }

  const dragConstraints = React.useMemo(
    () => ({ top: -(items.length - 1) * ITEM_HEIGHT, bottom: 0 }),
    [items.length],
  )

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden', className)}
      style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS }}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="spinbutton"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={items.length - 1}
      aria-valuetext={String(items[value])}
    >
      {/* Top / bottom fades into the panel background. */}
      <div
        className="absolute inset-x-0 top-0 z-10 pointer-events-none"
        style={{ height: CENTER_OFFSET, background: 'linear-gradient(to bottom, var(--base) 0%, transparent 100%)' }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
        style={{ height: CENTER_OFFSET, background: 'linear-gradient(to top, var(--base) 0%, transparent 100%)' }}
        aria-hidden="true"
      />
      {/* Centre selection band. */}
      <div
        className="absolute inset-x-0 z-[5] pointer-events-none border-y border-hair bg-sig/5"
        style={{ top: CENTER_OFFSET, height: ITEM_HEIGHT }}
        aria-hidden="true"
      />

      <motion.div
        className="cursor-grab touch-none active:cursor-grabbing"
        style={{ y, paddingTop: CENTER_OFFSET, paddingBottom: CENTER_OFFSET }}
        drag="y"
        dragConstraints={dragConstraints}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
      >
        {items.map((item, index) => (
          <WheelItem
            key={`${item}-${index}`}
            item={item}
            index={index}
            y={y}
            isSelected={index === value}
            onClick={() => onChange(index)}
          />
        ))}
      </motion.div>
    </div>
  )
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const AMPM = ['AM', 'PM'] as const

/** Parse a display time ("7:30 PM") into wheel parts; defaults to 9:00 AM. */
function parseParts(value: string | undefined): { h12: number; min: number; ap: 'AM' | 'PM' } {
  const hhmm = toInputTime(value) || '09:00'
  const [h24, m] = hhmm.split(':').map(Number)
  return { h12: h24 % 12 || 12, min: m, ap: h24 >= 12 ? 'PM' : 'AM' }
}

/** Build a display string from wheel parts ("7:30 PM"). */
function buildTime(h12: number, min: number, ap: 'AM' | 'PM'): string {
  return `${h12}:${String(min).padStart(2, '0')} ${ap}`
}

export function TimeWheelPicker({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (display: string) => void
}) {
  const { h12, min, ap } = parseParts(value)
  return (
    <MotionConfig reducedMotion="user">
      <div
        className="flex items-center justify-center gap-1"
        style={{ perspective: '1000px' }}
        role="group"
        aria-label="Time picker"
      >
        <WheelColumn
          items={HOURS}
          value={h12 - 1}
          onChange={(i) => onChange(buildTime(HOURS[i], min, ap))}
          className="w-14"
          ariaLabel="Hour"
        />
        <span className="font-mono text-[17px] text-muted" aria-hidden="true">:</span>
        <WheelColumn
          items={MINUTES}
          value={min}
          onChange={(i) => onChange(buildTime(h12, i, ap))}
          className="w-14"
          ariaLabel="Minute"
        />
        <WheelColumn
          items={[...AMPM]}
          value={ap === 'PM' ? 1 : 0}
          onChange={(i) => onChange(buildTime(h12, min, AMPM[i]))}
          className="w-14"
          ariaLabel="AM or PM"
        />
      </div>
    </MotionConfig>
  )
}

export default TimeWheelPicker
