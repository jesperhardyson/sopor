// SRV återvinning (Huddinge, Botkyrka, Haninge, Nynäshamn och Salem): söktjänsten på
// srvatervinning.se. Förslagen ger adresser med kundnummer, och kundnumret ger kärlen med ett års
// tömningar. Adresserna blir EdpBuilding och får EDP:s adress-id, med en hash av kundnumret i
// stället för numret. Allt vi inte känner igen blir ett fel i stället för ett tomt svar.
// Se docs/specs/2026-11-03-srv.md.

import { formatShort, isValidDate } from '../domain/dates.js'
import type { Schedule } from '../domain/types.js'
import { edpAddressId, idHash, mergeSeries, queryFromAddressId, titleCase, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const SRV_URL = 'https://www.srvatervinning.se/rest-api/core/sewagePickup'

export interface SrvContainer {
  /** "Restavfall", "Papper och Plast", "Kärl 1" … */
  contentType: string
  /** "Kärl 370 liter kärl 1 restavfall" */
  containerType: string
  /** "Varje vecka", "Varannan vecka" …, eller false (villornas nya kärl) */
  frequency?: string | boolean
  calendars: { startDate: string; jobTemplate: string; isActive: boolean }[]
}

/** En adress ur förslagen. Kundnumret lämnar aldrig servern: id:t har bara dess hash. */
export interface SrvAddress {
  building: EdpBuilding
  customerId: string
}

/** Kunduppslaget tar 4–5 s för stora kunder (många kärl med ett års tömningar). */
export const SRV_CUSTOMER_TIMEOUT_MS = 10000

const unknownFormat = () => new SourceError('srvatervinning.se svarade med ett okänt format')

const isText = (v: unknown): v is string => typeof v === 'string'

/**
 * Kundnumrets plats i adress-id:t. Kundnumret syns inte i länkar och kalendrar, men hashen skyddar
 * det inte: numren är korta, och SRV visar dem i sökrutan.
 */
export const srvKey = idHash

const toAddress = (address: string, city: string, customerId: string): SrvAddress => ({
  building: { raw: `${address}, ${city}`, street: address.trim().replace(/\s+/g, ' '), locality: titleCase(city.trim()), buildingId: srvKey(customerId) },
  customerId,
})

const samePlace = (a: EdpBuilding, b: EdpBuilding) => a.street.toLowerCase() === b.street.toLowerCase() && a.locality.toLowerCase() === b.locality.toLowerCase()

/** Förslagen är det enda som ger flera träffar. Orten följer inte med: med den blir det inga. */
export async function srvSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<SrvAddress[]> {
  const res = await fetchJson<{ results?: unknown }>(`${SRV_URL}/getSuggestions?${new URLSearchParams({ query: q.trim() })}`, {}, { fetchFn, timeoutMs })
  if (!Array.isArray(res?.results)) throw unknownFormat()
  return res.results.map((r: Record<string, unknown>) => {
    const { customerId, address, city } = r ?? {}
    if (!isText(customerId) || !/^\w+$/.test(customerId) || !isText(address) || !address.trim() || !isText(city)) throw unknownFormat()
    return toAddress(address, city, customerId)
  })
}

function containersOf(value: unknown): SrvContainer[] {
  if (!Array.isArray(value)) throw unknownFormat()
  for (const c of value) {
    if (!isText(c?.contentType) || !isText(c.containerType) || !Array.isArray(c.calendars)) throw unknownFormat()
    for (const cal of c.calendars) {
      if (!isText(cal?.startDate) || !isValidDate(cal.startDate) || !isText(cal.jobTemplate) || typeof cal.isActive !== 'boolean') throw unknownFormat()
    }
  }
  return value
}

interface CustomerResponse {
  multipleAddresses?: unknown
  customerAddresses?: { address?: unknown; city?: unknown; zip?: unknown }[]
  results?: { address?: unknown; city?: unknown; containers?: unknown }[]
}

/** Kärlen på kundens adress, eller null. En kund med flera adresser svarar bara med den första. */
export async function srvContainers({ building, customerId }: SrvAddress, fetchFn?: typeof fetch, timeoutMs = SRV_CUSTOMER_TIMEOUT_MS): Promise<SrvContainer[] | null> {
  const opts = { fetchFn, timeoutMs }
  const res = await fetchJson<CustomerResponse>(`${SRV_URL}/search?${new URLSearchParams({ query: customerId, city: '' })}`, {}, opts)
  if (typeof res?.multipleAddresses !== 'boolean' || !Array.isArray(res.customerAddresses) || !Array.isArray(res.results)) throw unknownFormat()
  const matches = (address: unknown, city: unknown) => isText(address) && isText(city) && samePlace(toAddress(address, city, customerId).building, building)

  const first = res.results[0]
  if (first && matches(first.address, first.city)) return containersOf(first.containers)
  const other = res.multipleAddresses ? res.customerAddresses.find((a) => matches(a.address, a.city)) : undefined
  if (!other) return null
  const params = new URLSearchParams({ address: String(other.address), zipCode: String(other.zip ?? ''), city: String(other.city), customerId })
  const found = await fetchJson<{ containers?: unknown }>(`${SRV_URL}/searchByCustomerAndAddress?${params}`, {}, opts)
  return containersOf(found?.containers)
}

/**
 * Adressen och kärlen för ett adress-id. Förslagen för gatan ger kundnumret vars hash står i id:t.
 * Finns det inte längre (huset har fått en ny kund) används den nya kunden, om den är ensam på
 * adressen: id:t pekar ju på adressen.
 */
export async function srvFind(id: string, fetchFn?: typeof fetch, timeoutMs = SRV_CUSTOMER_TIMEOUT_MS): Promise<{ building: EdpBuilding; containers: SrvContainer[] } | null> {
  const parsed = queryFromAddressId(id)
  if (!parsed) return null
  const street = parsed.query.split(',')[0].trim()
  const here = (await srvSearch(street, fetchFn, timeoutMs)).filter((a) => edpAddressId({ ...a.building, buildingId: parsed.buildingId }) === id)
  const found = here.find((a) => a.building.buildingId === parsed.buildingId) ?? (here.length === 1 ? here[0] : undefined)
  if (!found) return null
  const containers = await srvContainers(found, fetchFn, timeoutMs)
  return containers && { building: { ...found.building, buildingId: parsed.buildingId }, containers }
}

/** Villornas "Kärl 1" och "Kärl 2" säger vad de innehåller i kärltypen: "Kärl 370 liter kärl 1 restavfall". */
export function srvWasteType(c: Pick<SrvContainer, 'contentType' | 'containerType'>): PickupSeries['mapped'] | null {
  if (!/^kärl \d+$/i.test(c.contentType.trim())) return mapWasteType(c.contentType)
  const inside = c.containerType.match(/kärl \d+\s+(\D+)$/i)?.[1]
  const mapped = inside ? mapWasteType(inside) : null
  return mapped && !mapped.fractions.includes('karl') ? mapped : { fractions: ['karl'], label: c.contentType.trim() }
}

/** Jobb som inte är tömningar: SRV hämtar eller levererar kärl när det nya systemet kommer. */
export const isSrvPickup = (jobTemplate: string) => /tömning/i.test(jobTemplate)
export const isKnownSrvJob = (jobTemplate: string) => isSrvPickup(jobTemplate) || /^(hemtagning|utleverans)\b/i.test(jobTemplate)

/** Kärlens aktiva tömningar från i dag, en händelse per dag. Bara källans egna datum. */
export function srvSchedule(containers: SrvContainer[], today: string): Schedule {
  const series = containers.map((c): PickupSeries | null => {
    const mapped = srvWasteType(c)
    const pickups = c.calendars
      .filter((cal) => cal.isActive && isSrvPickup(cal.jobTemplate) && cal.startDate >= today)
      .map((cal) => ({ date: cal.startDate, estimated: false }))
    return mapped ? { pickups, mapped } : null
  })
  return { bins: [], events: mergeSeries(series.filter((s) => s !== null)), updatedAt: today }
}

/**
 * "Matavfall varannan vecka, Restavfall varje vecka (3 kärl)": fraktionerna, hur ofta de töms och
 * hur många kärl eller containrar det är. Det är det som skiljer kunderna på en adress åt.
 */
function describeBins(containers: SrvContainer[]): string {
  const groups = new Map<string, { text: string; count: number; container: boolean }>()
  for (const c of containers) {
    if (!c.calendars.some((cal) => cal.isActive && isSrvPickup(cal.jobTemplate))) continue
    const frequency = typeof c.frequency === 'string' ? c.frequency.trim().toLowerCase() : ''
    const text = [c.contentType.trim(), frequency].filter(Boolean).join(' ')
    const container = /^container/i.test(c.containerType.trim())
    const group = groups.get(`${text}|${container}`) ?? { text, count: 0, container }
    group.count++
    groups.set(`${text}|${container}`, group)
  }
  return [...groups.values()]
    .map(({ text, count, container }) => {
      if (container) return `${text} (${count > 1 ? `${count} containrar` : 'container'})`
      return count > 1 ? `${text} (${count} kärl)` : text
    })
    .sort((x, y) => x.localeCompare(y, 'sv'))
    .join(', ')
}

/**
 * Flera kunder på samma adress får kärlen som särskiljare, och är de lika också nästa tömning.
 * Kunder med exakt samma schema visas en gång: då spelar det ingen roll vilken man väljer. Kärlen
 * hämtas bara för de adresserna, och går det inte blir det ingen särskiljare i stället för en
 * misslyckad sökning. Kundnumret visas aldrig.
 */
export async function srvDetails(addresses: SrvAddress[], today: string, fetchFn?: typeof fetch, timeoutMs = SRV_CUSTOMER_TIMEOUT_MS): Promise<[EdpBuilding, string | undefined][]> {
  const shared = addresses.filter((a) => addresses.some((o) => o !== a && samePlace(o.building, a.building)))
  const info = new Map<SrvAddress, { bins: string; next?: string; schedule: string }>()
  await Promise.all(
    shared.map(async (a) => {
      const containers = await srvContainers(a, fetchFn, timeoutMs).catch(() => undefined)
      if (containers === undefined) return
      const events = srvSchedule(containers ?? [], today).events
      info.set(a, { bins: describeBins(containers ?? []), next: events[0]?.date, schedule: JSON.stringify(events) })
    }),
  )
  const same = (a: SrvAddress, o: SrvAddress) => o !== a && samePlace(o.building, a.building)
  const kept = addresses.filter((a, i) => !addresses.slice(0, i).some((o) => same(a, o) && info.has(a) && info.get(o)?.schedule === info.get(a)?.schedule))
  return kept.map((a) => {
    const own = info.get(a)
    const others = kept.filter((o) => same(a, o))
    if (!own || others.length === 0) return [a.building, undefined]
    if (!own.bins) return [a.building, 'Inga tömningar just nu']
    const sameBins = others.some((o) => info.get(o)?.bins === own.bins)
    return [a.building, sameBins && own.next ? `${own.bins}, nästa ${formatShort(own.next)}` : own.bins]
  })
}
