// Uddevalla Energi: den publika sökningen på uddevallaenergi.se. Söktjänsten ger adresser med ett
// plant_number, och det ger nästa tömning per kärl, utan frekvens. Inga datum räknas alltså fram.
// Adresserna blir EdpBuilding och får EDP:s adress-id med en hash av värdet. Allt vi inte känner
// igen blir ett fel i stället för ett tomt svar. Se docs/specs/2026-11-04-uddevalla.md.

import { formatShort, isValidDate } from '../domain/dates.js'
import type { Schedule } from '../domain/types.js'
import { edpAddressId, idHash, mergeSeries, queryFromAddressId, titleCase, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const UDDEVALLA_URL = 'https://app.uddevallaenergi.se/wp-json/app'

export interface UddevallaAddress {
  building: EdpBuilding
  plantNumber: string
}

export interface UddevallaPickup {
  type: string
  date?: string
  moved: boolean
}

const MOVED = 'Flyttad tömning enligt Uddevalla Energi.'

const unknownFormat = () => new SourceError('app.uddevallaenergi.se svarade med ett okänt format')

const isText = (v: unknown): v is string => typeof v === 'string'

/** Identifieraren står i klartext i sajtens annat.js. */
const init = { headers: { 'X-App-Identifier': 'www.uddevallaenergi.se' } }

/** Orten och allt efter första numret ger inga träffar: "Södra Drottninggatan 1A" hittar inget. */
const searchable = (q: string) => q.split(',')[0].trim().replace(/(\d+).*$/, '$1')

function toAddress(item: Record<string, unknown>): UddevallaAddress {
  const { plant_number: plantNumber, address, zip_city: zipCity } = item ?? {}
  if (!isText(plantNumber) || !plantNumber || !isText(address) || !address.trim()) throw unknownFormat()
  const [street, place] = address.split(',').map((p) => p.trim().replace(/\s+/g, ' '))
  const locality = isText(zipCity) && zipCity.trim() ? zipCity.trim() : (place ?? '')
  return { building: { raw: address, street: titleCase(street), locality: titleCase(locality), buildingId: idHash(plantNumber) }, plantNumber }
}

export async function uddevallaSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<UddevallaAddress[]> {
  const res = await fetchJson<unknown>(`${UDDEVALLA_URL}/v2/address-flat?${new URLSearchParams({ address: searchable(q) })}`, init, { fetchFn, timeoutMs })
  if (!Array.isArray(res)) throw unknownFormat()
  // Raderna med is_key är bokstavsrubriker i appens lista.
  return (res as Record<string, unknown>[]).filter((r) => !r?.is_key).map(toAddress)
}

const samePlace = (a: EdpBuilding, b: EdpBuilding) => a.street.toLowerCase() === b.street.toLowerCase() && a.locality.toLowerCase() === b.locality.toLowerCase()

/**
 * Adressen för ett adress-id. Finns inte hashen längre, och det är den enda träffen på adressen,
 * används den med id:t oförändrat: id:t pekar ju på adressen.
 */
export async function uddevallaFind(id: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<UddevallaAddress | null> {
  const parsed = queryFromAddressId(id)
  if (!parsed) return null
  const here = (await uddevallaSearch(parsed.query, fetchFn, timeoutMs)).filter((a) => edpAddressId({ ...a.building, buildingId: parsed.buildingId }) === id)
  const found = here.find((a) => a.building.buildingId === parsed.buildingId) ?? (here.length === 1 ? here[0] : undefined)
  return found ? { ...found, building: { ...found.building, buildingId: parsed.buildingId } } : null
}

/** Nästa tömning per kärl. En rad utan datum har ingen planerad tömning. */
export async function uddevallaPickups(plantNumber: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<UddevallaPickup[]> {
  const res = await fetchJson<unknown>(`${UDDEVALLA_URL}/v1/next-pickup-web?${new URLSearchParams({ plant_number: plantNumber })}`, init, { fetchFn, timeoutMs })
  if (!Array.isArray(res)) throw unknownFormat()
  return (res as Record<string, unknown>[]).map((p) => {
    const date = p?.pickup_date
    if (!isText(p?.type) || !p.type.trim() || !(date == null || date === '' || (isText(date) && isValidDate(date)))) throw unknownFormat()
    return { type: p.type.trim(), ...(date ? { date: date as string } : {}), moved: p.has_deviating_date === true }
  })
}

/** "370 l kärl 1" → "kärl 1": volymen säger inget om vad kärlet innehåller. */
const withoutVolume = (type: string) => type.replace(/^\d+(?:[.,]\d+)?\s*(?:l|m3)\s+/i, '')

/** Villornas "kärl 1" och "kärl 2" är fyrfackskärl. Okända kärl behåller hela texten, med volymen. */
export function uddevallaWasteType(type: string): PickupSeries['mapped'] | null {
  const text = withoutVolume(type)
  const mapped = mapWasteType(text, '', /^kärl \d+$/i.test(text) ? 'fyrfack' : '')
  return mapped?.label && !mapped.label.startsWith('Fyrfackskärl') ? { ...mapped, label: type } : mapped
}

/** Datumen från i dag, en händelse per dag. Bara källans egna datum. */
export function uddevallaSchedule(pickups: UddevallaPickup[], today: string): Schedule {
  const series = pickups.flatMap((p): PickupSeries[] => {
    const mapped = uddevallaWasteType(p.type)
    if (!mapped || !p.date || p.date < today) return []
    return [{ mapped, pickups: [{ date: p.date, estimated: false, ...(p.moved && { warning: MOVED }) }] }]
  })
  return { bins: [], events: mergeSeries(series), updatedAt: today }
}

/**
 * Flera träffar på samma adress får kärlen som särskiljare, och är de lika också nästa tömning.
 * Samma schema visas en gång: då spelar det ingen roll vilken man väljer. Går kärlen inte att
 * hämta blir det ingen särskiljare i stället för en misslyckad sökning.
 */
export async function uddevallaDetails(addresses: UddevallaAddress[], today: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<[EdpBuilding, string | undefined][]> {
  const same = (a: UddevallaAddress, o: UddevallaAddress) => o !== a && samePlace(o.building, a.building)
  const info = new Map<UddevallaAddress, { bins: string; next?: string; schedule: string }>()
  await Promise.all(
    addresses
      .filter((a) => addresses.some((o) => same(a, o)))
      .map(async (a) => {
        const pickups = await uddevallaPickups(a.plantNumber, fetchFn, timeoutMs).catch(() => undefined)
        if (!pickups) return
        const events = uddevallaSchedule(pickups, today).events
        const bins = [...new Set(pickups.filter((p) => p.date && p.date >= today).map((p) => withoutVolume(p.type)))].sort((x, y) => x.localeCompare(y, 'sv')).join(', ')
        info.set(a, { bins: bins.charAt(0).toUpperCase() + bins.slice(1), next: events[0]?.date, schedule: JSON.stringify(events) })
      }),
  )
  const kept = addresses.filter((a, i) => !addresses.slice(0, i).some((o) => same(a, o) && info.has(a) && info.get(o)?.schedule === info.get(a)?.schedule))
  return kept.map((a) => {
    const own = info.get(a)
    const others = kept.filter((o) => same(a, o))
    if (!own || others.length === 0) return [a.building, undefined]
    if (!own.bins) return [a.building, 'Inga tömningar just nu']
    const sameBins = others.some((o) => info.get(o)?.bins === own.bins)
    return [a.building, sameBins && own.next ? `${own.bins}, nästa ${formatShort(own.next)}` : own.bins]
  })
}
