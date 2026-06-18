import { cn } from '../../lib/utils'
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-md bg-[rgba(255,255,255,.07)]', className)} />
)
