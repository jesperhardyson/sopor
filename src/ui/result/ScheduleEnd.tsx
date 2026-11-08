import { CalendarClock } from 'lucide-react'
import { formatFull } from '@/domain/dates'

/** Under kommande tömningar: hur långt schemat gäller och, i mindre text, hur källan publicerar det. */
export function ScheduleValidity({ until, reason }: { until: string; reason?: string }) {
  return (
    <div className="-mt-2 flex flex-col gap-1 px-1">
      <p className="text-[15px] text-text-2">Schemat gäller till {formatFull(until)}.</p>
      {reason && <p className="text-[13px] leading-[1.4] text-text-2">{reason}</p>}
    </div>
  )
}

/** Förklaringen står redan under kommande tömningar, så rutan upprepar den inte. */
export function ScheduleEndingNotice({ sourceName }: { sourceName: string }) {
  return (
    <div role="status" className="flex gap-3 rounded-[14px] bg-warn-bg px-4 py-3.5 text-warn">
      <CalendarClock className="size-[22px] shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-[15px] font-extrabold">Schemat tar snart slut</h2>
        <p className="text-sm leading-[1.4]">Nya tider visas här när {sourceName} publicerar dem.</p>
      </div>
    </div>
  )
}
