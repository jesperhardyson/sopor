import { Bookmark, CalendarCheck, CalendarClock, CalendarDays, CalendarSync, type LucideIcon } from 'lucide-react'
import { NextPickup } from '../result/NextPickup'

const BENEFITS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CalendarClock, title: 'Nästa tömning direkt', text: 'Vilket kärl, vilken dag och hur många dagar det är kvar.' },
  { icon: CalendarDays, title: 'Alla tömningar framåt', text: 'Lista och månadskalender, med flyttade tömningar vid helgdagar.' },
  {
    icon: CalendarSync,
    title: 'Schemat i din kalender',
    text: 'Prenumerera i Google, Apple eller Outlook. Ändringar kommer in av sig själva.',
  },
  { icon: Bookmark, title: 'Spara adresser', text: 'Hemma, stugan eller jobbet. Inget konto, sparas bara på din enhet.' },
]

/** Fast exempel på resultatsidan. Visas bara visuellt så att datumet inte läses upp som en riktig tömning. */
function Preview() {
  return (
    <div
      data-testid="forhandsvisning"
      aria-hidden="true"
      inert
      className="flex w-full flex-col gap-3.5 rounded-[28px] bg-brand-soft p-5 lg:w-[440px] lg:shrink-0 lg:p-8"
    >
      <NextPickup
        event={{ date: '2026-11-11', fractions: ['rest', 'mat'] }}
        today="2026-10-30"
        note="Påminnelse: ställ ut kärlen senast 06.00 på tömningsdagen."
      />
      <div className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-on-primary">
          <CalendarCheck className="size-[18px]" />
        </span>
        <span className="flex flex-col gap-px">
          <span className="text-[15px] font-extrabold text-text">Tillagd i din kalender</span>
          <span className="text-[13px] text-text-2">Uppdateras av sig själv vid ändringar</span>
        </span>
      </div>
    </div>
  )
}

export function ServicesSection() {
  return (
    <section
      aria-labelledby="tjanster-rubrik"
      className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-5 pt-12 lg:gap-10 lg:px-0 lg:pt-20 lg:pb-24"
    >
      <div className="flex flex-col gap-2 lg:gap-2.5">
        <p className="text-[13px] font-extrabold tracking-[1.4px] text-primary uppercase">Det här får du</p>
        <h2
          id="tjanster-rubrik"
          className="text-[28px] leading-[1.15] font-extrabold tracking-[-0.8px] text-text lg:max-w-[620px] lg:text-4xl lg:tracking-[-1px]"
        >
          Koll på sopdagen, utan att behöva tänka på den
        </h2>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-16">
        <Preview />
        <ul aria-label="Det här får du" className="flex flex-col gap-5 lg:gap-7">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-brand-soft text-brand-text">
                <Icon className="size-[22px]" aria-hidden />
              </span>
              <span className="flex flex-col gap-1">
                <h3 className="text-lg font-extrabold text-text">{title}</h3>
                <p className="text-[15px] leading-[1.45] text-text-2">{text}</p>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
