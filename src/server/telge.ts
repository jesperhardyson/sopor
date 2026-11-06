// Telge Återvinning: sopbilsschemat på telge.se, med riktiga datum ett år framåt. Källan har inget
// id, så adressens text pekar ut den, och hashen av texten blir byggnads-id. Allt vi inte känner
// igen blir ett fel i stället för ett tomt svar. Se docs/specs/2026-11-06-sundsvall-sodertalje.md.

import { isValidDate } from '../domain/dates.js'
import type { Schedule } from '../domain/types.js'
import { edpAddressId, idHash, mergeSeries, queryFromAddressId, titleCase, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const TELGE_URL = 'https://www.telge.se/api/thorweb/garbagecollection'

/** Första frågan efter en stund utan anrop kan ta flera sekunder. */
export const TELGE_TIMEOUT_MS = 8000

export interface TelgePickup {
  type: string
  date: string
  /** Bara för fyrfackskärl: fordonet säger "4-fack" även för andra kärl. */
  description: string
}

const unknownFormat = () => new SourceError('www.telge.se svarade med ett okänt format')
const isText = (v: unknown): v is string => typeof v === 'string'

/** Källan svarar 500 eller 404 på skiljetecken och hittar inget med orten i sökningen. */
const searchable = (q: string) =>
  q
    .split(',')[0]
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()

/** En adress med andra tecken går inte att söka fram igen från sitt id. */
const canBeFoundAgain = (raw: string) => /^[\p{L}\p{N}\s,-]+$/u.test(raw)

function toBuilding(raw: string): EdpBuilding {
  const at = raw.lastIndexOf(',')
  const clean = (t: string) => titleCase(t.trim().replace(/\s+/g, ' '))
  return { raw, street: clean(at < 0 ? raw : raw.slice(0, at)), locality: at < 0 ? '' : clean(raw.slice(at + 1)), buildingId: idHash(raw) }
}

export async function telgeSearch(q: string, fetchFn?: typeof fetch, timeoutMs = TELGE_TIMEOUT_MS): Promise<EdpBuilding[]> {
  const query = searchable(q)
  if (!query) return []
  const res = await fetchJson<unknown>(`${TELGE_URL}/autocomplete/${encodeURIComponent(query)}`, {}, { fetchFn, timeoutMs })
  if (!Array.isArray(res) || !res.every(isText)) throw unknownFormat()
  return (res as string[]).filter(canBeFoundAgain).map(toBuilding)
}

/** Adressen för ett adress-id, med källans text i `raw`. */
export async function telgeFind(id: string, fetchFn?: typeof fetch, timeoutMs = TELGE_TIMEOUT_MS): Promise<EdpBuilding | null> {
  const parsed = queryFromAddressId(id)
  if (!parsed) return null
  return (await telgeSearch(parsed.query, fetchFn, timeoutMs)).find((b) => edpAddressId(b) === id) ?? null
}

/** Texten måste vara källans egen. En tom lista är ett giltigt svar för en adress som sökningen hittar. */
export async function telgePickups(raw: string, fetchFn?: typeof fetch, timeoutMs = TELGE_TIMEOUT_MS): Promise<TelgePickup[]> {
  const res = await fetchJson<unknown>(`${TELGE_URL}/schedule/${encodeURIComponent(raw)}`, {}, { fetchFn, timeoutMs })
  if (!Array.isArray(res)) throw unknownFormat()
  return (res as Record<string, unknown>[]).map((row) => {
    const date = isText(row?.date) ? row.date.slice(0, 10) : ''
    if (!isValidDate(date) || !isText(row.typeOfWasteDescription) || !row.typeOfWasteDescription.trim()) throw unknownFormat()
    const description = row.typeOfWaste === 'HEMSORT' ? `${row.vehicleDescription ?? ''} ${row.title ?? ''}` : ''
    return { type: row.typeOfWasteDescription.trim().replace(/^BNI\s+/, ''), date, description }
  })
}

/** Datumen från i dag, en händelse per dag. Bara källans egna datum. */
export function telgeSchedule(pickups: TelgePickup[], today: string): Schedule {
  const series = pickups.flatMap((p): PickupSeries[] => {
    const mapped = mapWasteType(p.type, '', p.description)
    if (!mapped || p.date < today) return []
    return [{ mapped, pickups: [{ date: p.date, estimated: false }] }]
  })
  return { bins: [], events: mergeSeries(series), updatedAt: today }
}
