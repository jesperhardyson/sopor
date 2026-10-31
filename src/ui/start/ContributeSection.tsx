import { ArrowRight, ArrowUpRight, CircleCheck, CircleDashed, Flag, GitPullRequest, MapPinPlus, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { SITE } from '@/config'
import { SOURCES, sourceLabel } from '@/sources'
import { GitHubMark } from '../components/GitHubMark'

const WAYS: { icon: LucideIcon; title: string; text: string; href: string; tag?: string }[] = [
  {
    icon: MapPinPlus,
    title: 'Tipsa om din kommun',
    text: 'Berätta var kommunen publicerar schemat. Ingen kod behövs.',
    href: SITE.newMunicipalityIssueUrl,
  },
  {
    icon: Flag,
    title: 'Rapportera ett fel',
    text: 'Stämmer inte en tömning? Säg till, så rättar vi.',
    href: SITE.scheduleErrorIssueUrl,
  },
  {
    icon: GitPullRequest,
    title: 'Lägg in schemat själv',
    text: 'Följ guiden och öppna en pull request.',
    href: SITE.contributingUrl,
    tag: 'För utvecklare',
  },
]

const pill = 'rounded-full px-2 py-0.5 text-xs font-extrabold'

/** Kommunerna i registret och deras läge, plus "Nästa kommun". */
export function MunicipalityStatusList() {
  return (
    <ul className="flex flex-col gap-2.5">
      {SOURCES.map((m) => (
        <li key={m.id} className="flex items-center gap-2.5 text-[15px] font-extrabold text-text">
          <CircleCheck className="size-[18px] text-primary" aria-hidden />
          {sourceLabel(m)}
          {m.testData ? (
            <span className={`${pill} bg-warn-bg text-warn`}>Testdata</span>
          ) : (
            <span className={`${pill} bg-brand-soft text-brand-text`}>Finns nu</span>
          )}
        </li>
      ))}
      <li className="flex items-center gap-2.5 text-[15px] font-extrabold text-text">
        <CircleDashed className="size-[18px] text-earth" aria-hidden />
        Nästa kommun
        <span className={`${pill} bg-surface text-earth`}>Med din hjälp</span>
      </li>
    </ul>
  )
}

/** De tre sätten att bidra, med mejl som alternativ till GitHub. */
export function ContributeWays() {
  return (
    <div className="flex flex-col gap-3">
      {WAYS.map(({ icon: Icon, title, text, href, tag }) => (
        <a
          key={title}
          href={href}
          rel="noopener"
          className="flex items-center gap-3.5 rounded-[18px] border border-border bg-surface p-4 hover:border-earth"
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-earth-soft text-earth">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-base font-extrabold text-text">{title}</span>
              {tag && <span className={`${pill} bg-surface-2 text-text-2`}>{tag}</span>}
            </span>
            <span className="text-sm leading-[1.4] text-text-2">{text}</span>
          </span>
          <ArrowUpRight className="size-[18px] shrink-0 text-text-2" aria-hidden />
        </a>
      ))}
      <p className="text-[13px] text-text-2">
        Tips och felrapporter görs som ärenden på GitHub, eller mejla{' '}
        <a href={`mailto:${SITE.contactEmail}`} className="font-bold underline underline-offset-2">
          {SITE.contactEmail}
        </a>
        .
      </p>
    </div>
  )
}

export function ContributeSection() {
  return (
    <section
      aria-labelledby="bidra-rubrik"
      className="mx-auto w-full max-w-[960px] px-5 pt-10 pb-12 lg:px-0 lg:pt-0 lg:pb-24"
    >
      <div className="flex flex-col gap-7 rounded-[28px] bg-earth-soft p-6 lg:flex-row lg:gap-14 lg:rounded-[32px] lg:p-12">
        <div className="flex flex-1 flex-col gap-5">
          <p className="flex items-center gap-2 text-[13px] font-extrabold tracking-[1.4px] text-earth uppercase">
            <GitHubMark className="size-4" />
            Öppen källkod
          </p>
          <h2
            id="bidra-rubrik"
            className="text-[28px] leading-[1.15] font-extrabold tracking-[-0.8px] text-text lg:text-[34px] lg:tracking-[-0.9px]"
          >
            Saknas din kommun? Hjälp till att få in den.
          </h2>
          <p className="text-base leading-[1.55] text-text-2">
            Sopor är ett öppet hobbyprojekt. Varje kommun publicerar sitt hämtschema på sitt eget sätt, så vi lägger till
            dem en i taget. Ett tips om var schemat finns räcker långt.
          </p>
          <div className="pt-2">
            <MunicipalityStatusList />
          </div>
          <a
            href={SITE.repoUrl}
            rel="noopener"
            className="inline-flex items-center gap-1.5 self-start pt-2 text-sm font-bold text-text-2 hover:text-text"
          >
            {SITE.repoUrl.replace('https://', '')}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </div>
        <div className="flex flex-col gap-3 lg:w-[400px] lg:shrink-0">
          <ContributeWays />
          <Link to="/bidra" className="inline-flex items-center gap-1.5 self-start text-sm font-extrabold text-earth hover:underline">
            Så går det till att få in en kommun
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}
