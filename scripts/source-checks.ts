// Kontrollerna i bevakningen av källorna (docs/specs/2026-11-02-bevakning-av-kallor.md).
// Samma anrop som sajten gör, så att det som kontrolleras är det som körs i produktion.

import { addDays } from '../src/domain/dates.js'
import { edpSchedule, edpSearch } from '../src/server/edp.js'
import { SourceError } from '../src/server/http.js'
import type { Source } from '../src/sources/index.js'
import { classifyWasteTypes } from './check-source.js'

export type SourceState = 'fungerar' | 'svarar-inte' | 'nytt-format' | 'tom' | 'inga-tomningar' | 'schemat-tar-slut'

export interface SourceResult {
  sourceId: string
  name: string
  state: SourceState
  baseUrl?: string
  probe?: string
  /** Felet som det kom, t.ex. "futureweb.lidkoping.se svarade 502" */
  error?: string
  /** undefined = schemat hämtades inte, så avfallstyperna är okända */
  unknownWasteTypes?: string[]
}

const TIMEOUT_MS = 10000
/** Så långt fram som tömningar och statiska scheman ska räcka. */
const HORIZON_DAYS = 60

/**
 * Ingen kontakt, 5xx och spärrar (403, 408, 429) är avbrott; kommunernas sajter stoppar ibland anrop
 * från molnet. Allt annat (404, HTML, trasig JSON) tyder på ett nytt format.
 */
function stateForError(error: unknown): SourceState {
  const message = (error as Error).message ?? ''
  return error instanceof SourceError && /Ingen kontakt|svarade (5\d\d|403|408|429)/.test(message) ? 'svarar-inte' : 'nytt-format'
}

export async function checkEdpSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  if (source.config.system !== 'edp') throw new Error(`${source.id} är inte en EDP-källa`)
  const baseUrl = source.config.baseUrl
  const base = { sourceId: source.id, name: source.name, baseUrl, probe }

  // Råsvaren fångas på vägen: edpSearch gör om ett saknat Buildings till en tom lista.
  let raw: Record<string, unknown> | null = null
  const spy: typeof fetch = async (input, init) => {
    const res = await fetchFn(input, init)
    raw = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null
    return res
  }

  try {
    const buildings = await edpSearch(baseUrl, probe, spy, TIMEOUT_MS)
    const listed = (raw as { Buildings?: unknown } | null)?.Buildings
    if (!Array.isArray(listed)) return { ...base, state: 'nytt-format', error: 'Svaret saknar Buildings' }
    if (listed.length === 0) return { ...base, state: 'tom' }
    if (buildings.length === 0) return { ...base, state: 'nytt-format', error: `Ingen adress gick att tolka, t.ex. "${listed[0]}"` }

    const schedule = await edpSchedule(baseUrl, buildings[0].raw, spy, new Date(`${today}T12:00:00Z`), TIMEOUT_MS)
    const services = (raw as { RhServices?: unknown } | null)?.RhServices
    if (!Array.isArray(services)) return { ...base, state: 'nytt-format', error: 'Svaret saknar RhServices' }

    const unknownWasteTypes = classifyWasteTypes(services)
      .filter((w) => w.status === 'okänd')
      .map((w) => w.wasteType)
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = schedule.events.some((e) => e.date >= today && e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/** Statiska källor anropar ingenting; det som kan gå fel är att datafilerna tar slut. */
export function checkStaticSource(source: Source, validTo: string[], today: string): SourceResult {
  const last = [...validTo].sort().at(-1)
  const ending = !last || last < addDays(today, HORIZON_DAYS)
  return {
    sourceId: source.id,
    name: source.name,
    state: ending ? 'schemat-tar-slut' : 'fungerar',
    ...(ending && { error: last ? `Schemat gäller till ${last}` : 'Inga datafiler' }),
  }
}
