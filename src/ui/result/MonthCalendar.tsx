import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import { formatLong, formatShort, MONTHS, toUtc } from '@/domain/dates'
import { FRACTIONS } from '@/domain/fractions'
import { holidayOn } from '@/domain/holidays'
import { eventsInMonth } from '@/domain/schedule'
import type { FractionId, PickupEvent, Schedule } from '@/domain/types'
import { cn } from '@/lib/utils'
import { Deviation } from '../components/Deviation'
import { FractionChip } from '../components/FractionChip'
import { FRACTION_CLASS, FRACTION_ICON } from '../components/fraction-style'
import { ResponsiveSheet } from '../sheets/ResponsiveSheet'
import { deviationExplanation, EstimatedPill } from './UpcomingList'

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
  const byDate = new Map(schedule.events.map((e) => [e.date, e]))
  // Dagen ligger kvar när arket stängs, så att innehållet inte försvinner under animationen.
  const [selected, setSelected] = useState<PickupEvent | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const firstWeekday = (toUtc(`${year}-${String(month).padStart(2, '0')}-01`).getUTCDay() + 6) % 7 // måndag = 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const shown = new Set<FractionId>(schedule.events.flatMap((e) => e.fractions))
  const legend = (Object.keys(FRACTIONS) as FractionId[]).filter((f) => shown.has(f))
  // Samma namn som etiketterna när källan har ett eget (t.ex. "Hushåll" för kärl).
  const legendName = (f: FractionId) => schedule.events.find((e) => e.labels?.[f])?.labels?.[f] ?? FRACTIONS[f].short
  // Rundeln är 36 px som i designen, tryckytan 44 px.
  const navButton =
    'relative inline-flex size-9 items-center justify-center rounded-full border border-border text-text after:absolute after:-inset-1 disabled:opacity-35'

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
            const cell = cn(
              'flex h-[46px] flex-col items-center justify-center gap-1 rounded-xl text-[15px]',
              fractions ? 'bg-brand-soft font-extrabold' : 'font-medium',
              holiday?.kind === 'röd' ? 'font-extrabold text-warn' : holiday ? 'text-warn/70' : 'text-text',
              date === today && 'ring-2 ring-primary ring-inset',
            )
            const content = (
              <>
                <span aria-hidden={Boolean(label)}>{day}</span>
                <span className="flex h-3 items-center gap-0.5" aria-hidden>
                  {fractions && <DayIcons fractions={fractions} />}
                </span>
              </>
            )
            const event = byDate.get(date)
            if (!event) {
              return (
                <span
                  key={i}
                  aria-label={label}
                  title={holiday ? capitalize(holiday.name) : undefined}
                  data-holiday={holiday?.kind}
                  role={label ? 'img' : undefined}
                  className={cell}
                >
                  {content}
                </span>
              )
            }
            return (
              <span key={i} className="group relative">
                <button
                  type="button"
                  aria-label={label}
                  aria-haspopup="dialog"
                  data-holiday={holiday?.kind}
                  onClick={() => {
                    setSelected(event)
                    setSheetOpen(true)
                  }}
                  className={cn(cell, 'w-full cursor-pointer outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary')}
                >
                  {content}
                </button>
                <DayCard event={event} holiday={holiday?.name} column={i % 7} />
              </span>
            )
          })}
        </div>
        <div data-testid="forklaring" className="mt-1 flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-2 pt-2.5">
          {legend.map((f) => {
            const Icon = FRACTION_ICON[f]
            return (
              <span key={f} className="flex items-center gap-1.5 text-[13px] font-semibold text-text-2">
                <Icon className={cn('size-3.5', FRACTION_CLASS[f].fg)} aria-hidden />
                {legendName(f)}
              </span>
            )
          })}
        </div>
      </div>
      {selected && (
        <DaySheet event={selected} holiday={holidayOn(selected.date)?.name} open={sheetOpen} onOpenChange={setSheetOpen} />
      )}
    </section>
  )
}

/** Allt som töms en dag, som kort när man hovrar eller tabbar till dagen (desktop). */
function DayCard({ event, holiday, column }: { event: PickupEvent; holiday?: string; column: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute bottom-full z-10 mb-2 hidden w-max max-w-[260px] flex-col gap-2 rounded-2xl border border-border bg-surface-2 p-3 text-left shadow-[0_12px_32px_#1B231F1F]',
        'group-hover:flex group-has-focus-visible:flex',
        // Kanterna i veckan: lägg kortet inåt så att det inte sticker ut ur kalendern.
        column < 2 ? 'left-0' : column > 4 ? 'right-0' : 'left-1/2 -translate-x-1/2',
      )}
    >
      <span className="text-[13px] font-extrabold text-text-2">
        {formatShort(event.date)}
        {holiday && ` · ${holiday}`}
      </span>
      <span className="flex flex-wrap gap-1.5">
        {event.fractions.map((f) => (
          <FractionChip key={f} fraction={f} size="sm" label={event.labels?.[f]} />
        ))}
      </span>
    </span>
  )
}

/** Samma dag som ark, för den som trycker (mobil) eller klickar. */
function DaySheet({
  event,
  holiday,
  open,
  onOpenChange,
}: {
  event: PickupEvent
  holiday?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { weekday, day, month } = formatLong(event.date)
  const explanation = deviationExplanation(event)
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${capitalize(weekday)} ${day} ${month}`}
      description={holiday ? `${capitalize(holiday)}. Det här töms den dagen.` : 'Det här töms den dagen.'}
    >
      <div className="flex flex-col items-start gap-2">
        {event.deviation && <Deviation />}
        <div className="flex flex-wrap gap-2">
          {event.fractions.map((f) => (
            <FractionChip key={f} fraction={f} label={event.labels?.[f]} />
          ))}
        </div>
        {event.estimated && <EstimatedPill />}
        {explanation && <p className="text-[13px] leading-[1.4] text-text-2">{explanation}</p>}
        {event.warning && <p className="text-[13px] leading-[1.4] font-semibold text-warn">{event.warning}</p>}
      </div>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="h-[52px] rounded-[14px] bg-surface-2 text-base font-extrabold text-text"
      >
        Stäng
      </button>
    </ResponsiveSheet>
  )
}

/** Får det inte plats fler än tre ikoner i en dagruta (mobil): visa två och "+N". */
function DayIcons({ fractions }: { fractions: FractionId[] }) {
  const shown = fractions.length > 3 ? fractions.slice(0, 2) : fractions
  const more = fractions.length - shown.length
  return (
    <>
      {shown.map((f) => {
        const Icon = FRACTION_ICON[f]
        return <Icon key={f} className={cn('size-3 max-[359px]:size-2.5', FRACTION_CLASS[f].fg)} />
      })}
      {more > 0 && <span className="text-[10px] leading-none font-extrabold text-text-2">+{more}</span>}
    </>
  )
}
