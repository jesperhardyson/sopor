import { ChevronDown } from 'lucide-react'
import type { Area } from '@/domain/types'

/** "A, B och C." */
function joinPlaces(places: string[]): string {
  if (places.length < 2) return `${places[0] ?? ''}.`
  return `${places.slice(0, -1).join(', ')} och ${places[places.length - 1]}.`
}

/**
 * Förklarar att området valts av användaren och vad som ingår, så att man kan kontrollera valet. Ihopfälld,
 * eftersom man redan läst om området när man valde det och schemat ska synas först.
 */
export function AreaInfo({ area, explanation }: { area: Area; explanation: string }) {
  const heading = 'text-[15px] font-extrabold text-text'
  const text = 'text-[15px] leading-[1.4] text-text-2'
  const name = `Om ${area.label ?? 'området'}`
  return (
    <details aria-label={name} className="group rounded-[20px] bg-brand-soft">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={heading}>{name}</span>
          <span className="text-sm text-text-2">
            {area.otherDays.length > 0 ? 'Platser som ingår och gator med annan hämtdag' : 'Platser som ingår i området'}
          </span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-text-2 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-3 px-5 pb-5">
        <div className="flex flex-col gap-1">
          <h2 className={heading}>Du har valt området själv</h2>
          <p className={text}>{`${explanation} Jämför gärna med din senaste tömning.`}</p>
        </div>
        {area.places.length > 0 && (
          <div className="flex flex-col gap-1">
            <h2 className={heading}>Ingår i området</h2>
            <p className={text}>{joinPlaces(area.places)}</p>
          </div>
        )}
        {area.otherDays.length > 0 && (
          <div className="flex flex-col gap-1">
            <h2 className={heading}>Vissa gator har en annan hämtdag</h2>
            {area.otherDays.map((line) => (
              <p key={line} className={text}>
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </details>
  )
}
