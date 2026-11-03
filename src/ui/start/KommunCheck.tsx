import { Check, CircleCheck, CircleDashed, Map, MapPin, MapPinPlus, Search, SearchX, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { SITE } from '@/config'
import { normalize } from '@/domain/search'
import { reportMissingKommun } from '@/lib/analytics'
import { kommunStatus, placeSuggestions, type KommunStatus, type PlaceSuggestion } from '@/providers/registry'

type Check = (place: string) => Promise<KommunStatus[] | null>
type Suggest = (prefix: string) => Promise<PlaceSuggestion[]>

/** Väntetid efter sista tangenttrycket innan orten slås upp */
const DEBOUNCE_MS = 200

const button = 'mt-2 inline-flex items-center gap-2 self-start rounded-xl px-3.5 py-2.5 text-[15px] font-extrabold'
const small = 'inline-flex items-center gap-1.5 text-[13px] font-extrabold hover:underline'

/** Knappen till adressökningen, eller en kort länk i raderna för flera kommuner */
function SearchLink({ kommun, compact = false }: { kommun: string; compact?: boolean }) {
  return (
    <Link
      to="/#sok"
      aria-label={`Sök adress i ${kommun}`}
      className={compact ? `${small} text-brand-text` : `${button} bg-brand-soft text-brand-text`}
    >
      <Search className="size-4" aria-hidden />
      {compact ? 'Sök adress' : `Sök adress i ${kommun}`}
    </Link>
  )
}

function TipLink({ kommun, compact = false }: { kommun: string; compact?: boolean }) {
  return (
    <a
      href={SITE.newMunicipalityIssueUrl}
      rel="noopener"
      aria-label={`Tipsa om ${kommun}`}
      className={compact ? `${small} text-earth` : `${button} bg-earth-soft text-earth`}
    >
      <MapPinPlus className="size-4" aria-hidden />
      {compact ? 'Tipsa' : `Tipsa om ${kommun}`}
    </a>
  )
}

function Answer({ icon: Icon, tone, title, children }: { icon: LucideIcon; tone: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-4">
      <div className="flex gap-3">
        <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-base leading-[1.25] font-extrabold text-text">{title}</h3>
          {children}
        </div>
      </div>
    </div>
  )
}

/** "limhamn" → "Limhamn", som det skrevs men med versal först */
const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('sv') + s.slice(1)

/** "Menade du …?": orter som börjar som det man skrivit. Ett klick fyller i orten. */
function Suggestions({ suggestions, onPick }: { suggestions: PlaceSuggestion[]; onPick: (place: string) => void }) {
  return (
    <Answer icon={Search} tone="bg-surface-2 text-text-2" title="Menade du …?">
      <ul className="-mx-2 flex flex-col pt-1">
        {suggestions.map(({ place, kommuner }) => {
          const covered = kommuner.some((k) => k.covered)
          const Icon = covered ? CircleCheck : CircleDashed
          const where = kommuner.length === 1 ? kommuner[0].name : `${kommuner.length} kommuner`
          return (
            <li key={place}>
              <button
                type="button"
                aria-label={`${place}, ${where}`}
                onClick={() => onPick(place)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
              >
                <Icon className={`size-4 shrink-0 ${covered ? 'text-primary' : 'text-earth'}`} aria-hidden />
                <span className="text-sm font-extrabold text-text">{place}</span>
                <span className="min-w-0 truncate text-[13px] text-text-2">{where}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </Answer>
  )
}

interface Found {
  place: string
  rows: KommunStatus[] | null
  suggestions: PlaceSuggestion[]
}

function Result({ place, rows, suggestions, onPick }: Found & { onPick: (place: string) => void }) {
  const text = 'text-sm leading-[1.45] text-text-2'
  if (rows === null) return <p className={text}>Det gick inte att slå upp orten just nu. Försök igen om en stund.</p>
  if (rows.length === 0 && suggestions.length > 0) return <Suggestions suggestions={suggestions} onPick={onPick} />
  if (rows.length === 0)
    return (
      <Answer icon={SearchX} tone="bg-surface-2 text-text-2" title="Hittar ingen ort som heter så">
        <p className={text}>Prova kommunens namn i stället.</p>
      </Answer>
    )
  if (rows.length > 1)
    return (
      <Answer icon={MapPin} tone="bg-surface-2 text-text-2" title={`${capitalize(place)} ligger i ${rows.length} kommuner`}>
        <ul className="flex flex-col gap-2 pt-1">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-2.5">
              {r.covered ? (
                <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <CircleDashed className="size-4 shrink-0 text-earth" aria-hidden />
              )}
              <span className="flex-1 text-sm font-extrabold text-text">{r.name}</span>
              {r.covered ? (
                <SearchLink kommun={r.name} compact />
              ) : (
                <TipLink kommun={r.name} compact />
              )}
            </li>
          ))}
        </ul>
      </Answer>
    )
  const [{ name, covered }] = rows
  // "Limhamn ligger i Malmö kommun." bara när man skrev en ort och inte kommunen själv
  const via = normalize(name, false).startsWith(normalize(place, false)) ? '' : `${capitalize(place)} ligger i ${name}. `
  return covered ? (
    <Answer icon={Check} tone="bg-brand-soft text-brand-text" title={`Ja, ${name} finns`}>
      <p className={text}>{via}Sök din adress så ser du schemat.</p>
      <SearchLink kommun={name} />
    </Answer>
  ) : (
    <Answer icon={Map} tone="bg-earth-soft text-earth" title={`${name} finns inte än`}>
      <p className={text}>{via}Berätta var kommunen publicerar sitt hämtschema, så kan vi lägga in den.</p>
      <TipLink kommun={name} />
    </Answer>
  )
}

/** "Finns din kommun?" i Bidra-kortet: svar medan man skriver en kommun eller ort. */
export function KommunCheck({ check = kommunStatus, suggest = placeSuggestions }: { check?: Check; suggest?: Suggest }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<Found>()
  const inputRef = useRef<HTMLInputElement>(null)
  const { hash } = useLocation()

  // Startsidans "Finns din kommun?" länkar hit
  useEffect(() => {
    if (hash === '#finns-din-kommun') inputRef.current?.focus({ preventScroll: true })
  }, [hash])

  useEffect(() => {
    const place = query.trim()
    if (!place) return
    let stale = false
    const timer = setTimeout(async () => {
      const rows = await check(place)
      // Förslag bara när det man skrivit inte är en ort, t.ex. halvvägs in i "Avesta"
      const suggestions = rows?.length === 0 ? await suggest(place) : []
      if (stale) return
      setResult({ place, rows, suggestions })
      const missing = rows?.filter((r) => !r.covered).map((r) => r.name) ?? []
      if (missing.length > 0) reportMissingKommun(missing)
    }, DEBOUNCE_MS)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [query, check, suggest])

  return (
    <div id="finns-din-kommun" className="flex scroll-mt-6 flex-col gap-3">
      <label htmlFor="finns-din-kommun-falt" className="text-[17px] font-extrabold text-text">
        Finns din kommun?
      </label>
      <div className="flex h-[52px] items-center gap-2.5 rounded-2xl border-[1.5px] border-border bg-surface pr-3.5 pl-4 focus-within:border-earth">
        <Search className="size-[18px] shrink-0 text-text-2" aria-hidden />
        <input
          ref={inputRef}
          id="finns-din-kommun-falt"
          type="text"
          aria-label="Kommun eller ort"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Kommun eller ort, t.ex. Limhamn"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-2"
        />
      </div>
      <div role="status">
        {result && query.trim() && (
          <Result
            {...result}
            onPick={(place) => {
              setQuery(place)
              inputRef.current?.focus()
            }}
          />
        )}
      </div>
    </div>
  )
}
