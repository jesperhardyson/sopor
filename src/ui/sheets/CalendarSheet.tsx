import { BellRing, Braces, Calendar, CalendarDays, ChevronRight, Download, RefreshCw, type LucideIcon } from 'lucide-react'
import type { Address } from '@/domain/types'
import { absoluteIcsUrl, apiUrl, defaultOrigin, googleCalendarUrl, webcalUrl } from '@/lib/calendar-links'
import { cn } from '@/lib/utils'
import { ResponsiveSheet } from './ResponsiveSheet'

function Option({
  href,
  icon: Icon,
  title,
  description,
  best,
  download,
}: {
  href: string
  icon: LucideIcon
  title: string
  description: string
  best?: boolean
  download?: string
}) {
  return (
    <a
      href={href}
      download={download}
      target={href.startsWith('https://calendar.google.com') ? '_blank' : undefined}
      rel="noopener"
      className={cn(
        'flex items-center gap-3.5 rounded-2xl border p-3.5',
        best ? 'border-[1.5px] border-primary bg-brand-soft' : 'border-border bg-surface hover:bg-bg',
      )}
    >
      <span
        className={cn(
          'inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
          best ? 'bg-primary text-on-primary' : 'bg-surface-2 text-text',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="text-base font-extrabold text-text">{title}</span>
          {best && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-extrabold text-on-primary">Bäst</span>
          )}
        </span>
        <span className={cn('text-sm leading-[1.35]', best ? 'text-brand-text' : 'text-text-2')}>{description}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-text-2" aria-hidden />
    </a>
  )
}

export function CalendarSheet({
  open,
  onOpenChange,
  address,
  icsPath,
  origin = defaultOrigin(),
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  address: Address
  icsPath: string
  origin?: string
}) {
  const webcal = webcalUrl(absoluteIcsUrl(icsPath, origin))
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Lägg till i kalender"
      description={`Få alla tömningar för ${address.street} direkt i din kalender.`}
    >
      <div className="flex flex-col gap-2">
        <Option href={webcal} icon={RefreshCw} title="Prenumerera" description="Uppdateras automatiskt vid ändringar (webcal)" best />
        <Option href={googleCalendarUrl(webcal)} icon={Calendar} title="Google Kalender" description="Prenumerera via ditt Google-konto" />
        <Option href={webcal} icon={CalendarDays} title="Apple Kalender" description="iPhone, iPad och Mac" />
        <Option
          href={icsPath}
          icon={Download}
          title="Ladda ner .ics"
          description="En fil med kommande tömningar. Uppdateras inte."
          download={`sopor-${address.id}.ics`}
        />
        <Option href={apiUrl(address, origin)} icon={Braces} title="API (JSON)" description="För Home Assistant, Homey och andra system" />
      </div>
      <p className="flex items-start gap-2.5 rounded-[14px] bg-surface-2 px-3.5 py-3 text-sm leading-[1.4] text-text-2">
        <BellRing className="mt-0.5 size-[18px] shrink-0" aria-hidden />
        Vill du bli påmind kvällen innan? Slå på notiser för kalendern i din kalenderapp. Google och Apple stänger ofta av dem för prenumerationer.
      </p>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="h-[52px] rounded-[14px] bg-surface-2 text-base font-extrabold text-text"
      >
        Stäng
      </button>
    </ResponsiveSheet>
  )
}
