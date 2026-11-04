import type { Area } from '@/domain/types'

/** "A, B och C." */
function joinPlaces(places: string[]): string {
  if (places.length < 2) return `${places[0] ?? ''}.`
  return `${places.slice(0, -1).join(', ')} och ${places[places.length - 1]}.`
}

/** Förklarar att området valts av användaren och vad som ingår, så att man kan kontrollera valet. */
export function AreaInfo({ area, explanation }: { area: Area; explanation: string }) {
  const heading = 'text-[15px] font-extrabold text-text'
  const text = 'text-[15px] leading-[1.4] text-text-2'
  return (
    <section aria-label="Om området" className="flex flex-col gap-3 rounded-[20px] bg-brand-soft p-5">
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
    </section>
  )
}
