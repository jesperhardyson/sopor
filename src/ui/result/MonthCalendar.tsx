import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import { MONTHS, toUtc } from '@/domain/dates'
import { FRACTIONS } from '@/domain/fractions'
import { holidayOn } from '@/domain/holidays'
import { eventsInMonth } from '@/domain/schedule'
import type { FractionId, Schedule } from '@/domain/types'
import { cn } from '@/lib/utils'
import { FRACTION_CLASS, FRACTION_ICON } from '../components/fraction-style'

type YearMonth = { year: number; month: number } // month 1–12

const toIndex = (ym: YearMonth) => ym.year * 12 + ym.month - 1
const fromIndex = (i: number): YearMonth => ({ year: Math.floor(i / 12), month: (i % 12) + 1 })
const ofDate = (date: string): YearMonth => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) })

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1)

export function MonthCalendar({ schedule, initial, today }: { schedule: Schedule; initial: string; today: string }) {
  const headingId = useId()
  const first = toIndex(ofDate(schedule.events[0]?.date ?? initial))
  const last = toIndex(ofDate(schedule.events.at(-1)?.date ?? initial))
  const [index, setIndex] = useState(() => Math.min(Math.max(toIndex(ofDate(initial)), first), last))
  const { year, month } = fromIndex(index)
  const events = eventsInMonth(schedule, year, month)

  const firstWeekday = (toUtc(`${year}-${String(month).padStart(2, '0')}-01`).getUTCDay() + 6) % 7 // måndag = 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const shown = new Set<FractionId>(schedule.events.flatMap((e) => e.fractions))
  const legend = (Object.keys(FRACTIONS) as FractionId[]).filter((f) => shown.has(f))
  const navButton =
    'inline-flex size-9 items-center justify-center rounded-full border border-border text-text disabled:opacity-35'

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id={headingId} className="text-xl font-extrabold tracking-[-0.3px] text-text">
          {capitalize(MONTHS[month - 1])} {year}
        </h2>
        <div className="flex gap-2">
          <button type="button" aria-label="Föregående månad" className={navButton} disabled={index <= first} onClick={() => setIndex(index - 1)}>
            <ChevronLeft className="size-[18px]" aria-hidden />
          </button>
          <button type="button" aria-label="Nästa månad" className={navButton} disabled={index >= last} onClick={() => setIndex(index + 1)}>
            <ChevronRight className="size-[18px]" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1 rounded-[20px] border border-border bg-surface px-2.5 pt-3.5 pb-4">
        <div className="grid grid-cols-7 pb-1.5 text-center text-xs font-extrabold text-text-2" aria-hidden>
          {['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, i) => {
            if (day === null) return <span key={i} className="h-[46px]" />
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const fractions = events.get(date)
            const holiday = holidayOn(date)
            const parts = [...(fractions?.map((f) => FRACTIONS[f].name) ?? []), ...(holiday ? [holiday.name] : [])]
            const label = parts.length > 0 ? `${day} ${MONTHS[month - 1]}: ${parts.join(', ')}` : undefined
            return (
              <span
                key={i}
                aria-label={label}
                title={holiday ? holiday.name[0].toUpperCase() + holiday.name.slice(1) : undefined}
                data-holiday={holiday?.kind}
                role={label ? 'img' : undefined}
                className={cn(
                  'flex h-[46px] flex-col items-center justify-center gap-1 rounded-xl text-[15px]',
                  fractions ? 'bg-brand-soft font-extrabold' : 'font-medium',
                  holiday?.kind === 'röd' ? 'font-extrabold text-warn' : holiday ? 'text-warn/70' : 'text-text',
                  date === today && 'ring-2 ring-primary ring-inset',
                )}
              >
                <span aria-hidden={Boolean(label)}>{day}</span>
                <span className="flex h-3 gap-0.5" aria-hidden>
                  {fractions?.map((f) => {
                    const Icon = FRACTION_ICON[f]
                    return <Icon key={f} className={cn('size-3', FRACTION_CLASS[f].fg)} />
                  })}
                </span>
              </span>
            )
          })}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-2 pt-2.5">
          {legend.map((f) => {
            const Icon = FRACTION_ICON[f]
            return (
              <span key={f} className="flex items-center gap-1.5 text-[13px] font-semibold text-text-2">
                <Icon className={cn('size-3.5', FRACTION_CLASS[f].fg)} aria-hidden />
                {FRACTIONS[f].short}
              </span>
            )
          })}
        </div>
      </div>
    </section>
  )
}
