import { Link } from 'react-router'
import type { KommunSummary } from '@/data/kommun-pages'
import { BackLink, KommunColumn } from './KommunContent'

/** Översikten över alla kommuner, både i appen och i den statiska HTML-filen. */
export function KommunerContent({ kommuner }: { kommuner: KommunSummary[] }) {
  const covered = kommuner.filter((k) => k.covered)
  const missing = kommuner.filter((k) => !k.covered)
  return (
    <KommunColumn>
      <BackLink to="/">Startsidan</BackLink>
      <div className="flex flex-col gap-2.5">
        <h1 className="text-[34px] leading-[1.1] font-extrabold tracking-[-0.8px] text-text md:text-[44px]">Sophämtning i Sveriges kommuner</h1>
        <p className="text-[17px] leading-[1.45] text-text-2">
          Sopor finns i {covered.length} av Sveriges {kommuner.length} kommuner, och fler kommer.
        </p>
      </div>
      <KommunList title={`Här finns Sopor (${covered.length})`} kommuner={covered} linkClass="font-bold text-primary" />
      <KommunList title={`Inte än (${missing.length})`} kommuner={missing} linkClass="text-text-2" />
    </KommunColumn>
  )
}

function KommunList({ title, kommuner, linkClass }: { title: string; kommuner: KommunSummary[]; linkClass: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-extrabold text-text">{title}</h2>
      <ul className="columns-2 gap-4">
        {kommuner.map((k) => (
          <li key={k.slug} className="break-inside-avoid py-1 text-[15px]">
            <Link to={`/kommuner/${k.slug}`} className={linkClass}>
              {k.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
