import { useId, useState } from 'react'
import { BellRing, Calendar, CalendarDays, ChevronRight, Download, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { DEFAULT_REMINDER, REMINDER_IDS, REMINDERS, type ReminderId } from '@/domain/reminders'
import type { Address } from '@/domain/types'
import { absoluteIcsUrl, defaultOrigin, googleCalendarUrl, isAndroid, webcalUrl } from '@/lib/calendar-links'
import { cn } from '@/lib/utils'
import { ResponsiveSheet } from './ResponsiveSheet'

function Option({
  href,
  icon: Icon,
  title,
  description,
  best,
}: {
  href: string
  icon: LucideIcon
  title: string
  description: string
  best?: boolean
}) {
  return (
    <a
      href={href}
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

const NOTIFICATIONS =
  'Slå på notiser för kalendern i din kalenderapp. Google Kalender visar troligen inte påminnelser från prenumerationer. Vill du byta tid senare tar du bort kalendern och lägger till den igen.'

/** Tiden hålls ihop på raden: "Kvällen innan, / kl. 18". */
function ReminderLabel({ text }: { text: string }) {
  const [first, time] = text.split(', ')
  return time ? <>{first}, <span className="whitespace-nowrap">{time}</span></> : text
}

function ReminderChoice({ value, onChange }: { value: ReminderId; onChange: (reminder: ReminderId) => void }) {
  const name = useId()
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-[15px] font-extrabold text-text">När vill du bli påmind?</legend>
      <div className="grid grid-cols-2 gap-2">
        {REMINDER_IDS.map((id) => {
          const checked = id === value
          return (
            <label
              key={id}
              className={cn(
                'flex min-h-14 cursor-pointer items-center gap-2.5 rounded-[14px] border px-3 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                checked ? 'border-[1.5px] border-primary bg-brand-soft' : 'border-border bg-surface hover:bg-bg',
              )}
            >
              <input type="radio" name={name} checked={checked} onChange={() => onChange(id)} className="sr-only" />
              <span
                className={cn(
                  'inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]',
                  checked ? 'border-primary bg-primary' : 'border-border bg-surface',
                )}
                aria-hidden
              >
                {checked && <span className="size-2 rounded-full bg-on-primary" />}
              </span>
              <span className={cn('min-w-0 text-sm leading-[1.25] font-bold', checked ? 'text-brand-text' : 'text-text')}>
                <ReminderLabel text={REMINDERS[id].label} />
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Ligger inuti arket, som avmonteras när det stängs, så valet börjar om varje gång det öppnas. */
function CalendarContent({
  onClose,
  icsUrl,
  origin,
  notice,
  findTo,
  findState,
}: {
  onClose: () => void
  icsUrl: (reminder: ReminderId) => string
  origin: string
  notice?: { title: string; text: string }
  findTo?: string
  findState?: unknown
}) {
  const [reminder, setReminder] = useState<ReminderId>(DEFAULT_REMINDER)
  const path = icsUrl(reminder)
  const webcal = webcalUrl(absoluteIcsUrl(path, origin))
  // Android har ingen app för webcal, så där går prenumerationen via Google Kalender.
  const subscribe = isAndroid() ? googleCalendarUrl(webcal) : webcal
  return (
    <>
      {notice && (
        <div className="flex gap-3 rounded-[14px] bg-warn-bg px-4 py-3.5 text-warn">
          <TriangleAlert className="size-[22px] shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-col items-start gap-1">
            <h3 className="text-[15px] font-extrabold">{notice.title}</h3>
            <p className="text-sm leading-[1.4]">{notice.text}</p>
            {findTo && (
              <Link to={findTo} state={findState} className="text-sm font-extrabold underline">
                Kontrollera med din senaste tömning
              </Link>
            )}
          </div>
        </div>
      )}
      <ReminderChoice value={reminder} onChange={setReminder} />
      <div className="flex flex-col gap-2">
        <Option href={subscribe} icon={RefreshCw} title="Prenumerera" description="Uppdateras automatiskt vid ändringar (webcal)" best />
        <Option href={googleCalendarUrl(webcal)} icon={Calendar} title="Google Kalender" description="Prenumerera via ditt Google-konto" />
        <Option href={webcal} icon={CalendarDays} title="Apple Kalender" description="iPhone, iPad och Mac" />
        <Option
          href={path}
          icon={Download}
          title="Ladda ner .ics"
          description="En fil med kommande tömningar. Uppdateras inte."
        />
      </div>
      <p className="flex items-start gap-2.5 rounded-[14px] bg-surface-2 px-3.5 py-3 text-sm leading-[1.4] text-text-2">
        <BellRing className="mt-0.5 size-[18px] shrink-0" aria-hidden />
        {`${REMINDERS[reminder].sentence} ${NOTIFICATIONS}`}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="h-[52px] rounded-[14px] bg-surface-2 text-base font-extrabold text-text"
      >
        Stäng
      </button>
    </>
  )
}

export function CalendarSheet({
  open,
  onOpenChange,
  address,
  icsUrl,
  origin = defaultOrigin(),
  notice,
  findTo,
  findState,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  address: Address
  icsUrl: (reminder: ReminderId) => string
  origin?: string
  /** Källor med områdesval: varningen att området är användarens eget val */
  notice?: { title: string; text: string }
  /** Vart "Kontrollera med din senaste tömning" leder */
  findTo?: string
  findState?: unknown
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Lägg till i kalender"
      description={`Få alla tömningar för ${address.street} direkt i din kalender.`}
    >
      <CalendarContent
        onClose={() => onOpenChange(false)}
        icsUrl={icsUrl}
        origin={origin}
        notice={notice}
        findTo={findTo}
        findState={findState}
      />
    </ResponsiveSheet>
  )
}
