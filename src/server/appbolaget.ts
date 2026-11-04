// Appbolagets plattform (Renhållningen Kristianstad, Hässleholm Miljö): api-universal.appbolaget.se.
// Kunden anges med sitt Unit-id, som står i klartext på kundens egen sajt. Adresserna blir
// EdpBuilding och får EDP:s adress-id med adressens uuid. Hässleholm har hela årets tömningar,
// Kristianstad bara nästa tömning och frekvensen. Allt vi inte känner igen blir ett fel i stället
// för ett tomt svar. Se docs/specs/2026-11-03-appbolaget.md.

import { isValidDate, todayInStockholm } from '../domain/dates.js'
import { expandEvery, type ExpandedPickup } from '../domain/recurrence.js'
import type { Schedule } from '../domain/types.js'
import { mergeSeries, queryFromAddressId, titleCase, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const APPBOLAGET_URL = 'https://api-universal.appbolaget.se'

export interface AppbolagetAddress {
  building: EdpBuilding
  /** Fastighetsbeteckningen, "Loket 3" */
  designation?: string
}

const MOVED = 'Flyttad tömning.'

const unknownFormat = () => new SourceError('api-universal.appbolaget.se svarade med ett okänt format')

const isText = (v: unknown): v is string => typeof v === 'string'

const headers = (unit: string) => ({ Module: 'universal', Unit: unit })

const UUID = /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/

function toAddress(item: Record<string, unknown>): AppbolagetAddress {
  const { uuid, address, city, designation } = item ?? {}
  if (!isText(uuid) || !UUID.test(uuid) || !isText(address) || !address.trim() || !(isText(city) || city == null)) throw unknownFormat()
  return {
    building: { raw: uuid, street: titleCase(address.trim().replace(/\s+/g, ' ')), locality: titleCase((city ?? '').trim()), buildingId: uuid.replace(/-/g, '') },
    ...(isText(designation) && designation.trim() && { designation: titleCase(designation.trim().replace(/\s+/g, ' ')) }),
  }
}

/**
 * Söker på gatan och numret. Med orten ("Storgatan 1, Vinslöv") eller en bokstav efter numret
 * ("Västra Storgatan 1A") blir det inga träffar, så de tas bort.
 */
export async function appbolagetSearch(unit: string, q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<AppbolagetAddress[]> {
  const query = q.split(',')[0].trim().replace(/(\d+)\D*$/, '$1')
  const url = `${APPBOLAGET_URL}/waste/addresses/search?${new URLSearchParams({ query, limit: '100' })}`
  const res = await fetchJson<{ data?: unknown }>(url, { headers: headers(unit) }, { fetchFn, timeoutMs })
  if (!Array.isArray(res?.data)) throw unknownFormat()
  return res.data.map(toAddress)
}

/** Flera träffar med samma gata och ort får fastighetsbeteckningen som särskiljare. */
export function appbolagetDetails(addresses: AppbolagetAddress[]): [EdpBuilding, string | undefined][] {
  const key = (a: AppbolagetAddress) => `${a.building.street}|${a.building.locality}`
  const count = new Map<string, number>()
  for (const a of addresses) count.set(key(a), (count.get(key(a)) ?? 0) + 1)
  return addresses.map((a) => [a.building, count.get(key(a))! > 1 ? a.designation : undefined])
}

/** Adressen med uuid:t i id:t, utan sökning, eller null om den inte finns. */
export async function appbolagetFind(
  unit: string,
  id: string,
  fetchFn?: typeof fetch,
  timeoutMs = 5000,
): Promise<(AppbolagetAddress & { propertyIds: string[] }) | null> {
  const m = queryFromAddressId(id)?.buildingId.match(UUID)
  if (!m) return null
  const res = await fetchJson<{ data?: Record<string, unknown> }>(`${APPBOLAGET_URL}/waste/addresses/${m.slice(1).join('-')}`, { headers: headers(unit) }, { fetchFn, timeoutMs }).catch(
    (error: Error) => {
      if (/svarade 404$/.test(error.message)) return null
      throw error
    },
  )
  if (!res) return null
  const property = res.data?.property_id
  if (!(isText(property) || property == null)) throw unknownFormat()
  const propertyIds = (property ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  return { ...toAddress(res.data ?? {}), propertyIds }
}

/** "2026-11-11 23:00:00" (UTC) → "2026-11-12", datumet i Sverige. */
function stockholmDate(timestamp: unknown): string {
  if (!isText(timestamp)) throw unknownFormat()
  if (isValidDate(timestamp)) return timestamp
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) throw unknownFormat()
  return todayInStockholm(new Date(`${timestamp.replace(' ', 'T')}Z`))
}

/** Dagar mellan tömningarna ur Kristianstads text, eller null (då bara nästa tömning). */
function stepDays(text: string): number | null {
  const t = text.toLowerCase()
  if (/1 gång\/vecka|varje vecka/.test(t)) return 7
  if (/varannan vecka/.test(t)) return 14
  const weeks = t.match(/var (\d+):e vecka/)
  if (weeks) return Number(weeks[1]) * 7
  const perYear = Number(t.match(/(\d+)\s*ggr?\s*\/?\s*år/)?.[1])
  return ({ 52: 7, 26: 14, 13: 28 } as Record<number, number>)[perYear] ?? null
}

export interface AppbolagetService {
  code?: { description?: unknown; description_verbose?: unknown }
  collection_at?: unknown
  collections?: { collection_at?: unknown }[]
  route?: { exceptions?: { old_date?: unknown; new_date?: unknown }[] } | null
}

function pickups(service: AppbolagetService, today: string): ExpandedPickup[] {
  const own = service.collections
  if (Array.isArray(own) && own.length > 0) return own.map((c) => ({ date: stockholmDate(c?.collection_at), estimated: false }))
  if (service.collection_at == null && Array.isArray(own)) return []
  const next = stockholmDate(service.collection_at)
  const step = stepDays(String(service.code?.description_verbose ?? ''))
  const expanded = step ? expandEvery({ next, stepDays: step }) : [{ date: next, estimated: false }]
  // Turens flyttade tömningar. Fältet meta (vem som ändrade) läses aldrig.
  const moved = new Map<string, string>()
  for (const e of service.route?.exceptions ?? []) {
    if (isText(e?.old_date) && isText(e.new_date) && isValidDate(e.old_date) && isValidDate(e.new_date) && e.new_date >= today) moved.set(e.old_date, e.new_date)
  }
  return expanded.map((p) => (moved.has(p.date) ? { ...p, date: moved.get(p.date)!, warning: MOVED } : p))
}

/** Fastigheternas rader, en per kärl eller avgift. */
export async function appbolagetServices(unit: string, propertyIds: string[], fetchFn?: typeof fetch, timeoutMs = 5000): Promise<AppbolagetService[]> {
  const responses = await Promise.all(
    propertyIds.map((id) =>
      fetchJson<{ data?: { services?: unknown } }>(`${APPBOLAGET_URL}/@universal/waste/properties/${encodeURIComponent(id)}/?${new URLSearchParams({ unit })}`, {}, { fetchFn, timeoutMs }),
    ),
  )
  return responses.flatMap((res) => {
    const services = res?.data?.services
    if (!Array.isArray(services)) throw unknownFormat()
    return (services as AppbolagetService[]).map((s) => {
      if (!isText(s?.code?.description) || (!Array.isArray(s.collections) && s.collection_at == null)) throw unknownFormat()
      return s
    })
  })
}

/** Avgifterna ("Budad hämtning") är inga tömningar. */
export const isFee = (s: AppbolagetService) => /^budad hämtning$/i.test(String(s.code?.description).trim())

export const serviceType = (s: AppbolagetService) => ({
  type: String(s.code?.description).trim(),
  description: isText(s.code?.description_verbose) ? s.code.description_verbose : '',
})

/** Tömningarna från i dag, en händelse per dag. */
export function scheduleFromServices(services: AppbolagetService[], today: string): Schedule {
  const series: PickupSeries[] = []
  for (const s of services) {
    if (isFee(s)) continue
    const { type, description } = serviceType(s)
    const dates = pickups(s, today).filter((p) => p.date >= today)
    const mapped = mapWasteType(type, '', description)
    if (mapped && dates.length > 0) series.push({ pickups: dates, mapped })
  }
  return { bins: [], events: mergeSeries(series), updatedAt: today }
}

/** Fastigheternas tömningar från i dag. En adress utan fastighet får ett tomt schema. */
export async function appbolagetSchedule(
  unit: string,
  propertyIds: string[],
  fetchFn?: typeof fetch,
  timeoutMs = 5000,
  today = todayInStockholm(),
): Promise<Schedule> {
  return scheduleFromServices(await appbolagetServices(unit, propertyIds, fetchFn, timeoutMs), today)
}
