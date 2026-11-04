// Klient för EDP Futures publika modul SimpleWastePickup. Körs på servern (Vercel Functions),
// eftersom källorna saknar CORS-headers.

import { isValidDate, todayInStockholm } from '../domain/dates.js'
import { sortFractions } from '../domain/fractions.js'
import { expandWeekdays, weekRuleDates, type ExpandedPickup, type WeekRule } from '../domain/recurrence.js'
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
  Description?: string | null
}

const WEEKDAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag']

const capitalize = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())

/**
 * "SKOLVÄGEN 1" → "Skolvägen 1". När resten har gemener skrivs bara orden före dem om, så att
 * förkortningar längre fram står kvar: "STORGATAN Fritid vid ÅVS" → "Storgatan Fritid vid ÅVS".
 */
export const titleCase = (s: string) =>
  s === s.toUpperCase() ? capitalize(s) : s.replace(/^[^\p{Ll}]+(?=\s)/u, capitalize)

/**
 * "Storgatan 2 -4, Tormenåsgatan 1, Huskvarna (28970)" → gata, ort och byggnads-id.
 * Orten kan vara tom eller saknas helt ("STORGATAN 11 (590406011)" i Lidköping).
 */
export function parseBuilding(raw: string): EdpBuilding | null {
  const m = raw.match(/^(.+?)(?:,\s*([^,]*?))?\s*\((\w+)\)\s*$/)
  if (!m) return null
  const clean = (t = '') => titleCase(t.trim().replace(/\s+/g, ' '))
  return { raw, street: clean(m[1]), locality: clean(m[2]), buildingId: m[3] }
}

/**
 * Kodar adressen reversibelt så att den kan sökas fram igen från en delad länk eller en
 * kalenderprenumeration: mellanslag → "-", ", " → "_", bindestreck → "~". Å, ä och ö behålls,
 * eftersom källornas sökning skiljer på dem.
 */
export function encode(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/-/g, '~')
    .replace(/\s*,\s*/g, '_')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}~_-]/gu, '')
}

/**
 * Ett värde som inte ska stå i klartext i adress-id:t, eller inte får plats där (FNV-1a, 32 bitar,
 * base 36). Får aldrig ändras (regel 3).
 */
export function idHash(value: string): string {
  let h = 0x811c9dc5
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0
  return h.toString(36)
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

/** ISO-veckodagarna (1 = måndag … 7 = söndag) som texten nämner. */
export function weekdaysIn(text: string): number[] {
  const t = text.toLowerCase()
  return WEEKDAYS.flatMap((day, i) => (t.includes(day) ? [i + 1] : []))
}

/**
 * Frekvenstexten som en regel för `weekRuleDates`, med antalet tömningar per år som spärr. Texterna
 * har ingen gemensam form ("Måndag udda vecka. Fyrfack", "Onsdag var 4:e vecka med start v. 3"), så
 * delarna letas fram var för sig. null = bara källans datum. Se docs/specs/2026-11-03-vecka-53.md.
 */
export function edpRule(frequency: string, perYear: number): WeekRule | null {
  const t = frequency.toLowerCase().replace(/\s+/g, ' ')
  const days = weekdaysIn(t)
  if (days.length > 1 || /sommar|vinter|säsong/.test(t)) return null
  const weekday = days.length ? days[0] % 7 : undefined
  const parity = /(^|\P{L})(udda|ojämn)/u.test(t) ? 'udda' : /(^|\P{L})jämn/u.test(t) ? 'jämn' : undefined

  if (perYear === 52) return parity ? null : { weekday, every: 1 }
  if (perYear === 26) return parity || !/var 14:e dag/.test(t) ? { weekday, every: 2, parity } : { weekday, every: 2, fixedDays: true }
  if (perYear !== 13) return null
  const start = t.match(/start(?:vecka| ?v\.?) ?(\d+)/) ?? t.match(/(?:^|\P{L})v ?(\d+) ?,/u)
  return { weekday, every: 4, parity, startWeek: start ? Number(start[1]) : undefined }
}

/** En källas kärl: dess datum och vilka fraktioner det tömmer. */
export interface PickupSeries {
  pickups: ExpandedPickup[]
  mapped: { fractions: FractionId[]; label?: string }
}

/** Slår ihop kärlens datum till en händelse per dag, sorterad på datum (EDP och Stockholm). */
export function mergeSeries(series: PickupSeries[]): PickupEvent[] {
  const byDate = new Map<string, PickupEvent>()
  for (const { pickups, mapped } of series) {
    for (const p of pickups) {
      const event: PickupEvent = byDate.get(p.date) ?? { date: p.date, fractions: [], estimated: false }
      for (const f of mapped.fractions) if (!event.fractions.includes(f)) event.fractions.push(f)
      if (mapped.label) {
        const labels = (event.labels ??= {})
        labels.karl = [...new Set([...(labels.karl?.split(', ') ?? []), mapped.label])].join(', ')
      }
      // En dag med minst en framräknad tömning märks som beräknad: det försiktiga valet.
      event.estimated = event.estimated || p.estimated
      if (p.warning) event.warning = p.warning
      byDate.set(p.date, event)
    }
  }
  return [...byDate.values()]
    .map((e) => ({ ...e, fractions: sortFractions(e.fractions as FractionId[]) }))
    .sort((a, b) => a.date.localeCompare(b.date))
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

  const items: PickupSeries[] = []
  for (const service of res.RhServices ?? []) {
    const next = service.NextWastePickup?.slice(0, 10)
    const mapped = mapWasteType(service.WasteType ?? '', service.WastePickupFrequency ?? '', service.Description ?? '')
    if (!mapped || !next || !isValidDate(next) || next.startsWith('0001')) continue

    const frequency = service.WastePickupFrequency ?? ''
    const perYear = service.WastePickupsPerYear ?? 0
    const weekdays = weekdaysIn(frequency)
    const rule = edpRule(frequency, perYear)
    // En frekvens vi inte känner igen ger bara källans eget datum, aldrig gissade datum.
    const pickups: ExpandedPickup[] =
      perYear === 104 && weekdays.length > 0
        ? expandWeekdays({ next, weekdays })
        : rule
          ? weekRuleDates(next, rule)
          : [{ date: next, estimated: false }]
    items.push({ pickups, mapped })
  }
  const events = mergeSeries(items)
  return { bins: [], events, updatedAt: todayInStockholm(now) }
}
