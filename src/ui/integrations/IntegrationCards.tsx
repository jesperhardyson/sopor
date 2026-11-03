import { BookOpen, Braces, Check, Download, HouseWifi, Server, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/lib/utils'
import { SITE } from '@/config'
import { StatusBadge } from './StatusBadge'

interface Integration {
  name: string
  icon: LucideIcon
  /** Utan märke när integrationen är släppt */
  status?: string
  soon?: boolean
  sub: string
  text: string
  points?: string[]
  link: { label: string; href: string; icon: LucideIcon; primary?: boolean }
  /** Textlänk bredvid knappen */
  more?: { label: string; href: string }
}

const INTEGRATIONS: Integration[] = [
  {
    name: 'Homey',
    icon: HouseWifi,
    status: 'Testversion',
    sub: 'Appen Sophämtning · för Homey Pro',
    text: 'Lägg till din adress i appen, så vet Homey när soporna hämtas.',
    points: [
      'Påminnelse kvällen innan, eller på morgonen',
      'Besked när schemat ändras, till exempel kring helgdagar',
      'Widget med nästa hämtning på din dashboard',
    ],
    link: { label: 'Installera i Homey', href: SITE.homeyAppUrl, icon: Download, primary: true },
  },
  {
    name: 'Home Assistant',
    icon: Server,
    sub: 'Integrationen Sophämtning · via HACS',
    text: 'Lägg till din adress i integrationen, så vet Home Assistant när soporna hämtas.',
    points: [
      'Påminnelse kvällen innan, via kalendern',
      'Nästa hämtning för varje avfallstyp',
      'Besked när schemat ändras, till exempel kring helgdagar',
    ],
    link: { label: 'Installera via HACS', href: SITE.homeAssistantUrl, icon: Download, primary: true },
  },
  {
    name: 'API',
    icon: Braces,
    sub: 'Öppet JSON-API · v1',
    text: 'Hämta schemat för en adress som JSON och bygg något eget.',
    points: ['Sök adress, hämta schema och kalender', 'Inga nycklar och inget konto', 'Fält tas aldrig bort inom v1'],
    link: { label: 'Utforska API:t', href: SITE.apiDocsUrl, icon: BookOpen },
    more: { label: 'Läs API-guiden →', href: SITE.apiGuideUrl },
  },
]

function Card({ name, icon: Icon, status, soon, sub, text, points, link, more }: Integration) {
  const id = useId()
  const LinkIcon = link.icon
  return (
    <article aria-labelledby={id} className="flex flex-1 flex-col gap-3 rounded-[20px] border border-border bg-surface p-4">
      <div className="flex items-center gap-3.5">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-surface-2 text-text">
          <Icon className="size-[22px]" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={id} className="text-base font-extrabold whitespace-nowrap text-text">
              {name}
            </h3>
            {status && <StatusBadge soon={soon}>{status}</StatusBadge>}
          </span>
          <p className="text-[13px] text-text-2">{sub}</p>
        </div>
      </div>
      <p className="text-sm leading-[1.4] text-text-2">{text}</p>
      {points && (
        <ul className="flex flex-col gap-1.5">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-2 text-sm text-text">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-text" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-3">
        <a
          href={link.href}
          rel="noopener"
          className={cn(
            'inline-flex items-center gap-2 rounded-[14px] px-4 py-3 text-[15px] font-bold',
            link.primary ? 'bg-primary text-on-primary' : 'border border-border bg-surface text-text',
          )}
        >
          <LinkIcon className="size-[18px]" aria-hidden />
          {link.label}
        </a>
        {more && (
          <a href={more.href} rel="noopener" className="text-[15px] font-extrabold text-primary">
            {more.label}
          </a>
        )}
      </div>
    </article>
  )
}

/**
 * Korten för Homey, Home Assistant och API:t. I `row` ligger alla tre sida vid sida från lg (startsidan);
 * annars ligger Homey och Home Assistant sida vid sida från md och API:t på egen rad (Om-sidan, 640 px).
 */
export function IntegrationCards({ row = false }: { row?: boolean }) {
  return (
    <div className={cn('grid w-full gap-3.5 md:gap-4', row ? 'lg:grid-cols-3' : 'md:grid-cols-2 md:[&>:last-child]:col-span-2')}>
      {INTEGRATIONS.map((integration) => (
        <Card key={integration.name} {...integration} />
      ))}
    </div>
  )
}
