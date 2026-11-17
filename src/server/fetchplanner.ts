// "När kommer sopbilen?", Sitevision-appen limepark.app-fetchplanner (Miva och Falu Energi & Vatten).
// Den har inget API. Sidan renderas på servern och lägger appens tillstånd som JSON i registerInitialState,
// och det är bara det som läses (undantag från beslut 2 i docs/plans/2026-11-03-fler-kommuner.md).
// Sökträffarna är råa poster med personuppgifter, så bara adress, ort och frekvens läses ur dem.
// Se docs/specs/2026-11-16-ornskoldsvik-miva.md och docs/specs/2026-11-17-falun-fev.md.

import { isValidDate, todayInStockholm, weekdayIndex } from '../domain/dates.js'
import { expandEvery, expandWeekdays, weekRuleDates, type ExpandedPickup } from '../domain/recurrence.js'
import type { Schedule } from '../domain/types.js'
import { edpAddressId, idHash, mergeSeries, queryFromAddressId, titleCase, weekdaysIn, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchHtml, SourceError } from './http.js'

/** Sidan med appen och appens id i Sitevision. */
export interface PlannerApp {
  page: string
  app: string
}

export interface PlannerState {
  route?: string
  hits?: unknown[]
  trips?: unknown[]
  containers?: unknown[]
  address?: unknown
  city?: unknown
}

export interface PlannerAddress {
  building: EdpBuilding
  /** Källans exakta text. Schemat är versalkänsligt i adressen. */
  address: string
  city: string
  /** De olika frekvenserna ("Var 14:e dag") för adressens kärl. Tom när sökningen gick direkt till schemat. */
  frequencies: string[]
}

const unknownFormat = (app: PlannerApp) => new SourceError(`${new URL(app.page).hostname} svarade med ett okänt format`)
const isText = (v: unknown): v is string => typeof v === 'string'

/** Appens tillstånd. Saknas det, eller har det varken träffar, turer eller kärl, har appen ändrats. */
export function plannerState(app: PlannerApp, html: string): PlannerState {
  const mark = `registerInitialState('${app.app}',`
  const start = html.indexOf(mark)
  // Objektet slutar vid ")" före </script>, med eller utan semikolon och mellanrum.
  const body = start < 0 ? null : html.slice(start + mark.length).match(/^([\s\S]*?)\)\s*;?\s*<\/script>/)
  if (!body) throw unknownFormat(app)
  let state: unknown
  try {
    state = JSON.parse(body[1])
  } catch {
    throw unknownFormat(app)
  }
  const s = state as PlannerState
  if (!s || typeof s !== 'object' || (!Array.isArray(s.hits) && !Array.isArray(s.trips) && !Array.isArray(s.containers))) throw unknownFormat(app)
  return s
}

/** Sidan för en route i appen, med dess parametrar. */
export async function plannerPage(app: PlannerApp, route: string, params: Record<string, string>, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<PlannerState> {
  const query = new URLSearchParams({ 'sv.target': app.app, [`sv.${app.app}.route`]: route, ...params })
  return plannerState(app, await fetchHtml(`${app.page}?${query}`, { fetchFn, timeoutMs }))
}

/** "nygatan-2_örnsköldsvik-<hash>". Orten med versaler i hashen, eftersom träffar och schema skriver den olika. */
export function plannerAddressId(address: string, city: string): string {
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

export async function plannerSearch(app: PlannerApp, q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<PlannerAddress[]> {
  const query = searchable(q)
  if (!query) return []
  const state = await plannerPage(app, '/', { q: query }, fetchFn, timeoutMs)
  // Exakt en adress: appen går direkt till schemat, utan träffar och därmed utan frekvens.
  if (!Array.isArray(state.hits) || state.hits.length === 0) {
    if (!isText(state.address) || !isText(state.city)) return []
    return canBeFoundAgain(state.address) ? [{ building: building(state.address, state.city), address: state.address, city: state.city, frequencies: [] }] : []
  }
  const byAddress = new Map<string, PlannerAddress>()
  for (const hit of state.hits as Record<string, unknown>[]) {
    // Bara de här tre fälten läses. Resten av träffen är personuppgifter och följer inte med.
    const { PickupAddress: address, PickupCity: city, ExternalId: frequency } = hit ?? {}
    if (!isText(address) || !isText(city)) throw unknownFormat(app)
    if (!canBeFoundAgain(address)) continue
    const key = `${address}|${city.toUpperCase()}`
    const found = byAddress.get(key) ?? { building: building(address, city), address, city, frequencies: [] }
    if (isText(frequency) && frequency.trim() && !found.frequencies.includes(frequency.trim())) found.frequencies.push(frequency.trim())
    byAddress.set(key, found)
  }
  return [...byAddress.values()]
}

/** Adressen för ett adress-id. Gick sökningen direkt till schemat söks gatan utan nummer, för frekvensen. */
export async function plannerFind(app: PlannerApp, id: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<PlannerAddress | null> {
  const parsed = queryFromAddressId(id)
  if (!parsed) return null
  const same = (a: PlannerAddress) => plannerAddressId(a.address, a.city) === id
  const found = (await plannerSearch(app, parsed.query, fetchFn, timeoutMs)).find(same)
  if (!found || found.frequencies.length > 0) return found ?? null
  // "Nygatan 2", "Nygatan 2-4", "Vägen 12 ab" och "Storgatan 3 B" blir gatan.
  const street = searchable(parsed.query).replace(/\s+\d+(?:\s*-\s*\d+)?(?:\s*\p{L}{1,2})?$/u, '')
  const listed = street && street !== searchable(parsed.query) ? (await plannerSearch(app, street, fetchFn, timeoutMs)).find(same) : undefined
  return { ...found, frequencies: listed?.frequencies ?? [] }
}

/**
 * En tur i schemat. Hos Miva är `next` adressens nästa tömning på vilken tur som helst. Hos FEV kommer
 * turen från ett kärl, och då är `next` kärlets egen nästa tömning (`ownNext`).
 */
export interface PlannerTrip {
  text: string
  types: string[]
  first: string
  next?: string
  ownNext?: boolean
}

/** Källans tidpunkt för midnatt svensk tid ("2026-11-22T23:00:00.000Z") som datum. */
function stockholmDate(app: PlannerApp, iso: unknown): string {
  if (!isText(iso) || Number.isNaN(Date.parse(iso))) throw unknownFormat(app)
  const date = todayInStockholm(new Date(iso))
  if (!isValidDate(date)) throw unknownFormat(app)
  return date
}

/**
 * En tom lista är ett giltigt svar för en adress som sökningen hittar. Orten skickas med versaler som i
 * sökträffarna: Mivas schema skriver den "Bredbyn" men är tomt för den stavningen.
 */
export async function plannerTrips(app: PlannerApp, a: Pick<PlannerAddress, 'address' | 'city'>, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<PlannerTrip[]> {
  const state = await plannerPage(app, `/details/${a.address}`, { city: a.city.toLocaleUpperCase('sv') }, fetchFn, timeoutMs)
  if (!Array.isArray(state.trips)) throw unknownFormat(app)
  if (state.trips.length > 0) {
    return (state.trips as Record<string, unknown>[]).map((t) => {
      if (!isText(t?.text) || !Array.isArray(t.containers)) throw unknownFormat(app)
      const types = (t.containers as Record<string, unknown>[]).map((c) => c?.typeText)
      if (!types.every(isText)) throw unknownFormat(app)
      return { text: t.text, types: [...new Set(types)], first: stockholmDate(app, t.pickupDateIso), ...(t.nextPickupDateIso != null && { next: stockholmDate(app, t.nextPickupDateIso) }) }
    })
  }
  // FEV: turerna är tomma och datumen står på varje kärl. Kärl utan datum har ingen planerad tömning.
  if (!Array.isArray(state.containers)) return []
  return (state.containers as Record<string, unknown>[]).flatMap((c): PlannerTrip[] => {
    if (!isText(c?.typeText)) throw unknownFormat(app)
    if (c.pickupDateIso == null) return []
    return [{ text: '', types: [c.typeText], first: stockholmDate(app, c.pickupDateIso), ...(c.nextPickupDateIso != null && { next: stockholmDate(app, c.nextPickupDateIso) }), ownNext: true }]
  })
}

/** Frekvenserna Sopor kan räkna fram, tätast först. */
const FREQUENCIES = ['2 gånger per vecka', '1 gång per vecka', 'var 14:e dag', 'var 14:e dag (v 22-39)']
const densest = (frequencies: string[]) => FREQUENCIES.find((f) => frequencies.some((x) => x.trim().replace(/\s+/g, ' ').toLowerCase() === f))
/** Om Sopor kan räkna fram datum för frekvensen. Bevakningen rapporterar andra. */
export const isKnownPlannerFrequency = (frequency: string) => densest([frequency]) !== undefined
const isoWeekday = (date: string) => ((weekdayIndex(date) + 6) % 7) + 1
const own = (dates: (string | undefined)[]): ExpandedPickup[] => dates.filter((d): d is string => !!d).map((date) => ({ date, estimated: false }))

/** Trädgårdskärl töms bara under en säsong, så deras datum räknas inte fram över vintern. */
const isSeasonal = (types: string[]) => types.some((t) => /trädgård/i.test(t))

/**
 * Ett kärl med två egna datum (FEV). Steget mellan dem är frekvensen. Är det 1–6 hela veckor räknas
 * datum fram med samma steg. Annars har en tömning flyttats, och då visas bara källans datum.
 */
function containerDates(t: PlannerTrip): ExpandedPickup[] {
  if (!t.next || isSeasonal(t.types)) return own([t.first, t.next])
  const weeks = (Date.parse(t.next) - Date.parse(t.first)) / (7 * 86_400_000)
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 6) return own([t.first, t.next])
  return expandEvery({ next: t.first, stepDays: 7 * weeks }).map((p) => (p.date === t.next ? { date: p.date, estimated: false } : p))
}

/**
 * Mivas tur. Miva går i fasta steg om 14 dagar, också över vecka 53, så pariteten i texten
 * ("udda veckor") är årets och används inte. Nämner texten en annan veckodag än källans datum, eller
 * ger regeln inte källans nästa datum, har en tömning flyttats (t.ex. för en helgdag), och då visas
 * bara källans egna datum.
 */
function tripDates(t: PlannerTrip, frequency: string | undefined, onlyTrip: boolean): ExpandedPickup[] {
  if (t.ownNext) return containerDates(t)
  const next = onlyTrip ? t.next : undefined
  const ownDates = own([t.first, next])
  const named = weekdaysIn(t.text)
  if (named.length === 1 && named[0] !== isoWeekday(t.first)) return ownDates
  const weekday = weekdayIndex(t.first)
  const rule =
    frequency === 'var 14:e dag'
      ? weekRuleDates(t.first, { weekday, every: 2, fixedDays: true })
      : frequency === 'var 14:e dag (v 22-39)'
        ? weekRuleDates(t.first, { weekday, every: 2, fixedDays: true }, { inWeeks: [22, 39] })
        : frequency === '1 gång per vecka'
          ? weekRuleDates(t.first, { weekday, every: 1 })
          : frequency === '2 gånger per vecka' && next && isoWeekday(t.first) !== isoWeekday(next)
            ? expandWeekdays({ next: t.first, weekdays: [isoWeekday(t.first), isoWeekday(next)] })
            : null
  if (!rule || (next && !rule.some((p) => p.date === next))) return ownDates
  return rule.map((p) => (p.date === next ? { date: p.date, estimated: false } : p))
}

/** Datumen från i dag, en händelse per dag. Framräknade datum är `estimated`, som för EDP. */
export function plannerSchedule(trips: PlannerTrip[], frequencies: string[], today: string): Schedule {
  const frequency = densest(frequencies)
  const series = trips.flatMap((t) => {
    const pickups = tripDates(t, frequency, trips.length === 1).filter((p) => p.date >= today)
    return t.types.flatMap((type): PickupSeries[] => {
      const mapped = mapWasteType(type)
      return mapped ? [{ mapped, pickups }] : []
    })
  })
  return { bins: [], events: mergeSeries(series), updatedAt: today }
}
