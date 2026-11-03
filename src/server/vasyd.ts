// VA Syd (Malmö och Burlöv): den publika tjänsten bakom vasyd.se. Svaren liknar EDP:s, så
// adresserna blir EdpBuilding och får EDP:s adress-id. Allt vi inte känner igen blir ett fel i
// stället för ett tomt svar. Se docs/specs/2026-11-03-malmo-vasyd.md.

import { isValidDate, todayInStockholm } from '../domain/dates.js'
import { expandEvery, type ExpandedPickup } from '../domain/recurrence.js'
import type { Schedule } from '../domain/types.js'
import { mergeSeries, type EdpBuilding } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const VASYD_URL = 'https://www.vasyd.se/api/sitecore/mypagesapi'

const unknownFormat = () => new SourceError('vasyd.se svarade med ett okänt format')

const WEEKDAY = '(?:måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)'
const STEPS: [RegExp, number][] = [
  [new RegExp(`^${WEEKDAY} varje vecka$`), 7],
  [new RegExp(`^${WEEKDAY} (?:jämn|udda) vecka$`), 14],
  [new RegExp(`^${WEEKDAY} var 4:e vecka(?: startvecka \\d+)?$`), 28],
]

/** "Onsdag varje vecka" → 7. Hela texten måste kännas igen; annars null och bara källans datum. */
export function vasydStep(frequency: string): number | null {
  const text = frequency.trim().toLowerCase().replace(/\s+/g, ' ')
  return STEPS.find(([pattern]) => pattern.test(text))?.[1] ?? null
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
    const step = vasydStep(frequency)
    // En frekvens vi inte känner igen ger bara källans eget datum, aldrig gissade datum.
    const pickups: ExpandedPickup[] = step ? expandEvery({ next: date, stepDays: step }) : [{ date, estimated: false }]
    return mapped ? { pickups, mapped } : null
  })
  return { bins: [], events: mergeSeries(series.filter((s) => s !== null)), updatedAt: todayInStockholm() }
}
