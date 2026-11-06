// Vakin: "När kommer sopbilen?" på vakin.se, Sitevision-appen se.soleil.garbageTruckFetcher. Ger
// riktiga datum i ett valfritt intervall. Adresserna blir EdpBuilding med postnumret som byggnads-id,
// och allt vi inte känner igen blir ett fel i stället för ett tomt svar. Se docs/specs/2026-11-06-umea-vakin.md.

import { addDays, isValidDate } from '../domain/dates.js'
import type { Schedule } from '../domain/types.js'
import { edpAddressId, mergeSeries, queryFromAddressId, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const VAKIN_URL = 'https://www.vakin.se/appresource/4.6252338c1a0c6bd088ed01f/12.6252338c1a0c6bd088ed033'

/** Källans egna värden: schemat kräver alla tre och svarar annars med en tom lista. */
export interface VakinParams {
  zipCode: string
  address: string
  city: string
}

export interface VakinAddress {
  building: EdpBuilding
  params: VakinParams
}

export interface VakinPickup {
  types: string[]
  date: string
}

const DAYS_AHEAD = 365

const unknownFormat = () => new SourceError('www.vakin.se svarade med ett okänt format')
const isText = (v: unknown): v is string => typeof v === 'string'

/** Källan svarar 500 på skiljetecken. Orten tas bort, eftersom filtret ligger hos oss. */
const searchable = (q: string) =>
  q
    .split(',')[0]
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Andra tecken går inte att söka fram igen från ett id, och schemat kan ge fel för dem. */
const canBeFoundAgain = (text: string) => /^[\p{L}\p{N}\s,-]+$/u.test(text)

function toAddress(row: Record<string, unknown>): VakinAddress {
  const { zipCode, address, city } = (row?.value ?? {}) as Record<string, unknown>
  if (!isText(row?.label) || !isText(address) || !isText(city) || !isText(zipCode) || !/^\d{5}$/.test(zipCode)) throw unknownFormat()
  const at = address.lastIndexOf(',')
  const clean = (t: string) => t.trim().replace(/\s+/g, ' ')
  const building = { raw: address, street: clean(at < 0 ? address : address.slice(0, at)), locality: at < 0 ? clean(city) : clean(address.slice(at + 1)), buildingId: zipCode }
  return { building, params: { zipCode, address, city } }
}

export async function vakinSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<VakinAddress[]> {
  const query = searchable(q)
  if (!query) return []
  const res = await fetchJson<{ data?: unknown }>(`${VAKIN_URL}/getAddresses?${new URLSearchParams({ pickupAddress: query })}`, {}, { fetchFn, timeoutMs })
  if (!Array.isArray(res?.data)) throw unknownFormat()
  return (res.data as Record<string, unknown>[]).map(toAddress).filter((a) => canBeFoundAgain(a.params.address))
}

/** Adressen för ett adress-id. Postnumret i id:t måste stämma, för gatan kan finnas i flera orter. */
export async function vakinFind(id: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<VakinAddress | null> {
  const parsed = queryFromAddressId(id)
  if (!parsed || !/^\d{5}$/.test(parsed.buildingId)) return null
  return (await vakinSearch(parsed.query, fetchFn, timeoutMs)).find((a) => edpAddressId(a.building) === id) ?? null
}

/** En tom lista är ett giltigt svar för en adress som sökningen hittar. */
export async function vakinPickups(params: VakinParams, today: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<VakinPickup[]> {
  const query = new URLSearchParams({ addressParams: JSON.stringify(params), startDate: today, endDate: addDays(today, DAYS_AHEAD) })
  const res = await fetchJson<unknown>(`${VAKIN_URL}/getcontainerdata?${query}`, {}, { fetchFn, timeoutMs })
  if (!Array.isArray(res)) throw unknownFormat()
  return (res as Record<string, unknown>[]).map((row) => {
    const { executionDate: date, contentTypes: types } = row ?? {}
    if (!isText(date) || !isValidDate(date) || !Array.isArray(types) || !types.every(isText)) throw unknownFormat()
    return { types: types as string[], date }
  })
}

/** Datumen från i dag, en händelse per dag. Bara källans egna datum. */
export function vakinSchedule(pickups: VakinPickup[], today: string): Schedule {
  const series = pickups.flatMap((p) =>
    p.types.flatMap((type): PickupSeries[] => {
      const mapped = mapWasteType(type)
      if (!mapped || p.date < today) return []
      return [{ mapped, pickups: [{ date: p.date, estimated: false }] }]
    }),
  )
  return { bins: [], events: mergeSeries(series), updatedAt: today }
}
