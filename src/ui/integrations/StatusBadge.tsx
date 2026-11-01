import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** "Testversion" i brandets grönt, "Kommer snart" neutralt. `onSurface2` är den mindre varianten i adressrutans rader. */
export function StatusBadge({ soon, onSurface2, children }: { soon?: boolean; onSurface2?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full font-extrabold whitespace-nowrap',
        onSurface2 ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
        soon ? cn('text-text-2', onSurface2 ? 'bg-surface' : 'bg-surface-2') : 'bg-brand-soft text-brand-text',
      )}
    >
      {children}
    </span>
  )
}
