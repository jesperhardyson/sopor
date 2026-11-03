// SRV återvinning (Huddinge, Botkyrka, Haninge, Nynäshamn och Salem): söktjänsten på
// srvatervinning.se. Förslagen ger adresser med kundnummer, och kundnumret ger kärlen med ett års
// tömningar. Adresserna blir EdpBuilding och får EDP:s adress-id. Allt vi inte känner igen blir ett
// fel i stället för ett tomt svar. Se docs/specs/2026-11-03-srv.md.

import { isValidDate } from '../domain/dates.js'
import type { Schedule } from '../domain/types.js'
import { edpAddressId, mergeSeries, queryFromAddressId, titleCase, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const SRV_URL = 'https://www.srvatervinning.se/rest-api/core/sewagePickup'

export interface SrvContainer {
  /** "Restavfall", "Papper och Plast", "Kärl 1" … */
  contentType: string
  /** "Kärl 370 liter kärl 1 restavfall" */
  containerType: string
  calendars: { startDate: string; jobTemplate: string; isActive: boolean }[]
}

const unknownFormat = () => new SourceError('srvatervinning.se svarade med ett okänt format')

const isText = (v: unknown): v is string => typeof v === 'string'

const toBuilding = (address: string, city: string, customerId: string, raw = `${address}, ${city}`): EdpBuilding => ({
  raw,
  street: address.trim().replace(/\s+/g, ' '),
  locality: titleCase(city.trim()),
  buildingId: customerId,
})

/** Förslagen är det enda som ger flera träffar. Orten följer inte med: med den blir det inga. */
export async function srvSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<EdpBuilding[]> {
  const res = await fetchJson<{ results?: unknown }>(`${SRV_URL}/getSuggestions?${new URLSearchParams({ query: q.trim() })}`, {}, { fetchFn, timeoutMs })
  if (!Array.isArray(res?.results)) throw unknownFormat()
  return res.results.map((r: Record<string, unknown>) => {
    const { name, customerId, address, city } = r ?? {}
    if (!isText(customerId) || !/^\w+$/.test(customerId) || !isText(address) || !address.trim() || !isText(city) || !isText(name)) throw unknownFormat()
    return toBuilding(address, city, customerId, name)
  })
}

/** Flera kunder på samma adress får kundnumret som särskiljare. Det står på fakturan. */
export function srvDetails(buildings: EdpBuilding[]): [EdpBuilding, string | undefined][] {
  const key = (b: EdpBuilding) => `${b.street}|${b.locality}`
  const count = new Map<string, number>()
  for (const b of buildings) count.set(key(b), (count.get(key(b)) ?? 0) + 1)
  return buildings.map((b) => [b, count.get(key(b))! > 1 ? `Kundnummer ${b.buildingId}` : undefined])
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

/** Kundens adress med id:t, eller null. En kund med flera adresser svarar bara med den första. */
async function byCustomer(id: string, customerId: string, fetchFn: typeof fetch | undefined, timeoutMs: number) {
  const opts = { fetchFn, timeoutMs }
  const res = await fetchJson<CustomerResponse>(`${SRV_URL}/search?${new URLSearchParams({ query: customerId, city: '' })}`, {}, opts)
  if (typeof res?.multipleAddresses !== 'boolean' || !Array.isArray(res.customerAddresses) || !Array.isArray(res.results)) throw unknownFormat()
  const matches = (address: unknown, city: unknown) => isText(address) && isText(city) && edpAddressId(toBuilding(address, city, customerId)) === id

  const first = res.results[0]
  if (first && matches(first.address, first.city)) {
    return { building: toBuilding(first.address as string, first.city as string, customerId), containers: containersOf(first.containers) }
  }
  const other = res.multipleAddresses ? res.customerAddresses.find((a) => matches(a.address, a.city)) : undefined
  if (!other) return null
  const { address, city, zip } = other as { address: string; city: string; zip: unknown }
  const params = new URLSearchParams({ address, zipCode: String(zip ?? ''), city, customerId })
  const found = await fetchJson<{ containers?: unknown }>(`${SRV_URL}/searchByCustomerAndAddress?${params}`, {}, opts)
  return { building: toBuilding(address, city, customerId), containers: containersOf(found?.containers) }
}

/**
 * Adressen och kärlen för ett adress-id. Har kundnumret inte adressen längre (huset har fått en ny
 * kund) används den nya kunden, om den är ensam på adressen: id:t pekar ju på adressen.
 */
export async function srvFind(id: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<{ building: EdpBuilding; containers: SrvContainer[] } | null> {
  const parsed = queryFromAddressId(id)
  if (!parsed) return null
  const found = await byCustomer(id, parsed.buildingId, fetchFn, timeoutMs)
  if (found) return found
  const street = parsed.query.split(',')[0].trim()
  const same = (await srvSearch(street, fetchFn, timeoutMs)).filter((b) => edpAddressId({ ...b, buildingId: parsed.buildingId }) === id)
  if (same.length !== 1) return null
  const moved = await byCustomer(edpAddressId(same[0]), same[0].buildingId, fetchFn, timeoutMs)
  return moved && { ...moved, building: { ...moved.building, buildingId: parsed.buildingId } }
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
