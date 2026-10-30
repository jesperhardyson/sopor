import { MapPin, SearchX } from 'lucide-react'
import { Link } from 'react-router'
import type { Address } from '@/domain/types'

export function NotFound({ suggestions }: { suggestions: Address[] }) {
  return (
    <div role="status" className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-earth-soft text-earth">
        <SearchX className="size-6" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-extrabold tracking-[-0.3px] text-text">Vi hittade inte adressen</h2>
        <p className="text-[15px] leading-[1.45] text-text-2">
          Kolla stavningen och prova utan port eller lägenhetsnummer, till exempel ”Storgatan 12”.
        </p>
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
              {s.street}, {s.locality}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
