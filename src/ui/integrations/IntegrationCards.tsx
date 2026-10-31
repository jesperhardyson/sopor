import { BookOpen, Check, Download, HouseWifi, Server, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/lib/utils'
import { SITE } from '@/config'
import { StatusBadge } from './StatusBadge'

interface Integration {
  name: string
  icon: LucideIcon
  status: string
  soon?: boolean
  sub: string
  text: string
  points?: string[]
  link: { label: string; href: string; icon: LucideIcon; primary?: boolean }
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
    status: 'Kommer snart',
    soon: true,
    sub: 'Integration via HACS',
    text: 'En integration med sensorer och kalender är på väg. Tills dess kan du läsa schemat med en REST-sensor.',
    link: { label: 'Så gör du i dag', href: SITE.homeAssistantGuideUrl, icon: BookOpen },
  },
]

function Card({ name, icon: Icon, status, soon, sub, text, points, link }: Integration) {
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
            <StatusBadge soon={soon}>{status}</StatusBadge>
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
      <a
        href={link.href}
        rel="noopener"
        className={cn(
          'mt-auto inline-flex items-center gap-2 self-start rounded-[14px] px-4 py-3 text-[15px] font-bold',
          link.primary ? 'bg-primary text-on-primary' : 'border border-border bg-surface text-text',
        )}
      >
        <LinkIcon className="size-[18px]" aria-hidden />
        {link.label}
      </a>
    </article>
  )
}

/** Om-sidans kort för Homey och Home Assistant. Sida vid sida från md. */
export function IntegrationCards() {
  return (
    <div className="flex w-full flex-col gap-3.5 md:flex-row md:items-stretch md:gap-4">
      {INTEGRATIONS.map((integration) => (
        <Card key={integration.name} {...integration} />
      ))}
    </div>
  )
}
