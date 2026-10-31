import { LoaderCircle, MapPin, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { normalize } from '@/domain/search'
import type { Address } from '@/domain/types'
import { searchAll, suggestAll, warmUpSearch, type SearchResult } from '@/providers/registry'
import { getSource } from '@/sources'
import { cn } from '@/lib/utils'
import { NotFound } from './NotFound'

type Lookup = (query: string, signal?: AbortSignal) => Promise<Address[]>
type Search = (query: string, signal?: AbortSignal, onPartial?: (partial: SearchResult) => void) => Promise<SearchResult>

type State =
  | { kind: 'idle' }
  | { kind: 'results'; query: string; results: Address[]; failed: string[]; pending?: boolean }
  | { kind: 'notFound'; suggestions: Address[]; failed: string[] }
  | { kind: 'error' }

const DEBOUNCE_MS = 150

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
  const open = results.length > 0
  const showNotFound = state.kind === 'notFound' && (submitted || normalize(query).length >= 4)

  function go(address: Address) {
    navigate(`/${address.sourceId}/${address.id}`)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Listan kan höra till en äldre fråga om man trycker Enter innan debouncen hunnit köra.
      if (open && state.kind === 'results' && state.query === query) {
        go(results[Math.max(active, 0)])
        return
      }
      setSubmitted(true)
      if (normalize(query).length < 2) return
      search(query).then(
        (fresh) => fresh.addresses.length > 0 && go(fresh.addresses[0]),
        () => setState({ kind: 'error' }),
      )
    } else if (e.key === 'Escape') {
      setState({ kind: 'idle' })
      inputRef.current?.blur()
      onDeactivate?.()
    }
  }

  return (
    <div className="relative flex flex-col gap-3">
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
          placeholder="Skriv din adress, t.ex. Storgatan 12"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSubmitted(false)
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
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-2"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-3 rounded-[18px] border border-border bg-surface p-1.5 shadow-[0_12px_32px_#1B231F1F]">
        <ul id={listId} role="listbox" aria-label="Adresser" className="flex flex-col">
          {results.map((r, i) => (
            <li
              key={`${r.sourceId}/${r.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(r)}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center gap-3 rounded-xl p-3', i === active && 'bg-surface-2')}
            >
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
                <MapPin className="size-[18px]" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-base font-extrabold text-text">{r.street}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm text-text-2">
                  <span>{r.locality}</span>
                  <span aria-hidden>·</span>
                  <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[13px] font-extrabold text-brand-text">
                    {r.kommun}
                  </span>
                </span>
              </span>
            </li>
          ))}
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
