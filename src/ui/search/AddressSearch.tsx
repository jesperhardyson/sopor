import { MapPin, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { normalize } from '@/domain/search'
import type { Address } from '@/domain/types'
import { getMunicipality } from '@/municipalities'
import { searchAll, suggestAll } from '@/providers/registry'
import { cn } from '@/lib/utils'
import { NotFound } from './NotFound'

type Lookup = (query: string, signal?: AbortSignal) => Promise<Address[]>

type State =
  | { kind: 'idle' }
  | { kind: 'results'; query: string; results: Address[] }
  | { kind: 'notFound'; suggestions: Address[] }
  | { kind: 'error' }

const DEBOUNCE_MS = 150

export function AddressSearch({ search = searchAll, suggest = suggestAll }: { search?: Lookup; suggest?: Lookup }) {
  const navigate = useNavigate()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [active, setActive] = useState(-1)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (normalize(query).length < 2) {
      setState({ kind: 'idle' })
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const results = await search(query, controller.signal)
        if (controller.signal.aborted) return
        if (results.length > 0) {
          setState({ kind: 'results', query, results })
        } else {
          const suggestions = await suggest(query, controller.signal)
          if (!controller.signal.aborted) setState({ kind: 'notFound', suggestions })
        }
        setActive(-1)
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, search, suggest])

  const results = state.kind === 'results' ? state.results : []
  const open = results.length > 0

  function go(address: Address) {
    navigate(`/${address.municipalityId}/${address.id}`)
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
        (fresh) => fresh.length > 0 && go(fresh[0]),
        () => setState({ kind: 'error' }),
      )
    } else if (e.key === 'Escape') {
      setState({ kind: 'idle' })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'flex h-[62px] items-center gap-2.5 rounded-[18px] border-[1.5px] border-border bg-surface pr-4 pl-[18px] shadow-[0_4px_16px_#1B231F0D] transition-colors lg:h-[76px] lg:gap-3.5 lg:rounded-[22px] lg:pr-5 lg:pl-6',
          'focus-within:border-2 focus-within:border-primary focus-within:shadow-[0_0_10px_color-mix(in_srgb,var(--primary)_20%,transparent)]',
        )}
      >
        <Search className="size-5 shrink-0 text-text-2 lg:size-6 [div:focus-within>&]:text-primary" aria-hidden />
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
          spellCheck={false}
          placeholder="Skriv din adress, t.ex. Storgatan 12"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSubmitted(false)
          }}
          onKeyDown={onKeyDown}
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
        <ul
          id={listId}
          role="listbox"
          aria-label="Adresser"
          className="flex flex-col rounded-[18px] border border-border bg-surface p-1.5 shadow-[0_12px_32px_#1B231F1F]"
        >
          {results.map((r, i) => (
            <li
              key={`${r.municipalityId}/${r.id}`}
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
                    {getMunicipality(r.municipalityId)?.name ?? r.municipalityId}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {state.kind === 'notFound' && (submitted || normalize(query).length >= 4) && (
        <NotFound suggestions={state.suggestions} />
      )}
      {state.kind === 'error' && (
        <p role="alert" className="rounded-2xl bg-warn-bg px-4 py-3 text-[15px] font-bold text-warn">
          Det gick inte att söka just nu. Kontrollera anslutningen och försök igen.
        </p>
      )}
    </div>
  )
}
