// Vatten och miljöresurs (Härjedalen, Berg, Bräcke): Sitevision-appen "När kommer sopbilen?" hämtar
// kommunens alla adresser i ett anrop, med en kod per adress för frekvens, vecka och veckodag. Källan
// ger inga datum, så alla datum räknas fram. Se docs/specs/2026-11-17-vom-harjedalen-berg-bracke.md.

import { addDays, isoWeek, weekdayIndex } from '../domain/dates.js'
import { holidayOn } from '../domain/holidays.js'
import { weekRuleDates, type WeekRule } from '../domain/recurrence.js'
import type { Schedule } from '../domain/types.js'
import { edpAddressId, idHash, mergeSeries, type EdpBuilding } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const VOM_URL = 'https://www.vattenmiljoresurs.se/appresource'
const CACHE_MS = 6 * 60 * 60 * 1000
const MAX_HITS = 50

export interface VomAddress {
  building: EdpBuilding
  /** Källans kod, t.ex. "h211" (varannan vecka, udda veckor, måndag) */
  code: string
}

interface Row {
  ort: string
  hamtstalle: string
  tbfurenhkorlistarad_strtomningsfrekvenskod?: string | null
}

const unknownFormat = () => new SourceError('vattenmiljoresurs.se svarade med ett okänt format')
const clean = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase()

/** "h211": varannan vecka (h2), udda veckor (1), måndag (1). Veckodagen som `weekdayIndex` (0 = söndag). */
export function vomCode(code: string): (Pick<WeekRule, 'every' | 'parity'> & { weekday: number }) | null {
  const m = code.match(/^h([12])([12])([1-7])$/)
  if (!m) return null
  const weekday = Number(m[3]) % 7
  return m[1] === '1' ? { every: 1, weekday } : { every: 2, parity: m[2] === '1' ? 'udda' : 'jämn', weekday }
}

export function vomAddressId(hamtstalle: string, ort: string): string {
  return edpAddressId(building(hamtstalle, ort))
}

/** Bokstäver efter numret ("12 a-e", "12 a, b") är husets bokstäver och skrivs med versaler. */
const houseLetters = /^\p{L}(?:[-,]\p{L})*,?$/u

function display(text: string): string {
  let afterNumber = false
  const words = clean(text)
    .split(' ')
    .map((w) => {
      const out = afterNumber && houseLetters.test(w) ? w.toUpperCase() : w
      if (/\d/.test(w)) afterNumber = true
      return out
    })
    .join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function building(hamtstalle: string, ort: string): EdpBuilding {
  return { raw: `${hamtstalle}, ${ort}`, street: display(hamtstalle), locality: display(ort), buildingId: idHash(`${clean(hamtstalle)}, ${clean(ort)}`) }
}

/** Adresser med andra tecken ("/", parenteser, "+") kan inte ligga i ett adress-id i en URL. */
const usable = (hamtstalle: string) => /^[\p{L}\p{N}\s,.-]+$/u.test(hamtstalle) && /\p{L}/u.test(hamtstalle)

const cache = new Map<string, { at: number; addresses: VomAddress[] }>()
/** För testerna. */
export const clearVomCache = () => cache.clear()

/** Kommunens alla adresser, sparade i minnet i sex timmar. Dubbletter tas bort. */
export async function vomAddresses(resource: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<VomAddress[]> {
  const hit = cache.get(resource)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.addresses
  const body = await fetchJson<{ allAddresses?: unknown }>(`${VOM_URL}/${resource}/allAddresses`, {}, { fetchFn, timeoutMs })
  if (!Array.isArray(body?.allAddresses)) throw unknownFormat()
  const byId = new Map<string, VomAddress>()
  for (const row of body.allAddresses as Partial<Row>[]) {
    if (typeof row?.hamtstalle !== 'string' || typeof row.ort !== 'string') throw unknownFormat()
    if (!usable(row.hamtstalle)) continue
    const b = building(row.hamtstalle, row.ort)
    const id = edpAddressId(b)
    if (!byId.has(id)) byId.set(id, { building: b, code: clean(row.tbfurenhkorlistarad_strtomningsfrekvenskod ?? '') })
  }
  const addresses = [...byId.values()]
  cache.set(resource, { at: Date.now(), addresses })
  return addresses
}

/** Adresser som börjar med gatan i sökningen, som appens egen sökning. Orten tas bort. */
export async function vomSearch(resource: string, q: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<VomAddress[]> {
  const street = clean(q.split(',')[0])
  if (!street) return []
  const all = await vomAddresses(resource, fetchFn, timeoutMs)
  return all.filter((a) => clean(a.building.raw).startsWith(street)).slice(0, MAX_HITS)
}

export async function vomFind(resource: string, id: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<VomAddress | null> {
  return (await vomAddresses(resource, fetchFn, timeoutMs)).find((a) => edpAddressId(a.building) === id) ?? null
}

/** Den första dagen från och med i dag som passar koden. */
function firstDate(rule: NonNullable<ReturnType<typeof vomCode>>, today: string): string {
  for (let date = today; ; date = addDays(date, 1)) {
    if (weekdayIndex(date) !== rule.weekday) continue
    if (!rule.parity || isoWeek(date).week % 2 === (rule.parity === 'udda' ? 1 : 0)) return date
  }
}

/**
 * Datumen tolv månader framåt, alla beräknade. Varannan vecka följer ISO-veckans paritet, så vecka 53
 * och vecka 1 är båda udda (docs/specs/2026-11-03-vecka-53.md). En okänd kod ger inget schema.
 */
export function vomSchedule(code: string, today: string): Schedule {
  const rule = vomCode(code)
  if (!rule) return { bins: [], events: [], updatedAt: today }
  // weekRuleDates ser det första datumet som källans eget. Här är också det beräknat, med varning på en helgdag.
  const pickups = weekRuleDates(firstDate(rule, today), rule).map((p, i) => {
    const holiday = i === 0 ? holidayOn(p.date) : undefined
    return { ...p, estimated: true, ...(holiday && { warning: `Infaller på ${holiday.name} – kan flyttas.` }) }
  })
  const series = ['Restavfall', 'Matavfall'].flatMap((type) => {
    const mapped = mapWasteType(type)
    return mapped ? [{ mapped, pickups }] : []
  })
  return { bins: [], events: mergeSeries(series), updatedAt: today }
}
