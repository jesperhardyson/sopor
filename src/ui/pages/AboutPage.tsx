import { ArrowLeft, ArrowUpRight, Ban, Mail, MapPin, Smartphone, UserX, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { GitHubMark } from '../components/GitHubMark'
import { Link } from 'react-router'
import { SITE } from '@/config'
import { MUNICIPALITIES, type Municipality } from '@/municipalities'
import { providerFor } from '@/providers/registry'
import { formatLong } from '@/domain/dates'

const FACTS: [LucideIcon, string][] = [
  [UserX, 'Inget konto eller inloggning'],
  [Smartphone, 'Adresser sparas bara på din enhet'],
  [Ban, 'Ingen reklam och inga spårningscookies'],
]

const h2 = 'text-xl font-extrabold tracking-[-0.3px] text-text'
const body = 'text-[15px] leading-normal text-text-2'

function SourceCard({ m }: { m: Municipality }) {
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    providerFor(m)
      .dataUpdatedAt()
      .then((d) => active && setUpdatedAt(d), () => {})
    return () => {
      active = false
    }
  }, [m])
  const fetched = updatedAt && `Hämtat ${formatLong(updatedAt).day} ${formatLong(updatedAt).month.slice(0, 3)}`

  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-surface">
      <div className="flex items-center justify-between bg-surface-2 px-4 py-3.5">
        <span className="flex items-center gap-2 text-[15px] font-extrabold text-text">
          <MapPin className="size-4 text-primary" aria-hidden />
          {m.name}
        </span>
        {fetched && <span className="text-[13px] text-text-2">{fetched}</span>}
      </div>
      <a href={m.operator.url} rel="noopener" className="flex items-center gap-3 px-4 py-3.5 hover:bg-bg">
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-base font-extrabold text-primary">{m.operator.name}</span>
          <span className="text-sm leading-[1.35] text-text-2">Hämtschema, kärltyper och ändrade tömningar</span>
        </span>
        <ArrowUpRight className="size-[18px] text-primary" aria-hidden />
      </a>
    </div>
  )
}

export function AboutPage() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-9 px-5 pt-1 pb-10 md:px-0 md:pt-6 md:pb-20">
      <div className="flex flex-col gap-3">
        <Link to="/" className="inline-flex items-center gap-1.5 self-start py-1.5 text-[15px] font-extrabold text-primary">
          <ArrowLeft className="size-[18px]" aria-hidden />
          Tillbaka
        </Link>
        <h1 className="text-[34px] font-extrabold tracking-[-0.8px] text-text">Om Sopor</h1>
        <p className="text-[17px] leading-[1.45] text-text-2">
          Ett enkelt sätt att se när kärlen töms. Byggt för att användas en gång i veckan, kvällen innan sopdags.
        </p>
        <ul className="flex flex-col gap-2.5 pt-2">
          {FACTS.map(([Icon, text]) => (
            <li key={text} className="flex items-center gap-2.5 text-[15px] font-bold text-text">
              <span className="inline-flex size-8 items-center justify-center rounded-[10px] bg-brand-soft text-brand-text">
                <Icon className="size-4" aria-hidden />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className={h2}>Källor</h2>
        <p className={body}>Schemat hämtas från kommunens egna uppgifter. Varje kommun har sina källor.</p>
        {MUNICIPALITIES.map((m) => (
          <SourceCard key={m.id} m={m} />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={h2}>Integritet</h2>
        <p className={body}>
          Sparade adresser och namn som ”Hemma” lagras bara i din webbläsare. Vi har inga konton och samlar inte in
          personuppgifter. Rensar du webbläsaren försvinner de. Vi räknar besök anonymt med Vercel Web Analytics, utan
          cookies. Adresser du söker på skickas inte med.
        </p>
      </section>

      <section className="flex flex-col items-start gap-3">
        <h2 className={h2}>Bidra</h2>
        <p className={body}>
          Sopor är öppen källkod. Saknar du din kommun kan du hjälpa till att lägga in den, rätta fel eller föreslå
          förbättringar på GitHub.
        </p>
        <a
          href={SITE.repoUrl}
          rel="noopener"
          className="inline-flex items-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-3 text-[15px] font-bold text-text"
        >
          <GitHubMark className="size-[18px]" />
          Sopor på GitHub
        </a>
      </section>

      <section className="flex flex-col items-start gap-3">
        <h2 className={h2}>Kontakt</h2>
        <p className={body}>Hittat ett fel i schemat eller saknar din kommun? Hör gärna av dig.</p>
        <a
          href={`mailto:${SITE.contactEmail}`}
          className="inline-flex items-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-3 text-[15px] font-bold text-text"
        >
          <Mail className="size-[18px]" aria-hidden />
          Skriv till oss
        </a>
      </section>

      <section className="flex flex-col gap-1.5 border-t border-border pt-5">
        <h2 className="text-[13px] font-extrabold text-text-2">Friskrivning</h2>
        <p className="text-[13px] leading-normal text-text-2">
          Sopor är en inofficiell tjänst och är inte kopplad till någon kommun eller något avfallsbolag. Vi gör vårt
          bästa för att uppgifterna ska stämma men kan inte garantera att de är korrekta eller aktuella. Vid avvikelser
          gäller alltid kommunens information. Sopor ansvarar inte för följder av felaktiga uppgifter, till exempel en
          missad tömning.
        </p>
      </section>
    </div>
  )
}
