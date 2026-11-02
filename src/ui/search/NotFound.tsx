import { MapPin, SearchX } from 'lucide-react'
import { Link } from 'react-router'
import { streetAndLocality } from '@/domain/address'
import type { Address } from '@/domain/types'
import { cn } from '@/lib/utils'
import { supportedKommuner } from '@/sources'

export function NotFound({ suggestions, className }: { suggestions: Address[]; className?: string }) {
  return (
    <div role="status" className={cn('flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5', className)}>
      <div className="flex items-start gap-3.5">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-earth-soft text-earth">
          <SearchX className="size-6" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-xl font-extrabold tracking-[-0.3px] text-text">Vi hittade inte adressen</h2>
          <p className="text-[15px] leading-[1.45] text-text-2">
            Kolla stavningen och prova utan port eller lägenhetsnummer, till exempel ”Storgatan 12”.
          </p>
        </div>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm font-bold text-text-2">Menade du:</p>
          {suggestions.map((s) => (
            <Link
              key={`${s.sourceId}/${s.id}`}
              to={`/${s.sourceId}/${s.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-[15px] font-extrabold text-brand-text"
            >
              <MapPin className="size-4" aria-hidden />
              {streetAndLocality(s)}
            </Link>
          ))}
        </div>
      )}
      <p className="border-t border-border pt-3.5 text-sm font-semibold text-text-2">
        Sopor finns i {supportedKommuner().length} kommuner. Saknas din?{' '}
        <Link to="/bidra" className="font-extrabold text-brand-text underline underline-offset-2">
          Tipsa om din kommun
        </Link>
      </p>
    </div>
  )
}
