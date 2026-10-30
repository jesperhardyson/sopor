import { AlarmClock } from 'lucide-react'
import { daysBetween, formatLong, relativeDayLabel } from '@/domain/dates'
import type { PickupEvent } from '@/domain/types'
import { FractionChip } from '../components/FractionChip'
import { Deviation } from '../components/Deviation'

export function NextPickup({ event, today, note }: { event: PickupEvent; today: string; note?: string }) {
  const { weekday, day, month } = formatLong(event.date)
  return (
    <section aria-label="Nästa tömning" className="overflow-hidden rounded-3xl bg-primary text-on-primary">
      <div className="flex flex-col gap-3.5 p-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-extrabold tracking-[1.2px] uppercase opacity-85">Nästa tömning</span>
          <span className="rounded-full bg-card-overlay px-3 py-[5px] text-sm font-extrabold">
            {relativeDayLabel(daysBetween(today, event.date))}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xl font-bold opacity-90">{weekday[0].toUpperCase() + weekday.slice(1)}</span>
          <span className="text-[40px] leading-[1.05] font-extrabold tracking-[-1.2px]">
            {day} {month}
          </span>
        </div>
        {event.deviation && (
          <div>
            <Deviation />
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-0.5 pb-1">
          {event.fractions.map((f) => (
            <FractionChip key={f} fraction={f} />
          ))}
        </div>
      </div>
      {note && (
        <p className="flex items-center gap-2.5 bg-black/15 px-5 py-3.5 text-sm leading-[1.4] font-semibold">
          <AlarmClock className="size-[18px] shrink-0" aria-hidden />
          {note}
        </p>
      )}
    </section>
  )
}
