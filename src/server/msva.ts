// Mittsverige Vatten & Avfall: Sundsvalls kommuns öppna API. Ger nästa tömning per kärl, utan
// frekvens, och bara för småhus. Adresserna blir EdpBuilding med postnumret som byggnads-id, och
// allt vi inte känner igen blir ett fel i stället för ett tomt svar. Se docs/specs/2026-11-06-sundsvall-sodertalje.md.

import { isValidDate } from '../domain/dates.js'
import type { Schedule } from '../domain/types.js'
import { edpAddressId, mergeSeries, queryFromAddressId, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const MSVA_URL = 'https://api.sundsvall.se/Garbage/2281/schedules'

export interface MsvaPickup {
  type: string
  date: string
}

export interface MsvaFacility {
  building: EdpBuilding
  pickups: MsvaPickup[]
}

/** Källans koder på de ord som mapWasteType känner igen. */
const TYPES: Record<string, string> = { WASTE: 'Restavfall', FOOD: 'Matavfall', PAPER: 'Pappersförpackningar', PLASTIC: 'Plastförpackningar' }

const unknownFormat = () => new SourceError('api.sundsvall.se svarade med ett okänt format')
const isText = (v: unknown): v is string => typeof v === 'string'

function toFacility(row: Record<string, unknown>): MsvaFacility {
  const address = (row?.address ?? {}) as Record<string, unknown>
  const { street, houseNumber, postalCode, city } = address
  const letter = row?.additionalInformation
  if (!isText(street) || !street.trim() || !isText(houseNumber) || !isText(city) || !isText(letter) || !isText(postalCode) || !/^\d{5}$/.test(postalCode)) throw unknownFormat()
  if (!Array.isArray(row.schedules)) throw unknownFormat()
  const pickups = (row.schedules as Record<string, unknown>[]).map((s) => {
    if (!isText(s?.wasteType) || !isText(s?.nextPickupDate) || !isValidDate(s.nextPickupDate)) throw unknownFormat()
    return { type: s.wasteType, date: s.nextPickupDate }
  })
  const text = [street, houseNumber, letter].map((p) => p.trim()).filter(Boolean).join(' ')
  return { building: { raw: text, street: text, locality: city.trim(), buildingId: postalCode }, pickups }
}

async function request(params: Record<string, string>, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<MsvaFacility[]> {
  const res = await fetchJson<unknown>(`${MSVA_URL}?${new URLSearchParams(params)}`, {}, { fetchFn, timeoutMs })
  if (!Array.isArray(res)) throw unknownFormat()
  return (res as Record<string, unknown>[]).map(toFacility)
}

/** Källan kräver hela gatunamnet, så "Storgatan 3 A" delas upp. Bokstaven filtreras här. */
export async function msvaSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<MsvaFacility[]> {
  const m = q.trim().match(/^(.+?)\s+(\d+)(?:\s*(\p{L}))?$/u)
  if (!m) return request({ street: q.trim() }, fetchFn, timeoutMs)
  const found = await request({ street: m[1], houseNumber: m[2] }, fetchFn, timeoutMs)
  if (!m[3]) return found
  const letter = m[3].toUpperCase()
  return found.filter((f) => f.building.street.endsWith(` ${m[2]} ${letter}`))
}

/** Postnummer och husnummer pekar ut adressen utan gatan, vars skiljetecken inte finns kvar i id:t. */
export async function msvaFind(id: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<MsvaFacility | null> {
  const parsed = queryFromAddressId(id)
  if (!parsed || !/^\d{5}$/.test(parsed.buildingId)) return null
  const houseNumber = parsed.query.split(',')[0].match(/(\d+)(?:\s\p{L})?$/u)?.[1]
  const found = await request({ postalCode: parsed.buildingId, ...(houseNumber && { houseNumber }) }, fetchFn, timeoutMs)
  return found.find((f) => edpAddressId(f.building) === id) ?? null
}

/** En okänd kod visas med källans text, och bevakningen rapporterar den. */
export const msvaWasteType = (type: string) => mapWasteType(TYPES[type] ?? type)

/** Datumen från i dag, en händelse per dag. Bara källans egna datum. */
export function msvaSchedule(pickups: MsvaPickup[], today: string): Schedule {
  const series = pickups.flatMap((p): PickupSeries[] => {
    const mapped = msvaWasteType(p.type)
    if (!mapped || p.date < today) return []
    return [{ mapped, pickups: [{ date: p.date, estimated: false }] }]
  })
  return { bins: [], events: mergeSeries(series), updatedAt: today }
}
