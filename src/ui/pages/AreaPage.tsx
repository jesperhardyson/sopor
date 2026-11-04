import { ArrowLeft, ArrowRight, CalendarSearch, ChevronRight, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { AreasIndexFile } from '@/data/static-format'
import { searchAddresses } from '@/domain/search'
import { todayInStockholm } from '@/domain/dates'
import type { Address, Area } from '@/domain/types'
import { providerFor } from '@/providers/registry'
import { getSource, type Source } from '@/sources'
import { usePageTitle } from '../hooks/usePageTitle'
import { ErrorState, UnsupportedState } from '../result/ResultStates'
import { AreaFinderSheet } from '../sheets/AreaFinderSheet'

const page = 'mx-auto flex w-full max-w-[920px] flex-col gap-5 px-5 pt-1 pb-8 md:px-8 md:pt-4 lg:gap-7 lg:px-0 lg:pb-20'
const MAX_PLACES = 5

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; index: AreasIndexFile }

function BackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-1.5 self-start py-1.5 text-[15px] font-extrabold text-primary">
      <ArrowLeft className="size-[18px]" aria-hidden />
      Tillbaka
    </Link>
  )
}

export function useAreas(source: Source | undefined): [State, () => void] {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const list = source && providerFor(source).listAreas
    if (!source || !list) return
    let active = true
    setState({ status: 'loading' })
    list.call(providerFor(source)).then(
      (index) => active && setState({ status: 'ready', index }),
      () => active && setState({ status: 'error' }),
    )
    return () => {
      active = false
    }
  }, [source, attempt])
  return [state, () => setAttempt((a) => a + 1)]
}

/** Områdena som adresser, så att filtret kan använda samma sökning som adressfälten. */
function asAddresses(areas: Area[], source: Source): Address[] {
  return areas.map((a) => ({
    id: a.id,
    street: a.name,
    locality: '',
    sourceId: source.id,
    kommun: source.kommuner[0].name,
    searchTerms: a.searchTerms,
  }))
}

function places(area: Area): string {
  const shown = area.places.slice(0, MAX_PLACES).join(', ')
  return area.places.length > MAX_PLACES ? `${shown} …` : shown
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
  const [query, setQuery] = useState('')
  const [finder, setFinder] = useState(false)
  usePageTitle('Välj område – Sopor')

  const index = state.status === 'ready' ? state.index : undefined
  const shown = useMemo(() => {
    if (!index || !source) return []
    if (query.trim().length < 2) return index.areas
    const hits = searchAddresses(query, asAddresses(index.areas, source), index.areas.length, { areaPrefix: true })
    return hits.map((h) => index.areas.find((a) => a.id === h.id)!)
  }, [index, source, query])

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
            <label className="order-2 flex h-14 items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 focus-within:border-primary lg:order-none">
              <Search className="size-5 shrink-0 text-text-2" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Sök ort eller gata"
                placeholder="Sök ort eller gata"
                className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-2"
              />
            </label>
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
                  className="tryck flex items-center gap-3 border-b border-border px-5 py-4 last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-base font-extrabold text-text">{a.name}</span>
                    <span className="text-[15px] font-bold text-brand-text">
                      {a.day} · {a.label}
                    </span>
                    {a.places.length > 0 && <span className="text-sm text-text-2">{places(a)}</span>}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-text-2" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
          <div className="contents lg:flex lg:flex-col lg:gap-5">
            <div className="order-1 flex flex-col gap-1.5 rounded-[20px] bg-surface-2 p-5 lg:order-none">
              <h2 className="text-base font-extrabold text-text">Därför väljer du område i stället för adress</h2>
              <p className="text-[15px] leading-[1.45] text-text-2">{index.explanation}</p>
            </div>
            <button
              type="button"
              onClick={() => setFinder(true)}
              className="tryck order-3 flex items-center gap-3 rounded-[20px] bg-brand-soft px-5 py-4 text-left lg:order-none"
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
      {index && <AreaFinderSheet open={finder} onOpenChange={setFinder} areas={index.areas} sourceId={source.id} today={today} />}
    </div>
  )
}
