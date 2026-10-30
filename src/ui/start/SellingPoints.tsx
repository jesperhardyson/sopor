import { Bookmark, CalendarClock, CalendarDays, CalendarSync, type LucideIcon } from 'lucide-react'

const POINTS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CalendarClock, title: 'Nästa tömning', text: 'Se vilket kärl som töms härnäst och hur många dagar det är kvar.' },
  {
    icon: CalendarDays,
    title: 'Alla kommande tömningar',
    text: 'Lista och månadskalender för alla kärl, med flyttade tömningar vid helgdagar.',
  },
  {
    icon: CalendarSync,
    title: 'Direkt i din kalender',
    text: 'Prenumerera i Google eller Apple Kalender så uppdateras schemat av sig självt.',
  },
  { icon: Bookmark, title: 'Spara dina adresser', text: 'Hemma, stugan eller jobbet. Inget konto, sparas bara på din enhet.' },
]

export function SellingPoints() {
  return (
    <ul aria-label="Det här får du" className="grid gap-2.5 pt-4 sm:grid-cols-2 lg:gap-3 lg:pt-6">
      {POINTS.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex gap-3.5 rounded-[18px] border border-border bg-surface/80 p-4 backdrop-blur-sm">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="flex flex-col gap-1">
            <h3 className="text-base font-extrabold text-text">{title}</h3>
            <p className="text-sm leading-[1.4] text-text-2">{text}</p>
          </span>
        </li>
      ))}
    </ul>
  )
}
