// Miva: "När kommer sopbilen?" på miva.se, en Sitevision-app utan API. Sidan renderas på servern och
// lägger appens tillstånd som JSON i registerInitialState, och det är bara det som läses (undantag från
// beslut 2 i docs/plans/2026-11-03-fler-kommuner.md). Sökträffarna är råa poster med personuppgifter,
// så bara adress, ort och frekvens läses ur dem. Se docs/specs/2026-11-16-ornskoldsvik-miva.md.

import { isoWeek, isValidDate, todayInStockholm, weekdayIndex } from '../domain/dates.js'
import { expandWeekdays, weekRuleDates, type ExpandedPickup } from '../domain/recurrence.js'
import type { Schedule } from '../domain/types.js'
import { edpAddressId, idHash, mergeSeries, queryFromAddressId, titleCase, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchHtml, SourceError } from './http.js'

export const MIVA_URL = 'https://miva.se/kundservice/sjalvservice/sophamtning/nar-kommer-sopbilen'
export const MIVA_APP = '12.5e486747177feaef88f29850'

export interface MivaState {
  route: string
  hits?: unknown[]
  trips?: unknown[]
  address?: unknown
  city?: unknown
}

export interface MivaAddress {
  building: EdpBuilding
  /** Källans exakta text. Schemat är versalkänsligt i adressen. */
  address: string
  city: string
  /** De olika frekvenserna ("Var 14:e dag") för adressens kärl. Tom när sökningen gick direkt till schemat. */
  frequencies: string[]
}

const unknownFormat = () => new SourceError('miva.se svarade med ett okänt format')
const isText = (v: unknown): v is string => typeof v === 'string'
const MARK = `registerInitialState('${MIVA_APP}',`

/** Appens tillstånd. Saknas det, eller har det varken träffar eller turer, har Miva ändrat appen. */
export function mivaState(html: string): MivaState {
  const start = html.indexOf(MARK)
  const end = start < 0 ? -1 : html.indexOf(');</script>', start)
  if (end < 0) throw unknownFormat()
  let state: unknown
  try {
    state = JSON.parse(html.slice(start + MARK.length, end))
  } catch {
    throw unknownFormat()
  }
  const s = state as MivaState
  if (!s || typeof s !== 'object' || !isText(s.route) || (!Array.isArray(s.hits) && !Array.isArray(s.trips))) throw unknownFormat()
  return s
}

/** Sidan för en route i appen, med dess parametrar. */
export async function mivaPage(route: string, params: Record<string, string>, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<MivaState> {
  const query = new URLSearchParams({ 'sv.target': MIVA_APP, [`sv.${MIVA_APP}.route`]: route, ...params })
  return mivaState(await fetchHtml(`${MIVA_URL}?${query}`, { fetchFn, timeoutMs }))
}

/** "nygatan-2_örnsköldsvik-<hash>". Orten med versaler i hashen, eftersom träffar och schema skriver den olika. */
export function mivaAddressId(address: string, city: string): string {
  return edpAddressId(building(address, city))
}

function building(address: string, city: string): EdpBuilding {
  const clean = (t: string) => t.trim().replace(/\s+/g, ' ')
  return { raw: `${address}, ${city}`, street: clean(address), locality: titleCase(clean(city)), buildingId: idHash(`${address}, ${city.toUpperCase()}`) }
}

/** Orten tas bort, eftersom källan ger en tom lista med den. Skiljetecken blir mellanslag. */
const searchable = (q: string) =>
  q
    .split(',')[0]
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Schemat går inte att hämta för andra tecken ("Nygatan 5/ He"). */
const canBeFoundAgain = (text: string) => /^[\p{L}\p{N}\s-]+$/u.test(text)

export async function mivaSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<MivaAddress[]> {
  const query = searchable(q)
  if (!query) return []
  const state = await mivaPage('/', { q: query }, fetchFn, timeoutMs)
  // Exakt en adress: appen går direkt till schemat, utan träffar och därmed utan frekvens.
  if (!Array.isArray(state.hits) || (state.hits.length === 0 && state.route === '/schedule')) {
    if (!isText(state.address) || !isText(state.city)) return []
    return canBeFoundAgain(state.address) ? [{ building: building(state.address, state.city), address: state.address, city: state.city, frequencies: [] }] : []
  }
  const byAddress = new Map<string, MivaAddress>()
  for (const hit of state.hits as Record<string, unknown>[]) {
    // Bara de här tre fälten läses. Resten av träffen är personuppgifter och följer inte med.
    const { PickupAddress: address, PickupCity: city, ExternalId: frequency } = hit ?? {}
    if (!isText(address) || !isText(city)) throw unknownFormat()
    if (!canBeFoundAgain(address)) continue
    const key = `${address}|${city.toUpperCase()}`
    const found = byAddress.get(key) ?? { building: building(address, city), address, city, frequencies: [] }
    if (isText(frequency) && frequency.trim() && !found.frequencies.includes(frequency.trim())) found.frequencies.push(frequency.trim())
    byAddress.set(key, found)
  }
  return [...byAddress.values()]
}

/** Adressen för ett adress-id. Gick sökningen direkt till schemat söks gatan utan nummer, för frekvensen. */
export async function mivaFind(id: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<MivaAddress | null> {
  const parsed = queryFromAddressId(id)
  if (!parsed) return null
  const same = (a: MivaAddress) => mivaAddressId(a.address, a.city) === id
  const found = (await mivaSearch(parsed.query, fetchFn, timeoutMs)).find(same)
  if (!found || found.frequencies.length > 0) return found ?? null
  const street = searchable(parsed.query).replace(/\s+\d+\s*\p{L}?$/u, '')
  const listed = street && street !== searchable(parsed.query) ? (await mivaSearch(street, fetchFn, timeoutMs)).find(same) : undefined
  return { ...found, frequencies: listed?.frequencies ?? [] }
}

/** En tur i schemat. `next` är adressens nästa tömning på vilken tur som helst, inte turens egen. */
export interface MivaTrip {
  text: string
  types: string[]
  first: string
  next?: string
}

/** Källans tidpunkt för midnatt svensk tid ("2026-11-22T23:00:00.000Z") som datum. */
function stockholmDate(iso: unknown): string {
  if (!isText(iso) || Number.isNaN(Date.parse(iso))) throw unknownFormat()
  const date = todayInStockholm(new Date(iso))
  if (!isValidDate(date)) throw unknownFormat()
  return date
}

/**
 * En tom lista är ett giltigt svar för en adress som sökningen hittar. Orten skickas med versaler som i
 * sökträffarna: schemat skriver den "Bredbyn" men är tomt för den stavningen.
 */
export async function mivaTrips(a: Pick<MivaAddress, 'address' | 'city'>, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<MivaTrip[]> {
  const state = await mivaPage(`/details/${a.address}`, { city: a.city.toLocaleUpperCase('sv') }, fetchFn, timeoutMs)
  if (!Array.isArray(state.trips)) throw unknownFormat()
  return (state.trips as Record<string, unknown>[]).map((t) => {
    if (!isText(t?.text) || !Array.isArray(t.containers)) throw unknownFormat()
    const types = (t.containers as Record<string, unknown>[]).map((c) => c?.typeText)
    if (!types.every(isText)) throw unknownFormat()
    return { text: t.text, types: [...new Set(types)], first: stockholmDate(t.pickupDateIso), ...(t.nextPickupDateIso != null && { next: stockholmDate(t.nextPickupDateIso) }) }
  })
}

/** Frekvenserna Sopor kan räkna fram, tätast först. */
const FREQUENCIES = ['2 gånger per vecka', '1 gång per vecka', 'var 14:e dag', 'var 14:e dag (v 22-39)']
const densest = (frequencies: string[]) => FREQUENCIES.find((f) => frequencies.some((x) => x.trim().replace(/\s+/g, ' ').toLowerCase() === f))
/** Om Sopor kan räkna fram datum för frekvensen. Bevakningen rapporterar andra. */
export const isKnownMivaFrequency = (frequency: string) => densest([frequency]) !== undefined
const isoWeekday = (date: string) => ((weekdayIndex(date) + 6) % 7) + 1

/**
 * Turens datum. Veckodag och paritet tas från källans datum, inte från texten: texten följer årets
 * paritet, och efter vecka 53 är den fel för nästa år. Källans `next` räknas bara när regeln ger det.
 */
function tripDates(t: MivaTrip, frequency: string | undefined, onlyTrip: boolean): ExpandedPickup[] {
  const own = [t.first, ...(onlyTrip && t.next ? [t.next] : [])].map((date) => ({ date, estimated: false }))
  const weekday = weekdayIndex(t.first)
  const parity = isoWeek(t.first).week % 2 === 0 ? 'jämn' : 'udda'
  const rule =
    frequency === 'var 14:e dag'
      ? weekRuleDates(t.first, { weekday, every: 2, parity })
      : frequency === 'var 14:e dag (v 22-39)'
        ? weekRuleDates(t.first, { weekday, every: 2, parity }, { inWeeks: [22, 39] })
        : frequency === '1 gång per vecka'
          ? weekRuleDates(t.first, { weekday, every: 1 })
          : frequency === '2 gånger per vecka' && onlyTrip && t.next
            ? expandWeekdays({ next: t.first, weekdays: [...new Set([isoWeekday(t.first), isoWeekday(t.next)])] })
            : null
  if (!rule) return own
  return rule.map((p) => (p.date === t.next ? { date: p.date, estimated: false } : p))
}

/** Datumen från i dag, en händelse per dag. Framräknade datum är `estimated`, som för EDP. */
export function mivaSchedule(trips: MivaTrip[], frequencies: string[], today: string): Schedule {
  const frequency = densest(frequencies)
  const series = trips.flatMap((t) => {
    const pickups = tripDates(t, frequency, trips.length === 1).filter((p) => p.date >= today)
    return t.types.flatMap((type): PickupSeries[] => {
      const mapped = mapWasteType(type)
      return mapped ? [{ mapped, pickups }] : []
    })
  })
  return { bins: [], events: mergeSeries(series), updatedAt: today }
}
