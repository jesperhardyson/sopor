import { ArrowLeft, Bookmark, CalendarPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { todayInStockholm } from '@/domain/dates'
import { nextPickup, upcoming } from '@/domain/schedule'
import type { Address } from '@/domain/types'
import { findSaved } from '@/lib/storage'
import { getSource, type Source } from '@/sources'
import { providerFor } from '@/providers/registry'
import { useSchedule } from '../hooks/useSchedule'
import { MonthCalendar } from '../result/MonthCalendar'
import { NextPickup } from '../result/NextPickup'
import { RemindersSoon } from '../result/RemindersSoon'
import { ApiBox } from '../result/ApiBox'
import { EmptyState, ErrorState, LoadingState, UnsupportedState } from '../result/ResultStates'
import { UpcomingList } from '../result/UpcomingList'
import { AddressSearch } from '../search/AddressSearch'
import { CalendarSheet } from '../sheets/CalendarSheet'
import { SaveSheet } from '../sheets/SaveSheet'
import { NotFound } from '../search/NotFound'

const dot = "inline-flex items-center before:inline-block before:w-5 before:text-center before:content-['·']"
const page = 'mx-auto flex w-full max-w-[920px] flex-col gap-5 px-5 pt-1 pb-8 md:px-8 md:pt-4 lg:gap-7 lg:px-0 lg:pb-20'

function BackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-1.5 self-start py-1.5 text-[15px] font-extrabold text-primary">
      <ArrowLeft className="size-[18px]" aria-hidden />
      Byt adress
    </Link>
  )
}

function useAddress(m: Source | undefined, addressId: string, attempt: number) {
  const [address, setAddress] = useState<Address | null | undefined>(undefined)
  useEffect(() => {
    if (!m) return
    let active = true
    setAddress(undefined)
    providerFor(m)
      .getAddress(addressId)
      .then(
        (a) => active && setAddress(a),
        () => active && setAddress(undefined),
      )
    return () => {
      active = false
    }
  }, [m, addressId, attempt])
  return address
}

/** Ny instans per adress, så att lokalt tillstånd (sparat namn, månad) inte följer med. */
export function ResultRoute({ today }: { today?: string }) {
  const { sourceId, addressId } = useParams()
  return <ResultPage key={`${sourceId}/${addressId}`} today={today} />
}

export function ResultPage({ today = todayInStockholm() }: { today?: string }) {
  const { sourceId = '', addressId = '' } = useParams()
  const source = getSource(sourceId)
  const [state, retry, attempt] = useSchedule(sourceId, addressId)
  const address = useAddress(source, addressId, attempt)
  const [sheet, setSheet] = useState<'calendar' | 'save' | null>(null)
  const [savedName, setSavedName] = useState(() => findSaved(sourceId, addressId)?.name)

  if (!source) {
    return (
      <div className={page}>
        <BackLink />
        <UnsupportedState />
        <AddressSearch />
      </div>
    )
  }

  if (address === null || state.status === 'missing') {
    return (
      <div className={page}>
        <BackLink />
        <NotFound suggestions={[]} />
        <AddressSearch />
      </div>
    )
  }

  const header = (
    <div className="flex flex-col gap-2.5">
      <BackLink />
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.6px] text-text lg:text-[40px]">
            {address?.street ?? ' '}
          </h1>
          {address && (
            // Varje del har sin punkt framför sig, och raden är förskjuten så att punkten klipps bort när
            // en del börjar en ny rad. Annars hänger "Krylbo ·" ensam när kommunen bryts på mobil.
            <div className="overflow-hidden">
              <p className="-ml-5 flex flex-wrap items-center gap-y-1.5 text-[15px] text-text-2">
                <span className={dot}>{address.locality}</span>
                {address.detail && <span className={dot}>{address.detail}</span>}
                <span className={dot}>
                  <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[13px] font-extrabold text-brand-text">
                    {address.kommun}
                  </span>
                </span>
              </p>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={!address}
          onClick={() => setSheet('save')}
          aria-label={savedName ? `Sparad som ${savedName}` : 'Spara'}
          className="inline-flex shrink-0 items-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-3 text-[15px] font-bold text-text"
        >
          <Bookmark className={savedName ? 'size-[18px] fill-primary text-primary' : 'size-[18px]'} aria-hidden />
          {savedName ?? 'Spara'}
        </button>
      </div>
    </div>
  )

  if (state.status === 'loading') {
    return (
      <div className={page}>
        {header}
        <LoadingState sourceName={source.name} />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className={page}>
        {header}
        <ErrorState onRetry={retry} />
      </div>
    )
  }

  const { schedule } = state
  const next = nextPickup(schedule, today)
  const coming = upcoming(schedule, today)

  return (
    <div className={page}>
      {header}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {next ? <NextPickup event={next} today={today} note={schedule.note} /> : <EmptyState />}
          <button
            type="button"
            disabled={!address}
            onClick={() => setSheet('calendar')}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-[14px] bg-primary px-5 text-base font-extrabold text-on-primary"
          >
            <CalendarPlus className="size-5" aria-hidden />
            Lägg till i kalender
          </button>
          {coming.length > 0 && <UpcomingList events={coming} today={today} />}
        </div>
        <div className="flex flex-col gap-5 lg:w-[360px] lg:shrink-0">
          {schedule.events.length > 0 && (
            <MonthCalendar schedule={schedule} initial={next?.date ?? today} today={today} />
          )}
          <RemindersSoon />
          {address && <ApiBox address={address} />}
        </div>
      </div>
      {address && (
        <>
          <CalendarSheet
            open={sheet === 'calendar'}
            onOpenChange={(o) => setSheet(o ? 'calendar' : null)}
            address={address}
            icsPath={providerFor(source).icsUrl(address.id)}
          />
          <SaveSheet
            key={savedName ?? ''}
            open={sheet === 'save'}
            onOpenChange={(o) => setSheet(o ? 'save' : null)}
            address={address}
            kommunName={address.kommun}
            onSaved={() => setSavedName(findSaved(source.id, address.id)?.name)}
          />
        </>
      )}
    </div>
  )
}
