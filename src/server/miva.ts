// Miva: "När kommer sopbilen?" på miva.se, en Sitevision-app utan API. Sidan renderas på servern och
// lägger appens tillstånd som JSON i registerInitialState, och det är bara det som läses (undantag från
// beslut 2 i docs/plans/2026-11-03-fler-kommuner.md). Sökträffarna är råa poster med personuppgifter,
// så bara adress, ort och frekvens läses ur dem. Se docs/specs/2026-11-16-ornskoldsvik-miva.md.

import { edpAddressId, idHash, titleCase, type EdpBuilding } from './edp.js'
import { fetchHtml, SourceError } from './http.js'

export const MIVA_URL = 'https://miva.se/kundservice/sjalvservice/sophamtning/nar-kommer-sopbilen'
export const MIVA_APP = '12.5e486747177feaef88f29850'

export interface MivaState {
  route: string
  hits?: unknown[]
  trips?: unknown[]
  address?: unknown
  city?: unknown
}

export interface MivaAddress {
  building: EdpBuilding
  /** Källans exakta text. Schemat är versalkänsligt i adressen. */
  address: string
  city: string
  /** De olika frekvenserna ("Var 14:e dag") för adressens kärl. Tom när sökningen gick direkt till schemat. */
  frequencies: string[]
}

const unknownFormat = () => new SourceError('miva.se svarade med ett okänt format')
const isText = (v: unknown): v is string => typeof v === 'string'
const MARK = `registerInitialState('${MIVA_APP}',`

/** Appens tillstånd. Saknas det, eller har det varken träffar eller turer, har Miva ändrat appen. */
export function mivaState(html: string): MivaState {
  const start = html.indexOf(MARK)
  const end = start < 0 ? -1 : html.indexOf(');</script>', start)
  if (end < 0) throw unknownFormat()
  let state: unknown
  try {
    state = JSON.parse(html.slice(start + MARK.length, end))
  } catch {
    throw unknownFormat()
  }
  const s = state as MivaState
  if (!s || typeof s !== 'object' || !isText(s.route) || (!Array.isArray(s.hits) && !Array.isArray(s.trips))) throw unknownFormat()
  return s
}

/** Sidan för en route i appen, med dess parametrar. */
export async function mivaPage(route: string, params: Record<string, string>, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<MivaState> {
  const query = new URLSearchParams({ 'sv.target': MIVA_APP, [`sv.${MIVA_APP}.route`]: route, ...params })
  return mivaState(await fetchHtml(`${MIVA_URL}?${query}`, { fetchFn, timeoutMs }))
}

/** "nygatan-2_örnsköldsvik-<hash>". Orten med versaler i hashen, eftersom träffar och schema skriver den olika. */
export function mivaAddressId(address: string, city: string): string {
  return edpAddressId(building(address, city))
}

function building(address: string, city: string): EdpBuilding {
  const clean = (t: string) => t.trim().replace(/\s+/g, ' ')
  return { raw: `${address}, ${city}`, street: clean(address), locality: titleCase(clean(city)), buildingId: idHash(`${address}, ${city.toUpperCase()}`) }
}

/** Orten tas bort, eftersom källan ger en tom lista med den. Skiljetecken blir mellanslag. */
const searchable = (q: string) =>
  q
    .split(',')[0]
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Schemat går inte att hämta för andra tecken ("Nygatan 5/ He"). */
const canBeFoundAgain = (text: string) => /^[\p{L}\p{N}\s-]+$/u.test(text)

export async function mivaSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<MivaAddress[]> {
  const query = searchable(q)
  if (!query) return []
  const state = await mivaPage('/', { q: query }, fetchFn, timeoutMs)
  // Exakt en adress: appen går direkt till schemat, utan träffar och därmed utan frekvens.
  if (!Array.isArray(state.hits) || (state.hits.length === 0 && state.route === '/schedule')) {
    if (!isText(state.address) || !isText(state.city)) return []
    return canBeFoundAgain(state.address) ? [{ building: building(state.address, state.city), address: state.address, city: state.city, frequencies: [] }] : []
  }
  const byAddress = new Map<string, MivaAddress>()
  for (const hit of state.hits as Record<string, unknown>[]) {
    // Bara de här tre fälten läses. Resten av träffen är personuppgifter och följer inte med.
    const { PickupAddress: address, PickupCity: city, ExternalId: frequency } = hit ?? {}
    if (!isText(address) || !isText(city)) throw unknownFormat()
    if (!canBeFoundAgain(address)) continue
    const key = `${address}|${city.toUpperCase()}`
    const found = byAddress.get(key) ?? { building: building(address, city), address, city, frequencies: [] }
    if (isText(frequency) && frequency.trim() && !found.frequencies.includes(frequency.trim())) found.frequencies.push(frequency.trim())
    byAddress.set(key, found)
  }
  return [...byAddress.values()]
}
