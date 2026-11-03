import { AlarmClock } from 'lucide-react'
import { daysBetween, formatLong, monthShort, relativeDayLabel } from '@/domain/dates'
import type { PickupEvent } from '@/domain/types'
import { FractionChip } from '../components/FractionChip'
import { Deviation } from '../components/Deviation'
import { EstimatedPill } from './UpcomingList'

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1)

/** Kalenderbladet är dekoration; datumet står i klartext bredvid. */
function CalendarLeaf({ date }: { date: string }) {
  const { weekday, day } = formatLong(date)
  return (
    <div data-testid="kalenderblad" aria-hidden="true" className="relative w-[78px] shrink-0">
      <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface-2">
        <span className="bg-linear-to-b from-brand to-primary py-[5px] text-center text-xs font-extrabold tracking-[1.4px] text-on-primary uppercase">
          {monthShort(date)}
        </span>
        <span className="flex flex-col items-center pt-1 pb-2">
          <span className="font-brand text-[38px] leading-[1.05] font-semibold text-text">{day}</span>
          <span className="text-xs font-bold text-text-2">{weekday}</span>
        </span>
      </div>
      <span className="absolute -top-[5px] left-[22px] flex gap-[22px]">
        <span className="h-[13px] w-1.5 rounded-[3px] bg-text-2" />
        <span className="h-[13px] w-1.5 rounded-[3px] bg-text-2" />
      </span>
    </div>
  )
}

export function NextPickup({ event, today, note }: { event: PickupEvent; today: string; note?: string }) {
  const { weekday, day, month } = formatLong(event.date)
  return (
    <section aria-label="Nästa tömning" className="overflow-hidden rounded-3xl border border-border bg-surface">
      <div className="flex flex-col gap-4 px-5 pt-6 pb-5">
        <div className="flex items-center gap-4">
          <CalendarLeaf date={event.date} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-extrabold tracking-[1.2px] text-brand-text uppercase">Nästa tömning</span>
            <h2 className="text-[26px] leading-tight font-extrabold tracking-[-0.6px] text-text">
              {capitalize(relativeDayLabel(daysBetween(today, event.date)))}
            </h2>
            <span className="text-[15px] font-semibold text-text-2">
              {capitalize(weekday)} {day} {month}
            </span>
          </div>
        </div>
        {event.deviation && (
          <div>
            <Deviation />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {event.fractions.map((f) => (
            <FractionChip key={f} fraction={f} label={event.labels?.[f]} />
          ))}
          {event.estimated && <EstimatedPill />}
        </div>
        {event.warning && <p className="text-sm font-semibold text-warn">{event.warning}</p>}
      </div>
      {note && (
        <p className="flex items-center gap-2.5 border-t border-border px-5 py-3.5 text-[13px] leading-[1.4] font-semibold text-text-2">
          <AlarmClock className="size-4 shrink-0" aria-hidden />
          {note}
        </p>
      )}
    </section>
  )
}
