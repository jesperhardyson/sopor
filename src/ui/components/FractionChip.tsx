import { FRACTIONS } from '@/domain/fractions'
import type { FractionId } from '@/domain/types'
import { cn } from '@/lib/utils'
import { FRACTION_CLASS, FRACTION_ICON } from './fraction-style'

export function FractionChip({
  fraction,
  size = 'md',
  label,
}: {
  fraction: FractionId
  size?: 'sm' | 'md'
  /** Källans egen text, t.ex. "Fyrfack 1" */
  label?: string
}) {
  const Icon = FRACTION_ICON[fraction]
  const c = FRACTION_CLASS[fraction]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2 font-bold',
        size === 'sm' ? 'text-[13px]' : 'text-sm',
        c.bg,
        c.fg,
      )}
    >
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden />
      {label ?? FRACTIONS[fraction].name}
    </span>
  )
}
