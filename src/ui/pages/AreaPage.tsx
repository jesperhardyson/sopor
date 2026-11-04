import { ArrowLeft, ArrowRight, CalendarSearch, ChevronRight, MapPin, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { kommunInText } from '@/domain/kommun'
import { searchAddresses } from '@/domain/search'
import { todayInStockholm } from '@/domain/dates'
import type { Address, Area } from '@/domain/types'
import { moveChoices, rememberChoice, replaceSaved } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { knownAreaStreet } from '@/providers/registry'
import { getSource, type Source } from '@/sources'
import { useAreas } from '../hooks/useAreas'
import { usePageTitle } from '../hooks/usePageTitle'
import { ErrorState, UnsupportedState } from '../result/ResultStates'
import { AreaFinderSheet } from '../sheets/AreaFinderSheet'

const page = 'mx-auto flex w-full max-w-[920px] flex-col gap-5 px-5 pt-1 pb-8 md:px-8 md:pt-4 lg:gap-7 lg:px-0 lg:pb-20'

/** Vad områdesvalet får med sig: gatan man sökte, området man byter från och om arket ska öppnas direkt. */
export interface AreaPageState {
  street?: string
  from?: string
  find?: boolean
}

function BackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-1.5 self-start py-1.5 text-[15px] font-extrabold text-primary">
      <ArrowLeft className="size-[18px]" aria-hidden />
      Tillbaka
    </Link>
  )
}

/** Områdena som adresser, så att filtret kan använda samma sökning som adressfälten. */
function asAddresses(areas: Area[], source: Source): Address[] {
  return areas.map((a) => ({
    id: a.id,
    street: a.name,
    locality: '',
    sourceId: source.id,
    kommun: source.kommuner[0].name,
    searchTerms: [...a.searchTerms, a.day],
  }))
}

export function AreaRoute({ today }: { today?: string }) {
  const { sourceId = '' } = useParams()
  return <AreaPage key={sourceId} today={today} />
}

export function AreaPage({ today = todayInStockholm() }: { today?: string }) {
  const { sourceId = '' } = useParams()
  const source = getSource(sourceId)
  const supported = source?.selection === 'area'
  const [state, retry] = useAreas(supported ? source : undefined)
  const nav = (useLocation().state ?? {}) as AreaPageState
  const [query, setQuery] = useState('')
  const [finder, setFinder] = useState(nav.find === true)
  const [known, setKnown] = useState<{ query: string; street: string }>()
  usePageTitle('Välj område – Sopor')

  const index = state.status === 'ready' ? state.index : undefined
  const hits = useMemo(() => {
    if (!index || !source) return []
    if (query.trim().length < 2) return index.areas
    const found = searchAddresses(query, asAddresses(index.areas, source), index.areas.length, { areaPrefix: true })
    return found.map((h) => index.areas.find((a) => a.id === h.id)!)
  }, [index, source, query])

  // En gata som finns i kommunen men inte i områdeslistan är ingen återvändsgränd: då står hela listan kvar.
  const noHits = index !== undefined && hits.length === 0
  useEffect(() => {
    if (!noHits) return
    let current = true
    knownAreaStreet(sourceId, query).then(
      (street) => {
        if (current) setKnown(street ? { query, street } : undefined)
      },
      () => {},
    )
    return () => {
      current = false
    }
  }, [noHits, sourceId, query])
  const knownStreet = noHits && known?.query === query ? known.street : undefined
  const shown = knownStreet && index ? index.areas : hits

  /** Valet stannar i webbläsaren. Byter man område följer det sparade området och tidigare val med. */
  function choose(area: Area) {
    if (nav.from && nav.from !== area.id) {
      replaceSaved(sourceId, nav.from, { id: area.id, street: area.name })
      moveChoices(sourceId, nav.from, area)
    }
    if (nav.street) rememberChoice({ sourceId, street: nav.street, areaId: area.id, label: area.label, day: area.day })
  }
  // Kommer man från en gata är Hitta område nästa steg, så på mobil ligger det före filtret.
  const filterOrder = nav.street ? 'order-3' : 'order-2'
  const linkState = (area: Area) => (nav.from && nav.from !== area.id ? { areaChanged: true } : undefined)

  if (!source || !supported) {
    return (
      <div className={page}>
        <BackLink />
        <UnsupportedState />
      </div>
    )
  }

  return (
    <div className={page}>
      <BackLink />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.6px] text-text lg:text-[40px]">Välj ditt område</h1>
        <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[13px] font-extrabold text-brand-text">{source.kommuner[0].name}</span>
      </div>
      {state.status === 'loading' && <div aria-busy className="h-40 rounded-[20px] bg-surface" />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {index && (
        // På mobil ligger delarna i en kolumn i den ordning orden anger, på desktop delas de i två kolumner.
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,520px)_minmax(0,360px)] lg:items-start lg:gap-x-10">
          <div className="contents lg:flex lg:flex-col lg:gap-5">
            <label className={cn('flex h-14 items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 focus-within:border-primary lg:order-none', filterOrder)}>
              <Search className="size-5 shrink-0 text-text-2" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Sök område, ort eller gata"
                placeholder="Sök område, ort eller gata"
                className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-2"
              />
            </label>
            {knownStreet && (
              <div role="status" className={cn('flex gap-3 rounded-[20px] bg-surface-2 p-5 lg:order-none', filterOrder)}>
                <MapPin className="size-[22px] shrink-0 text-text" aria-hidden />
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="text-[15px] font-extrabold text-text">
                    {knownStreet} finns i {kommunInText(source.kommuner[0].name)}
                  </h2>
                  <p className="text-sm leading-[1.4] text-text">
                    Men schemat visar inte vilket område den hör till. Hitta det med din senaste tömning, eller välj i listan.
                  </p>
                </div>
              </div>
            )}
            <div className="order-4 flex flex-col overflow-hidden rounded-3xl bg-surface lg:order-none lg:rounded-[20px]">
              {shown.length === 0 && (
                <p role="status" className="px-5 py-5 text-[15px] text-text-2">
                  Inget område matchar
                </p>
              )}
              {shown.map((a) => (
                <Link
                  key={a.id}
                  to={`/${source.id}/${a.id}`}
                  state={linkState(a)}
                  onClick={() => choose(a)}
                  className="tryck flex items-center gap-3 border-b border-border px-5 py-4 last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-base font-extrabold text-text">{a.name}</span>
                      {a.label && <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-[13px] font-extrabold text-brand-text">{a.label}</span>}
                    </span>
                    <span className="text-[15px] font-bold text-brand-text">{a.day}</span>
                    {a.places.length > 0 && <span className="text-sm text-text-2">{a.places.join(', ')}</span>}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-text-2" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
          <div className="contents lg:flex lg:flex-col lg:gap-5">
            <div className="order-1 flex flex-col gap-1.5 rounded-[20px] bg-surface-2 p-5 lg:order-none">
              {nav.street ? (
                <>
                  <h2 className="text-base font-extrabold text-text">Du sökte {nav.street}</h2>
                  <p className="text-[15px] leading-[1.45] text-text-2">
                    Schemat visar inte vilket område adressen hör till, så vi kan inte välja åt dig. Väljer du fel kan du missa din tömning.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-base font-extrabold text-text">Därför väljer du område i stället för adress</h2>
                  <p className="text-[15px] leading-[1.45] text-text-2">{index.explanation}</p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFinder(true)}
              className={cn('tryck flex items-center gap-3 rounded-[20px] bg-brand-soft px-5 py-4 text-left lg:order-none', nav.street ? 'order-2' : 'order-3')}
            >
              <CalendarSearch className="size-6 shrink-0 text-brand-text" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-base font-extrabold text-brand-text">Vet du inte vilket område?</span>
                <span className="text-[15px] text-brand-text">Hitta det med din senaste tömning</span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-brand-text" aria-hidden />
            </button>
            <p className="order-5 text-[15px] text-text-2 lg:order-none">{index.help}</p>
          </div>
        </div>
      )}
      {index && <AreaFinderSheet open={finder} onOpenChange={setFinder} areas={index.areas} sourceId={source.id} today={today} onChoose={choose} linkState={linkState} />}
    </div>
  )
}
