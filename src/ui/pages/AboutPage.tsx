import { ArrowLeft, ArrowUpRight, Ban, Braces, ChevronDown, Mail, MapPin, Smartphone, UserX, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { clearSaved, loadSaved } from '@/lib/storage'
import { GitHubMark } from '../components/GitHubMark'
import { ForgetAll } from '../saved/ForgetAll'
import { Link } from 'react-router'
import { SITE } from '@/config'
import { SOURCES, sourceLabel, type Source } from '@/sources'
import { providerFor } from '@/providers/registry'
import { formatLong } from '@/domain/dates'

const FACTS: [LucideIcon, string][] = [
  [UserX, 'Inget konto eller inloggning'],
  [Smartphone, 'Adresser sparas bara på din enhet'],
  [Ban, 'Ingen reklam och inga spårningscookies'],
]

const h2 = 'text-xl font-extrabold tracking-[-0.3px] text-text'
const body = 'text-[15px] leading-normal text-text-2'

function SourceRow({ m }: { m: Source }) {
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  useEffect(() => {
    // Live-källor (EDP) har inget datadatum: de hämtas direkt från källan.
    if (m.config.system !== 'static') return
    let active = true
    providerFor(m)
      .dataUpdatedAt()
      .then((d) => active && setUpdatedAt(d), () => {})
    return () => {
      active = false
    }
  }, [m])
  const fetched = updatedAt && `Hämtat ${formatLong(updatedAt).day} ${formatLong(updatedAt).month.slice(0, 3)}`
  // "Örebro kommun · Örebro kommun" säger inget nytt.
  const meta = [sourceLabel(m) !== m.name && sourceLabel(m), fetched].filter(Boolean)

  return (
    <li>
      <a href={m.url} rel="noopener" className="flex items-start gap-3 px-4 py-3 hover:bg-bg">
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-extrabold text-primary">{m.name}</span>
          {meta.length > 0 && (
            <span className="text-[13px] leading-[1.35] text-text-2">
              {meta.map((text, i) => (
                <span key={i}>
                  {i > 0 && <span aria-hidden> · </span>}
                  {text}
                </span>
              ))}
            </span>
          )}
        </span>
        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      </a>
    </li>
  )
}

/** Källor som visas innan resten fälls ihop. */
const SOURCES_SHOWN = 5

function SourceList() {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const sorted = [...SOURCES].sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  // En ensam dold källa visas hellre än en knapp som säger "Visa alla 6 källor".
  const collapsible = sorted.length > SOURCES_SHOWN + 1
  const shown = open || !collapsible ? sorted : sorted.slice(0, SOURCES_SHOWN)
  return (
    <>
      <ul id={listId} aria-label="Källor" className="divide-y divide-border overflow-hidden rounded-[20px] border border-border bg-surface">
        {shown.map((m) => (
          <SourceRow key={m.id} m={m} />
        ))}
      </ul>
      {collapsible && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 self-start text-sm font-extrabold text-primary hover:underline"
        >
          {open ? 'Visa färre källor' : `Visa alla ${sorted.length} källor`}
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      )}
    </>
  )
}

export function AboutPage() {
  const [savedCount, setSavedCount] = useState(() => loadSaved().length)
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
        <p className={body}>
          Schemat hämtas från kommunens eller avfallsbolagets egna uppgifter: hämtschema, kärltyper och ändrade tömningar.
        </p>
        <SourceList />
        <p className="text-[13px] leading-normal text-text-2">
          Gatu- och ortnamn som används för att hitta rätt källa kommer från{' '}
          <a href="https://www.openstreetmap.org/copyright" rel="noopener" className="font-bold underline underline-offset-2">
            © OpenStreetMaps bidragsgivare
          </a>{' '}
          (ODbL). Datum markerade <em>beräknat</em> är framräknade ur kommunens tömningsintervall och kan flyttas vid helgdagar.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={h2}>Integritet</h2>
        <p className={body}>
          Sparade adresser och namn som ”Hemma” lagras bara i din webbläsare. Vi har inga konton och samlar inte in
          personuppgifter. Rensar du webbläsaren försvinner de. Vi räknar besök anonymt med Vercel Web Analytics, utan
          cookies. Adresser du söker på skickas inte med.
        </p>
        {savedCount > 0 ? (
          <ForgetAll
            label={`Glöm sparade adresser (${savedCount})`}
            onConfirm={() => setSavedCount(clearSaved().length)}
          />
        ) : (
          <p className="text-sm text-text-2">Inga adresser sparade på den här enheten.</p>
        )}
      </section>

      <section className="flex flex-col items-start gap-3">
        <h2 className={h2}>Bidra</h2>
        <p className={body}>
          Sopor är öppen källkod. Saknar du din kommun kan du hjälpa till att lägga in den, rätta fel eller föreslå
          förbättringar på GitHub.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/bidra"
            className="inline-flex items-center gap-2 rounded-[14px] bg-primary px-4 py-3 text-[15px] font-bold text-on-primary"
          >
            Så bidrar du
          </Link>
          <a
            href={SITE.repoUrl}
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-3 text-[15px] font-bold text-text"
          >
            <GitHubMark className="size-[18px]" />
            Sopor på GitHub
          </a>
        </div>
      </section>

      <section className="flex flex-col items-start gap-3">
        <h2 className={h2}>API</h2>
        <p className={body}>
          Sopor har ett öppet API som Home Assistant, Homey och andra system kan läsa. Inga nycklar och ingen inloggning.
        </p>
        <a
          href={SITE.apiGuideUrl}
          rel="noopener"
          className="inline-flex items-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-3 text-[15px] font-bold text-text"
        >
          <Braces className="size-[18px]" aria-hidden />
          Läs API-guiden
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
