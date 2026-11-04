import { ArrowRight, CalendarSearch } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { areaForDate } from '@/domain/areas'
import { monthShort, toUtc, todayInStockholm } from '@/domain/dates'
import type { Area } from '@/domain/types'
import { ResponsiveSheet } from './ResponsiveSheet'

/** "13 okt" */
function short(date: string): string {
  return `${toUtc(date).getUTCDate()} ${monthShort(date)}`
}

function controlText(previous: string[], next: string | null): string {
  const done = previous.length === 1 ? `Tömning ${short(previous[0])}.` : `Tömningar ${previous.map(short).join(' och ')}.`
  return [done, next && `Nästa är ${short(next)}.`, 'Stämmer det? En försenad tömning kan ge fel område.'].filter(Boolean).join(' ')
}

const box = 'flex flex-col gap-2 rounded-[14px] p-4'

function NoMatch({ title, text }: { title: string; text: string }) {
  return (
    <div className={`${box} bg-earth-soft`}>
      <h3 className="text-[17px] font-extrabold text-text">{title}</h3>
      <p className="text-[15px] leading-[1.4] text-text-2">{text}</p>
    </div>
  )
}

export function AreaFinderSheet({
  open,
  onOpenChange,
  areas,
  sourceId,
  today = todayInStockholm(),
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  areas: Area[]
  sourceId: string
  today?: string
}) {
  const inputId = useId()
  const [date, setDate] = useState('')
  const result = date && date <= today ? areaForDate(date, areas) : null

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="När tömdes ditt kärl senast?"
      description="Varje hämtdag hör till ett område, så datumet visar vilket som gäller."
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-extrabold text-text">
          Senaste tömning
        </label>
        <div className="flex h-14 items-center gap-2.5 rounded-[14px] border-2 border-border bg-surface px-4 focus-within:border-primary">
          <CalendarSearch className="size-5 shrink-0 text-primary" aria-hidden />
          <input
            id={inputId}
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[17px] font-bold text-text outline-none"
          />
        </div>
      </div>
      {/* Området är alltid monterat, så att skärmläsare märker när innehållet byts. */}
      <div role="status" aria-live="polite" className="flex flex-col gap-[18px] empty:hidden">
      {date > today && <NoMatch title="Datumet har inte varit än" text="Ange dagen då kärlet senast tömdes." />}
      {result?.kind === 'found' && (
        <div className={`${box} bg-brand-soft`}>
          <p className="text-xs font-extrabold text-brand-text">Det här bör vara ditt område</p>
          <h3 className="text-xl font-extrabold text-text">{result.area.name}</h3>
          <p className="text-[15px] font-bold text-text-2">
            {result.area.day} · {result.area.label}
          </p>
          <p className="text-sm leading-[1.4] text-text-2">{controlText(result.previous, result.next)}</p>
        </div>
      )}
      {result?.kind === 'none' && (
        <NoMatch
          title="Inget område har hämtning den dagen"
          text="Hämtning sker måndag till fredag. Prova ett annat datum eller välj område i listan."
        />
      )}
      {result?.kind === 'outside' && (
        <NoMatch title="Vi har inget schema för det datumet" text="Schemat för den perioden saknas. Prova ett annat datum eller välj område i listan." />
      )}
      </div>
      <div className="flex flex-col gap-2">
        {result?.kind === 'found' && (
          <Link
            to={`/${sourceId}/${result.area.id}`}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-[14px] bg-primary text-base font-extrabold text-on-primary"
          >
            <ArrowRight className="size-5" aria-hidden />
            Visa hämtschemat
          </Link>
        )}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className={`h-12 text-base font-extrabold ${result?.kind === 'found' ? 'text-text-2' : 'text-primary'}`}
        >
          Välj område själv
        </button>
      </div>
    </ResponsiveSheet>
  )
}
