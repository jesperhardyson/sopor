import { FRACTIONS } from '@/domain/fractions'
import type { FractionId } from '@/domain/types'
import { cn } from '@/lib/utils'
import { FRACTION_CLASS, FRACTION_ICON } from './fraction-style'

export function FractionIcon({ fraction, className }: { fraction: FractionId; className?: string }) {
  const Icon = FRACTION_ICON[fraction]
  const c = FRACTION_CLASS[fraction]
  return (
    <span
      className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-[14px]', c.bg, c.fg, className)}
      title={FRACTIONS[fraction].name}
    >
      <Icon className="size-[22px]" aria-hidden />
    </span>
  )
}
