import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { KommunPage } from '@/data/kommun-pages'
import { FractionIcon } from '../components/FractionIcon'

const HERO_FRACTIONS = ['rest', 'mat', 'papper', 'plast'] as const
const h1 = 'text-[34px] leading-[1.1] font-extrabold tracking-[-0.8px] text-text md:text-[44px]'
const h2 = 'text-xl font-extrabold text-text'
const body = 'text-[15px] leading-[1.45] text-text-2'
const lede = 'text-[17px] leading-[1.45] text-text-2'
const link = 'inline-flex items-center gap-1.5 self-start text-[15px] font-bold text-primary'

export function KommunColumn({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[640px] flex-col gap-8 px-5 pt-7 pb-12 md:px-0 md:pt-14">{children}</div>
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-primary">
      <ArrowLeft className="size-4" aria-hidden />
      {children}
    </Link>
  )
}

export function AllKommunerLink() {
  return (
    <Link to="/kommuner" className={link}>
      Se alla kommuner
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  )
}

/** Kommunsidans innehåll, både i appen och i den statiska HTML-filen. Därför bara props, ingen webbläsare. */
export function KommunContent({ page, search }: { page: KommunPage; search: ReactNode }) {
  return (
    <KommunColumn>
      <BackLink to="/">Startsidan</BackLink>
      {page.covered ? <Covered page={page} search={search} /> : <Missing page={page} />}
      {page.orter.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className={h2}>Orter i kommunen</h2>
          <p className={body}>{page.orter.join(', ')}</p>
        </section>
      )}
      <AllKommunerLink />
    </KommunColumn>
  )
}

function Covered({ page, search }: { page: KommunPage; search: ReactNode }) {
  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex gap-2" aria-hidden>
          {HERO_FRACTIONS.map((f) => (
            <FractionIcon key={f} fraction={f} className="size-9 rounded-[11px] [&_svg]:size-[18px]" />
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          <h1 className={h1}>Sophämtning i {page.name}</h1>
          <p className={lede}>Skriv in din adress så ser du när dina kärl töms. Lägg schemat i kalendern, så slipper du hålla reda på det.</p>
        </div>
        {search}
      </div>
      <section className="flex flex-col gap-2.5">
        <h2 className={h2}>Varifrån kommer schemat?</h2>
        <p className={body}>
          Schemat för {page.name} hämtas från {page.sources.map((s) => s.name).join(' och ')}. Sopor är en inofficiell tjänst, och vid tveksamhet gäller deras uppgifter.
        </p>
        {page.sources.map((s) => (
          <a key={s.url} href={s.url} rel="noopener" className={link}>
            {s.name}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ))}
      </section>
    </>
  )
}

function Missing({ page }: { page: KommunPage }) {
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h1 className={h1}>Sophämtning i {page.name}</h1>
        <p className={lede}>Sopor finns inte i {page.name} än. Tills dess hittar du hämtschemat hos kommunen eller avfallsbolaget.</p>
      </div>
      <section className="flex flex-col gap-3 rounded-2xl bg-earth-soft p-5">
        <h2 className="text-lg font-extrabold text-text">Hjälp till att få in kommunen</h2>
        <p className={body}>Berätta var kommunen publicerar sitt hämtschema, så kan vi lägga in den.</p>
        <Link to="/bidra" className="inline-flex items-center gap-1.5 self-start text-[15px] font-extrabold text-earth">
          Tipsa om din kommun
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    </>
  )
}
