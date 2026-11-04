import { ArrowLeft, Bookmark, CalendarPlus, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { streetAndLocality } from '@/domain/address'
import { formatLong, todayInStockholm } from '@/domain/dates'
import { nextPickup, upcoming } from '@/domain/schedule'
import type { Address } from '@/domain/types'
import { findSaved, storeSchedule } from '@/lib/storage'
import { getSource, type Source } from '@/sources'
import { providerFor } from '@/providers/registry'
import { useAreas } from '../hooks/useAreas'
import { useSchedule } from '../hooks/useSchedule'
import { AreaInfo } from '../result/AreaInfo'
import { MonthCalendar } from '../result/MonthCalendar'
import { NextPickup } from '../result/NextPickup'
import { SmartHomeBox } from '../integrations/SmartHomeBox'
import { EmptyState, ErrorState, LoadingState, StaleNotice, UnsupportedState } from '../result/ResultStates'
import { ShareButton } from '../result/ShareButton'
import { SourceNote } from '../result/SourceNote'
import { UpcomingList } from '../result/UpcomingList'
import { AddressSearch } from '../search/AddressSearch'
import { CalendarSheet } from '../sheets/CalendarSheet'
import { SaveSheet } from '../sheets/SaveSheet'
import { NotFound } from '../search/NotFound'
import { usePageTitle } from '../hooks/usePageTitle'

const dot = "inline-flex items-center before:inline-block before:w-5 before:text-center before:content-['·']"
const page = 'mx-auto flex w-full max-w-[920px] flex-col gap-5 px-5 pt-1 pb-8 md:px-8 md:pt-4 lg:gap-7 lg:px-0 lg:pb-20'

function BackLink({ area, sourceId, addressId }: { area?: boolean; sourceId?: string; addressId?: string }) {
  return (
    <Link to={area ? `/${sourceId}/omraden` : '/'} state={area && addressId ? { from: addressId } : undefined} className="inline-flex items-center gap-1.5 self-start py-1.5 text-[15px] font-extrabold text-primary">
      <ArrowLeft className="size-[18px]" aria-hidden />
      {area ? 'Byt område' : 'Byt adress'}
    </Link>
  )
}

/** En prenumeration pekar på områdets id, så en kalender med det gamla området går inte att ändra härifrån. */
function AreaChangedNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div role="status" className="flex gap-3 rounded-[14px] bg-warn-bg px-4 py-3.5 text-warn">
      <TriangleAlert className="size-[22px] shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <h2 className="text-[15px] font-extrabold">Du har bytt område</h2>
        <p className="text-sm leading-[1.4]">
          Har du lagt till det gamla området i din kalender? Ta bort det och lägg till det nya, annars visar kalendern fel dagar.
        </p>
        <button type="button" onClick={onDismiss} className="min-h-11 text-sm font-extrabold">
          Jag förstår
        </button>
      </div>
    </div>
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
  const fetched = useAddress(source, addressId, attempt)
  // Tills källan svarat, eller när den inte svarar, kommer adressen från det sparade schemat.
  const address = fetched ?? (state.status === 'stale' || state.status === 'cached' ? state.address : undefined)
  const byArea = source?.selection === 'area'
  const [areas] = useAreas(byArea ? source : undefined)
  const [sheet, setSheet] = useState<'calendar' | 'save' | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const areaChanged = (location.state as { areaChanged?: boolean } | null)?.areaChanged === true
  const dismissChanged = () => navigate(location.pathname, { replace: true, state: null })
  const [savedName, setSavedName] = useState(() => findSaved(sourceId, addressId)?.name)
  usePageTitle(address ? `${streetAndLocality(address)} – Sopor` : undefined)

  // Sparade adresser behåller senast hämtade schemat, som visas om källan inte svarar nästa gång.
  const fresh = state.status === 'ok' ? state.schedule : undefined
  useEffect(() => {
    if (fresh && fetched && savedName) storeSchedule({ address: fetched, schedule: fresh, fetchedAt: today })
  }, [fresh, fetched, savedName, today])

  if (!source) {
    return (
      <div className={page}>
        <BackLink />
        <UnsupportedState />
        <AddressSearch />
      </div>
    )
  }

  if (fetched === null || state.status === 'missing') {
    return (
      <div className={page}>
        <BackLink area={byArea} sourceId={sourceId} addressId={addressId} />
        <NotFound suggestions={[]} />
        <AddressSearch />
      </div>
    )
  }

  const header = (
    <div className="flex flex-col gap-2.5">
      <BackLink area={byArea} sourceId={sourceId} addressId={addressId} />
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
                {address.locality && <span className={dot}>{address.locality}</span>}
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
        <div className="flex shrink-0 items-center gap-2">
          {address && <ShareButton title={streetAndLocality(address)} url={`${window.location.origin}${window.location.pathname}`} />}
          <button
            type="button"
            disabled={!address}
            onClick={() => setSheet('save')}
            aria-label={savedName ? `Sparad som ${savedName}` : 'Spara'}
            className="tryck inline-flex shrink-0 items-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-3 text-[15px] font-bold text-text"
          >
            <Bookmark className={savedName ? 'size-[18px] fill-primary text-primary' : 'size-[18px]'} aria-hidden />
            {savedName ?? 'Spara'}
          </button>
        </div>
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
  const area = areas.status === 'ready' ? areas.index.areas.find((a) => a.id === addressId) : undefined
  const next = nextPickup(schedule, today)
  const coming = upcoming(schedule, today)

  return (
    <div className={page}>
      {header}
      {areaChanged && <AreaChangedNotice onDismiss={dismissChanged} />}
      {state.status === 'stale' && (
        <StaleNotice sourceName={source.name} fetchedAt={formatLong(state.fetchedAt)} onRetry={retry} />
      )}
      {/* Källan ligger sist på mobil men under vänsterspalten på desktop, där högerspalten spänner över båda raderna. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-10">
        <div className="flex min-w-0 flex-col gap-5">
          {area && areas.status === 'ready' && <AreaInfo area={area} explanation={areas.index.explanation} />}
          {next ? <NextPickup event={next} today={today} note={schedule.note} /> : <EmptyState note={source.emptyScheduleNote} />}
          <button
            type="button"
            disabled={!address}
            onClick={() => setSheet('calendar')}
            className="tryck inline-flex h-14 items-center justify-center gap-2 rounded-[14px] bg-primary px-5 text-base font-extrabold text-on-primary"
          >
            <CalendarPlus className="size-5" aria-hidden />
            Lägg till i kalender
          </button>
          {coming.length > 0 && <UpcomingList events={coming} today={today} />}
        </div>
        <div className="flex flex-col gap-5 lg:row-span-2">
          {schedule.events.length > 0 && (
            <MonthCalendar schedule={schedule} initial={next?.date ?? today} today={today} />
          )}
          {address && <SmartHomeBox address={address} />}
        </div>
        <SourceNote name={source.name} url={source.url} />
      </div>
      {address && (
        <>
          <CalendarSheet
            open={sheet === 'calendar'}
            onOpenChange={(o) => setSheet(o ? 'calendar' : null)}
            address={address}
            icsPath={providerFor(source).icsUrl(address.id)}
            notice={source.areaNotice}
            findState={byArea ? { from: addressId, find: true } : undefined}
            findTo={byArea ? `/${sourceId}/omraden` : undefined}
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
