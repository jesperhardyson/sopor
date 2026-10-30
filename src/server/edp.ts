// Klient för EDP Futures publika modul SimpleWastePickup. Körs på servern (Vercel Functions),
// eftersom källorna saknar CORS-headers.

import { isValidDate, todayInStockholm } from '../domain/dates.js'
import { sortFractions } from '../domain/fractions.js'
import { expandPickups } from '../domain/recurrence.js'
import type { FractionId, PickupEvent, Schedule } from '../domain/types.js'
import { fetchJson } from './http.js'
import { mapWasteType } from './fractions-map.js'

export interface EdpBuilding {
  /** Adresssträngen exakt som källan skrev den, krävs för att hämta schemat */
  raw: string
  street: string
  locality: string
  buildingId: string
}

interface EdpService {
  WasteType: string
  WastePickupFrequency: string | null
  NextWastePickup: string
  WastePickupsPerYear: number
}

const WEEKDAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag']

const titleCase = (s: string) =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase()) : s

/** "Storgatan 2 -4, Tormenåsgatan 1, Huskvarna (28970)" → gata, ort och byggnads-id. */
export function parseBuilding(raw: string): EdpBuilding | null {
  const m = raw.match(/^(.*),\s*([^,]*?)\s*\((\w+)\)\s*$/)
  if (!m) return null
  const clean = (t: string) => titleCase(t.trim().replace(/\s+/g, ' '))
  return { raw, street: clean(m[1]), locality: clean(m[2]), buildingId: m[3] }
}

/**
 * Kodar adressen reversibelt så att den kan sökas fram igen från en delad länk eller en
 * kalenderprenumeration: mellanslag → "-", ", " → "_", bindestreck → "~". Å, ä och ö behålls,
 * eftersom källornas sökning skiljer på dem.
 */
function encode(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/-/g, '~')
    .replace(/\s*,\s*/g, '_')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}~_-]/gu, '')
}

/** "storgatan-1_grillby-909273". Byggnads-id:t sist gör id:t unikt och stabilt. */
export function edpAddressId(b: EdpBuilding): string {
  return `${encode(b.locality ? `${b.street}, ${b.locality}` : b.street)}-${b.buildingId}`
}

/** Tillbaka från id till söksträng ("storgatan 1, grillby") och byggnads-id. */
export function queryFromAddressId(id: string): { query: string; buildingId: string } | null {
  const m = id.match(/^(.+)-(\w+)$/)
  if (!m) return null
  const query = m[1].replace(/-/g, ' ').replace(/_/g, ', ').replace(/~/g, '-')
  return { query, buildingId: m[2] }
}

export async function edpSearch(
  baseUrl: string,
  q: string,
  fetchFn?: typeof fetch,
  timeoutMs?: number,
): Promise<EdpBuilding[]> {
  const res = await fetchJson<{ Succeeded?: boolean; Buildings?: string[] }>(
    `${baseUrl}/SimpleWastePickup/SearchAdress`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ searchText: q }),
    },
    { fetchFn, timeoutMs },
  )
  return (res.Buildings ?? []).map(parseBuilding).filter((b): b is EdpBuilding => b !== null)
}

function weekdaysIn(text: string): number[] {
  const t = text.toLowerCase()
  return WEEKDAYS.flatMap((day, i) => (t.includes(day) ? [i + 1] : []))
}

export async function edpSchedule(
  baseUrl: string,
  raw: string,
  fetchFn?: typeof fetch,
  now = new Date(),
  timeoutMs?: number,
): Promise<Schedule> {
  const res = await fetchJson<{ RhServices?: EdpService[] }>(
    `${baseUrl}/SimpleWastePickup/GetWastePickupSchedule?${new URLSearchParams({ address: raw })}`,
    {},
    { fetchFn, timeoutMs },
  )

  const byDate = new Map<string, PickupEvent>()
  for (const service of res.RhServices ?? []) {
    const next = service.NextWastePickup?.slice(0, 10)
    const mapped = mapWasteType(service.WasteType ?? '', service.WastePickupFrequency ?? '')
    if (!mapped || !next || !isValidDate(next) || next.startsWith('0001')) continue

    const pickups = expandPickups({
      next,
      perYear: service.WastePickupsPerYear ?? 0,
      weekdays: weekdaysIn(service.WastePickupFrequency ?? ''),
    })
    for (const p of pickups) {
      const event = byDate.get(p.date) ?? { date: p.date, fractions: [], estimated: false }
      if (!event.fractions.includes(mapped.fraction)) event.fractions.push(mapped.fraction)
      if (mapped.label) {
        const labels = (event.labels ??= {})
        labels[mapped.fraction] = labels[mapped.fraction] ? `${labels[mapped.fraction]}, ${mapped.label}` : mapped.label
      }
      // En dag med minst en framräknad tömning märks som beräknad: det försiktiga valet.
      event.estimated = event.estimated || p.estimated
      if (p.warning) event.warning = p.warning
      byDate.set(p.date, event)
    }
  }

  const events = [...byDate.values()]
    .map((e) => ({ ...e, fractions: sortFractions(e.fractions as FractionId[]) }))
    .sort((a, b) => a.date.localeCompare(b.date))
  return { bins: [], events, updatedAt: todayInStockholm(now) }
}
