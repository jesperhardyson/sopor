import { kommunInText } from '@/domain/kommun'
import { ArrowRight, ChevronDown, LoaderCircle, Map, MapPin, Search, UserCheck, X } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { enterTarget, groupByKommun, matchedTerm, normalize, stableMerge } from '@/domain/search'
import type { Address } from '@/domain/types'
import { missingKommuner, prefetchAddress, searchAll, suggestAll, warmUpSearch, type AreaPicker, type SearchOptions, type SearchResult } from '@/providers/registry'
import { getSource } from '@/sources'
import { reportMissingKommun } from '@/lib/analytics'
import { forgetChoice, loadChoice, type AreaChoice } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { Skeleton } from '../result/ResultStates'
import { MissingKommun } from './MissingKommun'
import { NotFound } from './NotFound'

type Lookup = (query: string, signal?: AbortSignal) => Promise<Address[]>
type Missing = (query: string, signal?: AbortSignal) => Promise<string[]>
type Search = (
  query: string,
  signal?: AbortSignal,
  onPartial?: (partial: SearchResult) => void,
  options?: SearchOptions,
) => Promise<SearchResult>

type State =
  | { kind: 'idle' }
  | { kind: 'results'; query: string; results: Address[]; pickers: AreaPicker[]; failed: string[]; pending?: boolean }
  | { kind: 'notFound'; query: string; suggestions: Address[]; failed: string[]; missing: string[] }
  | { kind: 'error' }

const DEBOUNCE_MS = 150
/** Skelettet visas först efter så här lång väntan, så att svar ur cachen inte får det att blinka. */
const SKELETON_MS = 150
/** Träffar som visas per kommun innan resten fälls ihop, när träffarna ligger i flera kommuner. */
const PER_KOMMUN = 3
/** Adressrader i listan innan resten fälls ihop bakom "Visa N till". */
const MAX_ROWS = 15
/** Nyckeln i `expanded` för hela listan (kommunnamn är aldrig tomma). */
const ALL = ''

/** `kommun` saknas på raden som fäller ut hela listan. */
type Item =
  | { kind: 'address'; address: Address }
  | { kind: 'more'; kommun?: string; count: number }
  | { kind: 'picker'; picker: AreaPicker; choice?: AreaChoice }
  /** Egna rader för tangentbordet, som visas på samma rad under valet. */
  | { kind: 'changeChoice'; picker: AreaPicker; choice: AreaChoice }
  | { kind: 'forgetChoice'; picker: AreaPicker; choice: AreaChoice }
interface Section {
  /** Saknas när alla träffar ligger i en kommun: då visas listan utan rubriker. */
  kommun?: string
  total: number
  items: Item[]
}

/** Kommunens namn utan "kommun", för texterna på raden för områdesval. */

/** Raden för områdesval hör till sin kommuns grupp. En kommun utan träffar får en grupp med bara den raden, sist. */
function withPickers(list: Section[], pickers: AreaPicker[]): Section[] {
  if (pickers.length === 0) return list
  const extra: Section[] = []
  const grouped = list.map((section) => ({ ...section, items: [...section.items] }))
  for (const picker of pickers) {
    const choice = picker.street && !picker.hasHits ? loadChoice(picker.sourceId, picker.street) : undefined
    const items: Item[] = [
      { kind: 'picker', picker, choice },
      ...(choice ? ([{ kind: 'changeChoice', picker, choice }, { kind: 'forgetChoice', picker, choice }] as const) : []),
    ]
    const section = grouped.find((s) => s.kommun === picker.kommun)
    if (section) section.items.push(...items)
    else extra.push({ kommun: picker.kommun, total: 0, items })
  }
  return [...grouped, ...extra]
}

function sections(results: Address[], pickers: AreaPicker[], expanded: Set<string>): Section[] {
  return withPickers(trimmed(results, pickers.length > 0, expanded), pickers)
}

function trimmed(results: Address[], grouped: boolean, expanded: Set<string>): Section[] {
  const list = byKommun(results, expanded, grouped)
  const rows = (section: Section) => section.items.filter((i) => i.kind === 'address').length
  // Inget undantag för en ensam rad till: då skulle rad 16 försvinna när den 17:e kommer.
  if (expanded.has(ALL) || list.reduce((n, section) => n + rows(section), 0) <= MAX_ROWS) return list
  // Sena källor hamnar sist och fälls ihop här, så att listan inte växer medan man tittar.
  let left = MAX_ROWS
  let hidden = 0
  const shown: Section[] = []
  for (const section of list) {
    // En kommun man själv fällt ut visas hel.
    if (rows(section) <= left || (section.kommun && expanded.has(section.kommun))) {
      shown.push(section)
      left = Math.max(0, left - rows(section))
    } else if (left > 0 && section.kommun) {
      // En kommun som klipps behåller sin egen rad för resten.
      const items: Item[] = [...section.items.slice(0, left), { kind: 'more', kommun: section.kommun, count: section.total - left }]
      shown.push({ ...section, items })
      left = 0
    } else {
      if (left > 0) shown.push({ ...section, items: section.items.slice(0, left) })
      hidden += section.total - left
      left = 0
    }
  }
  return hidden > 0 ? [...shown, { total: hidden, items: [{ kind: 'more', count: hidden }] }] : shown
}

function byKommun(results: Address[], expanded: Set<string>, grouped: boolean): Section[] {
  const groups = groupByKommun(results)
  const toItems = (list: Address[]): Item[] => list.map((address) => ({ kind: 'address', address }))
  // Rubriker gör bara nytta när någon kommun har flera träffar. Annars står kommunen på raden.
  // Raden för områdesval står alltid under sin kommuns rubrik, så då behövs rubrikerna ändå.
  if (!grouped && (groups.length < 2 || groups.every((g) => g.addresses.length === 1))) {
    return [{ total: results.length, items: toItems(results) }]
  }
  return groups.map(({ kommun, addresses }) => {
    // En ensam dold träff visas hellre än en rad som säger "Visa 1 till".
    const all = expanded.has(kommun) || addresses.length <= PER_KOMMUN + 1
    const items = toItems(all ? addresses : addresses.slice(0, PER_KOMMUN))
    if (!all) items.push({ kind: 'more', kommun, count: addresses.length - PER_KOMMUN })
    return { kommun, total: addresses.length, items }
  })
}

/** Raderna som redan syns behåller sin plats när nya träffar kommer in. */
const keep = (prev: State, incoming: Address[]) => stableMerge(prev.kind === 'results' ? prev.results : [], incoming)

export function AddressSearch({
  search = searchAll,
  suggest = suggestAll,
  missing = missingKommuner,
  prefetch = prefetchAddress,
  kommun,
  areaHref,
  onActivate,
  onDeactivate,
}: {
  search?: Search
  suggest?: Lookup
  /** Kommuner som frågans ort ligger i, om Sopor inte har dem */
  missing?: Missing
  /** Börjar hämta en adress innan den väljs */
  prefetch?: (sourceId: string, addressId: string) => void
  /** Kommunen som `search` är avgränsad till, för texten när adressen inte hittas */
  kommun?: string
  /** Länk till områdesvalet, när `kommun` har ett: visas när adressen inte hittas */
  areaHref?: string
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
  const [slow, setSlow] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Valen ligger i lagringen, så listan behöver ritas om när ett val glöms.
  const [, setForgotten] = useState(0)
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
      setSlow(false)
      return
    }
    const controller = new AbortController()
    let skeleton: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(async () => {
      try {
        setLoading(true)
        skeleton = setTimeout(() => setSlow(true), SKELETON_MS)
        const { addresses: results, failed, areaPickers } = await search(query, controller.signal, (partial) => {
          if (!controller.signal.aborted && (partial.addresses.length > 0 || partial.areaPickers.length > 0)) {
            setState((prev) => ({
              kind: 'results',
              query,
              results: keep(prev, partial.addresses),
              pickers: partial.areaPickers,
              failed: [],
              pending: true,
            }))
          }
        })
        if (controller.signal.aborted) return
        // Bara raden för områdesval är också ett resultat, inte "hittades inte".
        if (results.length > 0 || areaPickers.length > 0) {
          setState((prev) => ({ kind: 'results', query, results: keep(prev, results), pickers: areaPickers, failed }))
        } else {
          const [suggestions, kommuner] = await Promise.all([suggest(query, controller.signal), missing(query, controller.signal)])
          if (!controller.signal.aborted) setState({ kind: 'notFound', query, suggestions, failed, missing: kommuner })
        }
        setActive(-1)
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      } finally {
        clearTimeout(skeleton)
        if (!controller.signal.aborted) {
          setLoading(false)
          setSlow(false)
        }
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      clearTimeout(skeleton)
      controller.abort()
    }
  }, [query, search, suggest, missing])

  // Förra träffarna står kvar medan man skriver vidare eller suddar, men inte när texten byts ut.
  const related = (a: string, b: string) => normalize(a).startsWith(normalize(b)) || normalize(b).startsWith(normalize(a))
  const results = state.kind === 'results' && related(query, state.query) ? state.results : []
  const pickers = state.kind === 'results' && related(query, state.query) ? state.pickers : []
  const list = sections(results, pickers, expanded)
  const items = list.flatMap((s) => s.items)
  const open = results.length > 0 || pickers.length > 0
  // Svaret gäller frågan det kom för: en kortare fråga utan träffar får inte synas när man skrivit vidare.
  const showNotFound =
    state.kind === 'notFound' &&
    normalize(query).startsWith(normalize(state.query)) &&
    (submitted || normalize(state.query).length >= 4)
  // Räknas när läget för saknad kommun syns (se lib/analytics.ts).
  const shownMissing = showNotFound ? state.missing : undefined
  useEffect(() => {
    if (shownMissing?.length) reportMissingKommun(shownMissing)
  }, [shownMissing])
  // Bara när ingen lista syns: medan man skriver vidare står de förra träffarna kvar.
  const showSkeleton = slow && !open && !showNotFound && state.kind !== 'error'

  function go(address: Address) {
    navigate(`/${address.sourceId}/${address.id}`)
  }

  function choose(item: Item) {
    if (item.kind === 'address') go(item.address)
    else if (item.kind === 'picker') {
      const { sourceId, street, hasHits } = item.picker
      const choice = item.choice ?? (street && !hasHits ? loadChoice(sourceId, street) : undefined)
      if (choice) navigate(`/${sourceId}/${choice.areaId}`)
      else navigate(`/${sourceId}/omraden`, { state: { street } })
    } else if (item.kind === 'changeChoice') navigate(`/${item.picker.sourceId}/omraden`, { state: { street: item.picker.street, from: item.choice.areaId } })
    else if (item.kind === 'forgetChoice') {
      forgetChoice(item.picker.sourceId, item.choice.street)
      setActive(-1)
      setForgotten((n) => n + 1)
    }
    else setExpanded((prev) => new Set(prev).add(item.kommun ?? ALL))
  }

  /** Enter utan vald rad: öppnar en entydig träff, annars markeras första raden så att man kan välja. */
  function openOrMark(addresses: Address[], areaPickers: AreaPicker[]) {
    const [only] = areaPickers
    // Raden för områdesval som enda rad öppnas. Tillsammans med en träff avgör användaren själv.
    if (addresses.length === 0 && areaPickers.length === 1) return choose({ kind: 'picker', picker: only })
    const target = areaPickers.some((p) => !p.hasHits) ? undefined : enterTarget(query, addresses)
    if (target) go(target)
    else setActive(0)
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
      if (open && active >= 0 && state.kind === 'results' && state.query === query) {
        choose(items[active])
        return
      }
      // Svarar källor fortfarande kan fler träffar vara på väg, så då avgör den fullständiga sökningen.
      if (open && state.kind === 'results' && state.query === query && !state.pending) {
        openOrMark(state.results, state.pickers)
        return
      }
      setSubmitted(true)
      if (normalize(query).length < 2) return
      search(query, undefined, undefined, { submitted: true }).then(
        (fresh) => {
          if (fresh.addresses.length === 0 && fresh.areaPickers.length === 0) return
          setState({ kind: 'results', query, results: fresh.addresses, pickers: fresh.areaPickers, failed: fresh.failed })
          openOrMark(fresh.addresses, fresh.areaPickers)
        },
        () => setState({ kind: 'error' }),
      )
    } else if (e.key === 'Escape') {
      setState({ kind: 'idle' })
      inputRef.current?.blur()
      onDeactivate?.()
    }
  }

  function renderChoice(picker: AreaPicker, choice: AreaChoice, props: React.HTMLAttributes<HTMLLIElement>, selected: boolean) {
    return (
      <li key={`val/${picker.sourceId}`} {...props} className={cn('tryck flex cursor-pointer items-center gap-3 rounded-xl p-3', selected && 'bg-surface-2')}>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
          <Map className="size-[18px]" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="text-base font-extrabold text-text">{picker.street}</span>
          <span className="text-sm text-text-2">
            {choice.label} · {choice.day}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-2.5 py-0.5 text-[13px] font-extrabold text-warn">
            <UserCheck className="size-3.5" aria-hidden />
            Ditt val, inte från {getSource(picker.sourceId)?.name ?? picker.kommun}
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden />
      </li>
    )
  }

  function renderPicker(picker: AreaPicker, props: React.HTMLAttributes<HTMLLIElement>, selected: boolean, afterHits: boolean) {
    const name = kommunInText(picker.kommun)
    const key = `omraden/${picker.sourceId}`
    if (picker.hasHits) {
      return (
        <Fragment key={key}>
          {afterHits && <li role="none" aria-hidden className="mx-3 my-1 h-px bg-border" />}
          <li
            {...props}
            className={cn(
              'flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-extrabold text-primary',
              selected && 'bg-surface-2',
            )}
          >
            Se alla områden i {name}
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </li>
        </Fragment>
      )
    }
    return (
      <li key={key} {...props} className={cn('tryck flex cursor-pointer items-center gap-3 rounded-xl p-3', selected && 'bg-surface-2')}>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
          <Map className="size-[18px]" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-base font-extrabold text-text">{picker.street ?? `Välj område i ${name}`}</span>
          <span className="text-sm text-text-2">{picker.street && `Välj område i ${name}. `}Här finns schemat per område, inte per adress.</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden />
      </li>
    )
  }

  function renderItem(item: Item, showKommun: boolean) {
    const i = items.indexOf(item)
    const optionProps = (n: number, target: Item) => ({
      id: `${listId}-${n}`,
      role: 'option',
      'aria-selected': n === active,
      onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
      onClick: () => choose(target),
      onMouseEnter: () => setActive(n),
      onPointerDown: () => target.kind === 'address' && prefetch(target.address.sourceId, target.address.id),
    })
    const props = optionProps(i, item)
    if (item.kind === 'picker') {
      if (item.choice) return renderChoice(item.picker, item.choice, props, i === active)
      return renderPicker(item.picker, props, i === active, items[i - 1]?.kind === 'address')
    }
    // Båda alternativen står på samma rad, men är egna steg för piltangenterna.
    if (item.kind === 'forgetChoice') return null
    if (item.kind === 'changeChoice') {
      const link = (n: number, target: Item, label: string) => (
        <li {...optionProps(n, target)} className={cn('flex min-h-11 cursor-pointer items-center rounded-lg px-1.5 text-sm font-extrabold text-primary', n === active && 'bg-surface-2')}>
          {label}
        </li>
      )
      return (
        <li key={`andra/${item.picker.sourceId}`} role="none">
          <ul role="none" className="flex flex-wrap items-center gap-x-1 pr-3 pb-1 pl-[54px]">
            {link(i, item, 'Välj ett annat område')}
            <li role="none" aria-hidden className="text-sm text-text-2">·</li>
            {link(i + 1, items[i + 1], 'Glöm valet')}
          </ul>
        </li>
      )
    }
    if (item.kind === 'more') {
      return (
        <li
          key={`fler/${item.kommun ?? 'alla'}`}
          {...props}
          className={cn(
            'flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl py-2 pr-3 pl-[60px] text-sm font-extrabold text-primary',
            i === active && 'bg-surface-2',
          )}
        >
          Visa {item.count} till{item.kommun && ` i ${item.kommun}`}
          <ChevronDown className="size-4" aria-hidden />
        </li>
      )
    }
    const r = item.address
    // Ett område har sökord: då är kartan rätt ikon i stället för nålen.
    const RowIcon = r.searchTerms ? Map : MapPin
    const term = matchedTerm(query, r)
    // Orten kan saknas (Lidköping), och då ska raden varken börja med en punkt eller stå tom.
    const parts = [
      r.locality && <span key="locality">{r.locality}</span>,
      showKommun && (
        <span key="kommun" className="rounded-md bg-brand-soft px-2 py-0.5 text-[13px] font-extrabold text-brand-text">
          {r.kommun}
        </span>
      ),
    ].filter(Boolean)
    return (
      <li
        key={`${r.sourceId}/${r.id}`}
        {...props}
        className={cn('tryck flex cursor-pointer items-center gap-3 rounded-xl p-3', i === active && 'bg-surface-2')}
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text">
          <RowIcon className="size-[18px]" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-base font-extrabold text-text">{r.street}</span>
          {parts.length > 0 && (
            <span className="flex flex-wrap items-center gap-2 text-sm text-text-2">
              {parts.map((part, n) => (
                <Fragment key={n}>
                  {n > 0 && <span aria-hidden>·</span>}
                  {part}
                </Fragment>
              ))}
            </span>
          )}
          {/* Särskiljaren kan vara lång (SRV: "Matavfall varannan vecka, Restavfall varje vecka (3 kärl)"), så den får en egen rad. */}
          {r.detail && <span className="text-sm text-text-2">{r.detail}</span>}
          {term && <span className="text-sm font-extrabold text-primary">{term} ingår i området</span>}
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
                  {section.total > 0 && <span>{section.total}</span>}
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

      {showSkeleton && (
        <div className="absolute inset-x-0 top-full z-20 mt-3 rounded-[18px] border border-border bg-surface p-1.5 shadow-[0_12px_32px_#1B231F1F]">
          {[
            ['w-[132px]', 'w-[150px]'],
            ['w-[112px]', 'w-[120px]'],
            ['w-[144px]', 'w-24'],
          ].map(([street, meta]) => (
            <div key={street} aria-hidden className="flex items-center gap-3 p-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <span className="flex flex-col gap-2">
                <Skeleton className={cn('h-4 rounded-md', street)} />
                <Skeleton className={cn('h-3 rounded-md', meta)} />
              </span>
            </div>
          ))}
          <p role="status" className="flex items-center gap-2 px-3 pt-2 pb-2.5 text-sm font-semibold text-text-2">
            <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
            Söker adresser…
          </p>
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
          {showNotFound &&
            (state.missing.length > 0 ? (
              <MissingKommun kommuner={state.missing} className="shadow-[0_12px_32px_#1B231F1F]" />
            ) : (
              <NotFound suggestions={state.suggestions} kommun={kommun} areaHref={areaHref} className="shadow-[0_12px_32px_#1B231F1F]" />
            ))}
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
