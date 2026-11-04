// Roslagsvatten: hämtningsschemat på roslagsvatten.se. Svaren är HTML i JSON, och kommunen krävs i
// varje anrop. Adresserna blir EdpBuilding och får EDP:s adress-id med en hash av värdet. Allt vi
// inte känner igen blir ett fel i stället för ett tomt svar. Se docs/specs/2026-11-04-roslagsvatten.md.

import { formatShort, isValidDate } from '../domain/dates.js'
import { expandWeekdays, weekRuleDates, type ExpandedPickup } from '../domain/recurrence.js'
import type { Schedule } from '../domain/types.js'
import { edpAddressId, edpRule, idHash, mergeSeries, queryFromAddressId, weekdaysIn, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const ROSLAGSVATTEN_URL = 'https://roslagsvatten.se'

/** Fler träffar på samma adress än så här hämtar inga kärl, för att hålla anropen få. */
const MAX_DETAILS = 20

export interface RoslagsvattenAddress {
  building: EdpBuilding
  buildingId: string
}

export interface RoslagsvattenPickup {
  type: string
  frequency: string
  date?: string
}

const unknownFormat = () => new SourceError('roslagsvatten.se svarade med ett okänt format')

const ENTITIES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#039;': "'", '&lt;': '<', '&gt;': '>' }
const text = (html: string) => html.replace(/&(?:amp|quot|#039|lt|gt);/g, (e) => ENTITIES[e]).replace(/\s+/g, ' ').trim()

/** Sajten svarar 500 med den här texten när sökningen inte hittar något, se specen. */
const NO_HITS = 'The website encountered an unexpected error'

const noHitsAsEmpty = (fetchFn: typeof fetch = fetch): typeof fetch => async (input, init) => {
  const res = await fetchFn(input, init)
  if (res.status !== 500 || !(await res.clone().text()).includes(NO_HITS)) return res
  return new Response(JSON.stringify([{ data: '<ul id="waste-schedule-building-list"></ul>' }]), { headers: { 'Content-Type': 'application/json' } })
}

async function post(path: string, body: Record<string, string>, fetchFn: typeof fetch | undefined, timeoutMs: number): Promise<string> {
  const init = { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }
  const res = await fetchJson<unknown>(`${ROSLAGSVATTEN_URL}${path}`, init, { fetchFn, timeoutMs })
  const data = Array.isArray(res) ? (res[0] as { data?: unknown } | undefined)?.data : undefined
  if (typeof data !== 'string') throw unknownFormat()
  return data
}

/** Orten och allt efter första numret: "Hamnvägen 2A" hittar inte "Hamnvägen 2 A". */
const searchable = (q: string) => q.split(',')[0].trim().replace(/(\d+).*$/, '$1')

function toAddress(bid: string, raw: string): RoslagsvattenAddress {
  const [street, locality = ''] = text(raw).split(',').map((p) => p.trim())
  if (!street) throw unknownFormat()
  return { building: { raw: text(raw), street, locality, buildingId: idHash(bid) }, buildingId: bid }
}

export async function roslagsvattenSearch(municipality: string, q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<RoslagsvattenAddress[]> {
  const data = await post('/schedule/search', { searchText: searchable(q), municipality }, noHitsAsEmpty(fetchFn), timeoutMs)
  if (!data.includes('waste-schedule-building-list')) throw unknownFormat()
  return [...data.matchAll(/<li\b([^>]*)>([^<]*)<\/li>/g)].map(([, attributes, raw]) => {
    const bid = attributes.match(/data-bid="([^"]+)"/)?.[1]
    if (!bid) throw unknownFormat()
    return toAddress(bid, raw)
  })
}

const samePlace = (a: EdpBuilding, b: EdpBuilding) => a.street.toLowerCase() === b.street.toLowerCase() && a.locality.toLowerCase() === b.locality.toLowerCase()

/**
 * Adressen för ett adress-id. Finns inte hashen längre, och det är den enda träffen på adressen,
 * används den med id:t oförändrat: id:t pekar ju på adressen. Id:t saknar tecken som ":" och "/"
 * ("Gustav III:s väg 2"), så ger gatan inget söks det brett på de första bokstäverna.
 */
export async function roslagsvattenFind(municipality: string, id: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<RoslagsvattenAddress | null> {
  const parsed = queryFromAddressId(id)
  if (!parsed) return null
  const matching = async (q: string) => (await roslagsvattenSearch(municipality, q, fetchFn, timeoutMs)).filter((a) => edpAddressId({ ...a.building, buildingId: parsed.buildingId }) === id)
  const exact = await matching(parsed.query)
  const here = exact.length > 0 ? exact : await matching(parsed.query.slice(0, 3))
  const found = here.find((a) => a.building.buildingId === parsed.buildingId) ?? (here.length === 1 ? here[0] : undefined)
  return found ? { ...found, building: { ...found.building, buildingId: parsed.buildingId } } : null
}

/** En vecka eller månad ("v47 Nov 2026", "v21-22 Maj 2027", "Nov 2026"): inget datum, och förekommer på slam och fett. */
const ROUGH_DATE = /^(?:v\d+(?:-\d+)? )?\p{Lu}\p{Ll}+ \d{4}$/u

/** Kärlen för en adress. Ett kärl utan datum har ingen planerad tömning. */
export async function roslagsvattenPickups(municipality: string, buildingId: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<RoslagsvattenPickup[]> {
  const data = await post('/schedule/fetch', { buildingId, municipality }, fetchFn, timeoutMs)
  if (!data.includes('waste-schedule-results')) throw unknownFormat()
  const rows = [...data.matchAll(/<h3>([^<]*)<\/h3>\s*<p>Frekvens:([^<]*)<\/p>\s*<p>Nästa hämtning:([^<]*)<\/p>/g)]
  if (rows.length !== data.split('waste-schedule-inner').length - 1) throw unknownFormat()
  return rows.flatMap(([, rawType, rawFrequency, rawDate]) => {
    const [type, frequency, date] = [text(rawType), text(rawFrequency), text(rawDate)]
    const dated = isValidDate(date)
    if ((date && !dated && !ROUGH_DATE.test(date)) || (dated && !type)) throw unknownFormat()
    if (!type) return []
    return [{ type, frequency, ...(dated && { date }) }]
  })
}

/** Tömningar per år enligt frekvenstexten. 0 = okänt, och då räknas inget fram (se `edpRule`). */
function perYear(frequency: string): number {
  const stated = frequency.match(/(\d+) ggr/)?.[1]
  if (stated) return Number(stated)
  if (/var 4:e vecka/i.test(frequency)) return 13
  if (/(?:udda|jämn) vecka/i.test(frequency)) return 26
  return /varje vecka/i.test(frequency) ? 52 : 0
}

function expand(next: string, frequency: string): ExpandedPickup[] {
  const weekdays = weekdaysIn(frequency)
  if (weekdays.length > 1 && /varje vecka/i.test(frequency) && !/\d+ ggr|säsong/i.test(frequency)) return expandWeekdays({ next, weekdays })
  const rule = edpRule(frequency, perYear(frequency))
  return rule ? weekRuleDates(next, rule) : [{ date: next, estimated: false }]
}

/** Datumen från i dag. Bara kärl som har ett datum hos källan räknas fram, se specen om Ekerös fyrfackskärl. */
export function roslagsvattenSchedule(pickups: RoslagsvattenPickup[], today: string): Schedule {
  const series = pickups.flatMap((p): PickupSeries[] => {
    const mapped = mapWasteType(p.type, p.frequency)
    if (!mapped || !p.date) return []
    return [{ mapped, pickups: expand(p.date, p.frequency).filter((d) => d.date >= today) }]
  })
  return { bins: [], events: mergeSeries(series), updatedAt: today }
}

/** "* 52 ggr/år. Varje vecka helår. Avfall" → "52 ggr/år. Varje vecka helår", och liten bokstav först. */
const shortFrequency = (frequency: string) => {
  const t = frequency.replace(/^\*\s*/, '').replace(/\.\s*(?:Avfall|Slam)\b.*$/, '').trim()
  return t.charAt(0).toLowerCase() + t.slice(1)
}

/**
 * Flera träffar på samma adress får kärlen som särskiljare, och är de lika också frekvensen och
 * nästa tömning. Samma schema visas en gång. Går kärlen inte att hämta blir det ingen särskiljare
 * i stället för en misslyckad sökning.
 */
export async function roslagsvattenDetails(municipality: string, addresses: RoslagsvattenAddress[], today: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<[EdpBuilding, string | undefined][]> {
  const same = (a: RoslagsvattenAddress, o: RoslagsvattenAddress) => o !== a && samePlace(o.building, a.building)
  const shared = addresses.filter((a) => addresses.some((o) => same(a, o)))
  if (shared.length > MAX_DETAILS) return addresses.map((a) => [a.building, undefined])
  const info = new Map<RoslagsvattenAddress, { bins: string; often: string; next?: string; schedule: string }>()
  await Promise.all(
    shared.map(async (a) => {
      const pickups = await roslagsvattenPickups(municipality, a.buildingId, fetchFn, timeoutMs).catch(() => undefined)
      if (!pickups) return
      const { events } = roslagsvattenSchedule(pickups, today)
      const shown = pickups.filter((p) => p.date && mapWasteType(p.type, p.frequency))
      const unique = (values: string[]) => [...new Set(values)].sort((x, y) => x.localeCompare(y, 'sv')).join(', ')
      info.set(a, { bins: unique(shown.map((p) => p.type)), often: unique(shown.map((p) => shortFrequency(p.frequency))), next: events[0]?.date, schedule: JSON.stringify(events) })
    }),
  )
  const kept = addresses.filter((a, i) => !addresses.slice(0, i).some((o) => same(a, o) && info.has(a) && info.get(o)?.schedule === info.get(a)?.schedule))
  return kept.map((a) => {
    const own = info.get(a)
    const others = kept.filter((o) => same(a, o))
    if (!own || others.length === 0) return [a.building, undefined]
    if (!own.bins) return [a.building, 'Inga tömningar just nu']
    const sameBins = others.some((o) => info.get(o)?.bins === own.bins)
    return [a.building, sameBins && own.next ? `${own.bins}, ${own.often}, nästa ${formatShort(own.next)}` : own.bins]
  })
}
