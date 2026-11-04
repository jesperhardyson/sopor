// Borlänge Energi: den publika sökningen på borlange-energi.se, en Sitevision-app. Söktjänsten ger
// adresser med text och id, och texten ger nästa tömning per kärl, utan frekvens och utan årtal.
// Adresserna blir EdpBuilding och får EDP:s adress-id. Allt vi inte känner igen blir ett fel i
// stället för ett tomt svar. Se docs/specs/2026-11-04-borlange.md.

import { daysBetween, isValidDate, MONTHS, weekdayIndex, WEEKDAYS } from '../domain/dates.js'
import type { Schedule } from '../domain/types.js'
import { edpAddressId, mergeSeries, queryFromAddressId, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const BORLANGE_URL = 'https://www.borlange-energi.se/appresource/4.534bcbed17430db9cdb1e5c2/12.5e484f4b19ed4844be36a279'

export interface BorlangePickup {
  type: string
  date: string
}

const unknownFormat = () => new SourceError('www.borlange-energi.se svarade med ett okänt format')

/** Rimliga avstånd från i dag: längre än ett kvarglömt datum bakåt, och kortare än ett år framåt. */
const MAX_DAYS_BACK = 31
const MAX_DAYS_AHEAD = 330

const isText = (v: unknown): v is string => typeof v === 'string'

/** Orten ger inga träffar, och det som följer numret kan vara ett företagsnamn. */
const searchable = (q: string) => q.split(',')[0].trim().replace(/(\d+).*$/, '$1')

/** "Borganäsvägen 39Cantina del Re" → "Borganäsvägen 39 Cantina del Re". */
const cleanStreet = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(\d)(\p{Lu}\p{Ll})/gu, '$1 $2')

function toBuilding(item: Record<string, unknown>): EdpBuilding {
  const { pickupAddress: text, id } = item ?? {}
  if (!isText(text) || !text.trim() || !isText(id) || !/^\w+$/.test(id)) throw unknownFormat()
  return { raw: text, street: cleanStreet(text), locality: '', buildingId: id }
}

export async function borlangeSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<EdpBuilding[]> {
  const res = await fetchJson<unknown>(`${BORLANGE_URL}/getAdresses?${new URLSearchParams({ pickupAddress: searchable(q) })}`, {}, { fetchFn, timeoutMs })
  if (!Array.isArray(res)) throw unknownFormat()
  return (res as Record<string, unknown>[]).map(toBuilding)
}

/**
 * Adressen för ett adress-id, med källans text i `raw`. Parenteser och dubbla mellanslag går inte
 * att återskapa ur id:t, så utan träff frågas det på färre ord. Finns id:t inte längre, och det är
 * den enda träffen med texten, används den med id:t oförändrat: id:t pekar ju på adressen.
 */
export async function borlangeFind(id: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<EdpBuilding | null> {
  const parsed = queryFromAddressId(id)
  if (!parsed) return null
  const words = parsed.query.split(' ')
  for (const query of new Set([parsed.query, words.slice(0, 2).join(' '), words[0]])) {
    const here = (await borlangeSearch(query, fetchFn, timeoutMs)).filter((b) => edpAddressId({ ...b, buildingId: parsed.buildingId }) === id)
    const found = here.find((b) => b.buildingId === parsed.buildingId) ?? (here.length === 1 ? here[0] : undefined)
    if (found) return { ...found, buildingId: parsed.buildingId }
    if (here.length > 1) return null
  }
  return null
}

/**
 * "Tömning måndag 4 januari" har inget årtal, men samma dag har aldrig samma veckodag tre år i rad,
 * så veckodagen pekar ut året runt årsskiftet. En fel veckodag kan ändå passa ett annat år, som
 * ligger ett helt år bort. Därför måste datumet också ligga nära i dag, annars litar vi inte på texten.
 */
export function borlangeDate(text: string, today: string): string | null {
  if (text === 'Tömning idag') return today
  const m = text.match(/^Tömning (\p{L}+) (\d{1,2}) (\p{L}+)$/u)
  if (!m) return null
  const month = MONTHS.indexOf(m[3])
  const weekday = WEEKDAYS.indexOf(m[1])
  if (month < 0 || weekday < 0) return null
  const monthDay = `${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`
  const year = Number(today.slice(0, 4))
  const near = (date: string) => daysBetween(today, date) >= -MAX_DAYS_BACK && daysBetween(today, date) <= MAX_DAYS_AHEAD
  return [year - 1, year, year + 1].map((y) => `${y}-${monthDay}`).find((date) => isValidDate(date) && weekdayIndex(date) === weekday && near(date)) ?? null
}

/** Nästa tömning per kärl. Texten måste vara källans egen: schemat kräver exakt träff och svarar annars tomt. */
export async function borlangePickups(text: string, today: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<BorlangePickup[]> {
  const res = await fetchJson<unknown>(`${BORLANGE_URL}/getcontainerdata?${new URLSearchParams({ pickupAddress: text })}`, {}, { fetchFn, timeoutMs })
  if (!Array.isArray(res)) throw unknownFormat()
  return (res as Record<string, unknown>[]).map((row) => {
    const date = isText(row?.disposalDay) ? borlangeDate(row.disposalDay, today) : null
    if (!isText(row?.contentType) || !row.contentType.trim() || !date) throw unknownFormat()
    return { type: row.contentType.trim(), date }
  })
}

/** Datumen från i dag, en händelse per dag. Bara källans egna datum. */
export function borlangeSchedule(pickups: BorlangePickup[], today: string): Schedule {
  const series = pickups.flatMap((p): PickupSeries[] => {
    const mapped = mapWasteType(p.type)
    if (!mapped || p.date < today) return []
    return [{ mapped, pickups: [{ date: p.date, estimated: false }] }]
  })
  return { bins: [], events: mergeSeries(series), updatedAt: today }
}
