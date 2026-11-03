// VA Syd (Malmö och Burlöv): den publika tjänsten bakom vasyd.se. Svaren liknar EDP:s, så
// adresserna blir EdpBuilding och får EDP:s adress-id. Allt vi inte känner igen blir ett fel i
// stället för ett tomt svar. Se docs/specs/2026-11-03-malmo-vasyd.md.

import { isValidDate, todayInStockholm } from '../domain/dates.js'
import { weekRuleDates, type ExpandedPickup, type WeekRule } from '../domain/recurrence.js'
import type { Schedule } from '../domain/types.js'
import { mergeSeries, type EdpBuilding } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const VASYD_URL = 'https://www.vasyd.se/api/sitecore/mypagesapi'

const unknownFormat = () => new SourceError('vasyd.se svarade med ett okänt format')

const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']

/**
 * "Tisdag udda vecka" → tisdagar i udda veckor. Hela texten måste kännas igen; annars null och
 * bara källans datum. Datumen räknas av `weekRuleDates` (docs/specs/2026-11-03-vecka-53.md).
 */
export function vasydRule(frequency: string): WeekRule | null {
  const m = frequency
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .match(/^(\p{L}+) (?:(varje vecka)|(jämn|udda) vecka|var 4:e vecka(?: startvecka (\d+))?)$/u)
  const weekday = m ? WEEKDAYS.indexOf(m[1]) : -1
  if (!m || weekday < 0) return null
  if (m[2]) return { weekday, every: 1 }
  if (m[3]) return { weekday, every: 2, parity: m[3] as 'jämn' | 'udda' }
  return m[4] ? { weekday, every: 4, startWeek: Number(m[4]) } : { weekday, every: 4 }
}

/** Svaret måste ha `meta.success` och en lista `items`; annat är ett okänt format. */
async function post(path: string, form: Record<string, string>, fetchFn: typeof fetch | undefined, timeoutMs: number) {
  const res = await fetchJson<{ items?: unknown; meta?: { success?: boolean } }>(
    `${VASYD_URL}/${path}`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' }, body: new URLSearchParams(form).toString() },
    { fetchFn, timeoutMs },
  )
  if (!res || res.meta?.success !== true || !Array.isArray(res.items)) throw unknownFormat()
  return res.items as Record<string, unknown>[]
}

export async function vasydSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<EdpBuilding[]> {
  const items = await post('buildingaddresssearch', { query: q }, fetchFn, timeoutMs)
  return items.map((item) => {
    const raw = typeof item?.street === 'string' ? item.street.trim() : ''
    const [street, locality, ...rest] = raw.split(',').map((p) => p.trim())
    const buildingId = typeof item?.id === 'string' || typeof item?.id === 'number' ? String(item.id) : ''
    if (!street || !locality || rest.length > 0 || !/^\w+$/.test(buildingId)) throw unknownFormat()
    return { raw, street, locality, buildingId }
  })
}

export async function vasydSchedule(b: EdpBuilding, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<Schedule> {
  const items = await post('wastepickupbyaddress', { query: b.buildingId, street: b.raw }, fetchFn, timeoutMs)
  const series = items.map((item) => {
    const date = typeof item?.nextWastePickup === 'string' ? item.nextWastePickup.slice(0, 10) : ''
    if (typeof item?.wasteType !== 'string' || !isValidDate(date)) throw unknownFormat()
    const frequency = typeof item.wastePickupFrequency === 'string' ? item.wastePickupFrequency : ''
    const mapped = mapWasteType(item.wasteType, frequency)
    const rule = vasydRule(frequency)
    // En frekvens vi inte känner igen ger bara källans eget datum, aldrig gissade datum.
    const pickups: ExpandedPickup[] = rule ? weekRuleDates(date, rule) : [{ date, estimated: false }]
    return mapped ? { pickups, mapped } : null
  })
  return { bins: [], events: mergeSeries(series.filter((s) => s !== null)), updatedAt: todayInStockholm() }
}
