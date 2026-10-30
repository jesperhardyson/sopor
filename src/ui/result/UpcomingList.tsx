import { daysBetween, formatLong, monthShort, relativeDayLabel, weekdayShort } from '@/domain/dates'
import type { PickupEvent } from '@/domain/types'
import { cn } from '@/lib/utils'
import { Deviation } from '../components/Deviation'
import { FractionChip } from '../components/FractionChip'

export function deviationExplanation(event: PickupEvent): string | undefined {
  const d = event.deviation
  if (!d) return undefined
  if (!d.originalDate) return `Ändrad tömning: ${d.reason}.`
  const { day } = formatLong(d.originalDate)
  return `Flyttad från ${weekdayShort(d.originalDate).toLowerCase()} ${day} ${monthShort(d.originalDate)} på grund av ${d.reason}.`
}

export function UpcomingList({ events, today, limit = 6 }: { events: PickupEvent[]; today: string; limit?: number }) {
  return (
    <section aria-labelledby="kommande-rubrik" className="flex flex-col gap-3 pt-3">
      <h2 id="kommande-rubrik" className="text-xl font-extrabold tracking-[-0.3px] text-text">
        Kommande tömningar
      </h2>
      <ol className="divide-y divide-border rounded-[20px] border border-border bg-surface">
        {events.slice(0, limit).map((e, i) => {
          const isNext = i === 0
          const moved = Boolean(e.deviation)
          const explanation = deviationExplanation(e)
          return (
            <li key={e.date} className="flex gap-3.5 px-4 py-3.5">
              <div
                className={cn(
                  'flex w-14 shrink-0 flex-col items-center self-start rounded-[14px] py-2',
                  isNext ? 'bg-primary text-on-primary' : moved ? 'bg-warn-bg text-warn' : 'bg-surface-2 text-text-2',
                )}
              >
                <span className="text-xs font-extrabold tracking-[0.6px]">{weekdayShort(e.date)}</span>
                <span
                  className={cn(
                    'text-[22px] leading-[1.15] font-extrabold',
                    !isNext && !moved && 'text-text',
                  )}
                >
                  {Number(e.date.slice(8))}
                </span>
                <span className="text-xs font-bold">{monthShort(e.date)}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1.5">
                {isNext && (
                  <span className="text-[13px] font-extrabold text-brand-text">
                    Nästa · {relativeDayLabel(daysBetween(today, e.date))}
                  </span>
                )}
                {moved && <Deviation />}
                {e.fractions.map((f) => (
                  <FractionChip key={f} fraction={f} />
                ))}
                {explanation && <p className="text-[13px] leading-[1.4] text-text-2">{explanation}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
