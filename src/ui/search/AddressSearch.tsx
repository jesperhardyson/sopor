import { ChevronDown, LoaderCircle, MapPin, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { groupByKommun, normalize } from '@/domain/search'
import type { Address } from '@/domain/types'
import { searchAll, suggestAll, warmUpSearch, type SearchOptions, type SearchResult } from '@/providers/registry'
import { getSource } from '@/sources'
import { cn } from '@/lib/utils'
import { NotFound } from './NotFound'

type Lookup = (query: string, signal?: AbortSignal) => Promise<Address[]>
type Search = (
  query: string,
  signal?: AbortSignal,
  onPartial?: (partial: SearchResult) => void,
  options?: SearchOptions,
) => Promise<SearchResult>

type State =
  | { kind: 'idle' }
  | { kind: 'results'; query: string; results: Address[]; failed: string[]; pending?: boolean }
  | { kind: 'notFound'; suggestions: Address[]; failed: string[] }
  | { kind: 'error' }

const DEBOUNCE_MS = 150
/** Träffar som visas per kommun innan resten fälls ihop, när träffarna ligger i flera kommuner. */
const PER_KOMMUN = 3

type Item = { kind: 'address'; address: Address } | { kind: 'more'; kommun: string; count: number }
interface Section {
  /** Saknas när alla träffar ligger i en kommun: då visas listan utan rubriker. */
  kommun?: string
  total: number
  items: Item[]
}

function sections(results: Address[], expanded: Set<string>): Section[] {
  const groups = groupByKommun(results)
  const toItems = (list: Address[]): Item[] => list.map((address) => ({ kind: 'address', address }))
  if (groups.length < 2) return [{ total: results.length, items: toItems(results) }]
  return groups.map(({ kommun, addresses }) => {
    // En ensam dold träff visas hellre än en rad som säger "Visa 1 till".
    const all = expanded.has(kommun) || addresses.length <= PER_KOMMUN + 1
    const items = toItems(all ? addresses : addresses.slice(0, PER_KOMMUN))
    if (!all) items.push({ kind: 'more', kommun, count: addresses.length - PER_KOMMUN })
    return { kommun, total: addresses.length, items }
  })
}

export function AddressSearch({
  search = searchAll,
  suggest = suggestAll,
  onActivate,
  onDeactivate,
}: {
  search?: Search
  suggest?: Lookup
  /** Fältet fick fokus (startsidans fokusläge) */
  onActivate?: () => void
  /** Användaren tryckte Esc */
  onDeactivate?: () => void
}) {
  const navigate = useNavigate()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [active, setActive] = useState(-1)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const rootRef = useRef<HTMLDivElement>(null)

  // Klick utanför avbryter sökningen och lämnar fokusläget, så att ingen gammal träfflista blir kvar.
  // Läget avgörs vid pointerdown (fokus har inte flyttat än) men verkställs först vid click,
  // så att en scrollgest på mobil inte avbryter.
  useEffect(() => {
    let armed = false
    const outside = (e: Event) => !!rootRef.current && !rootRef.current.contains(e.target as Node)
    function onPointerDown(e: PointerEvent) {
      armed = outside(e) && (query !== '' || !!rootRef.current?.contains(document.activeElement))
    }
    function onClick(e: MouseEvent) {
      if (!armed || !outside(e)) return
      armed = false
      setQuery('')
      setSubmitted(false)
      setExpanded(new Set())
      onDeactivate?.()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('click', onClick)
    }
  }, [query, onDeactivate])

  useEffect(() => {
    if (normalize(query).length < 2) {
      setState({ kind: 'idle' })
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setLoading(true)
        const { addresses: results, failed } = await search(query, controller.signal, (partial) => {
          if (!controller.signal.aborted && partial.addresses.length > 0) {
            setState({ kind: 'results', query, results: partial.addresses, failed: [], pending: true })
          }
        })
        if (controller.signal.aborted) return
        if (results.length > 0) {
          setState({ kind: 'results', query, results, failed })
        } else {
          const suggestions = await suggest(query, controller.signal)
          if (!controller.signal.aborted) setState({ kind: 'notFound', suggestions, failed })
        }
        setActive(-1)
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, search, suggest])

  const results = state.kind === 'results' ? state.results : []
  const list = sections(results, expanded)
  const items = list.flatMap((s) => s.items)
  const open = results.length > 0
  const showNotFound = state.kind === 'notFound' && (submitted || normalize(query).length >= 4)

  function go(address: Address) {
    navigate(`/${address.sourceId}/${address.id}`)
  }

  function choose(item: Item) {
    if (item.kind === 'address') go(item.address)
    else setExpanded((prev) => new Set(prev).add(item.kommun))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Listan kan höra till en äldre fråga om man trycker Enter innan debouncen hunnit köra.
      if (open && state.kind === 'results' && state.query === query) {
        choose(items[Math.max(active, 0)])
        return
      }
      setSubmitted(true)
      if (normalize(query).length < 2) return
      search(query, undefined, undefined, { submitted: true }).then(
        (fresh) => fresh.addresses.length > 0 && go(fresh.addresses[0]),
        () => setState({ kind: 'error' }),
      )
    } else if (e.key === 'Escape') {
      setState({ kind: 'idle' })
      inputRef.current?.blur()
      onDeactivate?.()
    }
  }

  function renderItem(item: Item, showKommun: boolean) {
    const i = items.indexOf(item)
    const props = {
      id: `${listId}-${i}`,
      role: 'option',
      'aria-selected': i === active,
      onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
      onClick: () => choose(item),
      onMouseEnter: () => setActive(i),
    }
    if (item.kind === 'more') {
      return (
        <li
          key={`fler/${item.kommun}`}
          {...props}
          className={cn(
            'flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl py-2 pr-3 pl-[60px] text-sm font-extrabold text-primary',
            i === active && 'bg-surface-2',
          )}
        >
          Visa {item.count} till i {item.kommun}
          <ChevronDown className="size-4" aria-hidden />
        </li>
      )
    }
    const r = item.address
    return (
      <li
        key={`${r.sourceId}/${r.id}`}
        {...props}
        className={cn('flex cursor-pointer items-center gap-3 rounded-xl p-3', i === active && 'bg-surface-2')}
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
          <MapPin className="size-[18px]" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-base font-extrabold text-text">{r.street}</span>
          <span className="flex flex-wrap items-center gap-2 text-sm text-text-2">
            <span>{r.locality}</span>
            {r.detail && (
              <>
                <span aria-hidden>·</span>
                <span>{r.detail}</span>
              </>
            )}
            {showKommun && (
              <>
                <span aria-hidden>·</span>
                <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[13px] font-extrabold text-brand-text">
                  {r.kommun}
                </span>
              </>
            )}
          </span>
        </span>
      </li>
    )
  }

  return (
    <div ref={rootRef} className="relative flex flex-col gap-3">
      <div
        // Hela rutan är klickbar, inte bara själva textfältet. Rensa-knappen sköter sig själv.
        onMouseDown={(e) => {
          if (e.target === inputRef.current || (e.target as HTMLElement).closest('button')) return
          e.preventDefault()
          inputRef.current?.focus()
        }}
        className={cn(
          'flex h-[62px] cursor-text items-center gap-2.5 rounded-[18px] border-[1.5px] border-border bg-surface pr-4 pl-[18px] shadow-[0_4px_16px_#1B231F0D] transition-colors lg:h-[76px] lg:gap-3.5 lg:rounded-[22px] lg:pr-5 lg:pl-6',
          'focus-within:border-2 focus-within:border-primary focus-within:shadow-[0_0_10px_color-mix(in_srgb,var(--primary)_20%,transparent)]',
        )}
      >
        {loading ? (
          <LoaderCircle className="size-5 shrink-0 animate-spin text-primary lg:size-6" aria-hidden />
        ) : (
          <Search className="size-5 shrink-0 text-text-2 lg:size-6 [div:focus-within>&]:text-primary" aria-hidden />
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Din adress"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          enterKeyHint="search"
          placeholder="Skriv din adress, t.ex. Storgatan 12"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSubmitted(false)
            setExpanded(new Set())
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            warmUpSearch()
            onActivate?.()
          }}
          className="min-w-0 flex-1 bg-transparent text-base font-bold text-text outline-none placeholder:font-normal placeholder:text-text-2 lg:text-xl"
        />
        {query && (
          <button
            type="button"
            aria-label="Rensa"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            // Tryckytan är 44 px, rundeln behåller designens 28 px.
            className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center"
          >
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-surface-2 text-text-2">
              <X className="size-4" aria-hidden />
            </span>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-3 rounded-[18px] border border-border bg-surface p-1.5 shadow-[0_12px_32px_#1B231F1F]">
        <ul id={listId} role="listbox" aria-label="Adresser" className="flex flex-col">
          {list.map((section, s) =>
            section.kommun ? (
              <li key={section.kommun} role="group" aria-label={section.kommun}>
                {s > 0 && <div aria-hidden className="mx-3 my-1 h-px bg-border" />}
                <div aria-hidden className="flex items-center gap-2 px-3 pt-2.5 pb-1 text-[13px] text-text-2">
                  <span className="flex-1 font-extrabold">{section.kommun}</span>
                  <span>{section.total}</span>
                </div>
                <ul role="none" className="flex flex-col">
                  {section.items.map((item) => renderItem(item, false))}
                </ul>
              </li>
            ) : (
              section.items.map((item) => renderItem(item, true))
            ),
          )}
        </ul>
        {state.kind === 'results' && state.pending && (
          <p role="status" className="flex items-center gap-2 px-3 pt-1 pb-2 text-sm text-text-2">
            <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
            Söker hos fler källor…
          </p>
        )}
        {state.kind === 'results' && state.failed.length > 0 && (
          <p className="px-3 pt-1 pb-2 text-sm font-semibold text-warn">
            {state.failed.map((id) => getSource(id)?.name ?? id).join(', ')} svarar inte just nu.
          </p>
        )}
        </div>
      )}

      {/* Som träfflistan: ovanpå innehållet, så att sidan under inte hoppar. */}
      {(showNotFound || state.kind === 'error') && (
        <div className="absolute inset-x-0 top-full z-20 mt-3 flex flex-col gap-3">
          {showNotFound && state.failed.length > 0 && (
            <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-warn shadow-[0_12px_32px_#1B231F1F]">
              {state.failed.map((id) => getSource(id)?.name ?? id).join(', ')} svarar inte just nu.
            </p>
          )}
          {showNotFound && <NotFound suggestions={state.suggestions} className="shadow-[0_12px_32px_#1B231F1F]" />}
          {state.kind === 'error' && (
            <p role="alert" className="rounded-2xl bg-warn-bg px-4 py-3 text-[15px] font-bold text-warn shadow-[0_12px_32px_#1B231F1F]">
              Det gick inte att söka just nu. Kontrollera anslutningen och försök igen.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
