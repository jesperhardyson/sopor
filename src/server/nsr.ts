// NSR (Helsingborg, Ängelholm, Höganäs, Båstad, Bjuv och Åstorp): tömningskalendern på nsr.se.
// Sökningen ger adresser med fyra veckors tömningar, och ICS-filen hela året. Adresserna blir
// EdpBuilding och får EDP:s adress-id. Allt vi inte känner igen blir ett fel i stället för ett
// tomt svar. Se docs/specs/2026-11-03-nsr.md.

import { formatShort, isValidDate, todayInStockholm } from '../domain/dates.js'
import type { Schedule } from '../domain/types.js'
import { mergeSeries, type EdpBuilding, type PickupSeries } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchCalendar, fetchJson, SourceError } from './http.js'

export const NSR_URL = 'https://nsr.se/api/wastecalendar'

export interface NsrPickup {
  date: string
  type: string
  /** Flyttad tömning ("Ändrad" hos NSR) */
  changed: boolean
}

export interface NsrHit {
  building: EdpBuilding
  /** De närmaste fyra veckorna, ur sökningen */
  pickups: NsrPickup[]
}

const MOVED = 'Flyttad tömning enligt NSR.'

const unknownFormat = () => new SourceError('nsr.se svarade med ett okänt format')

function toHit(item: Record<string, unknown>): NsrHit {
  const { id, Adress, Ort, Exec } = item ?? {}
  const exec = (Exec ?? {}) as { Datum?: unknown; AvfallsTyp?: unknown; Andrad?: unknown }
  const dates = exec.Datum
  const types = exec.AvfallsTyp
  if (typeof id !== 'string' || !/^\w+$/.test(id) || typeof Adress !== 'string' || !Adress.trim() || typeof Ort !== 'string') throw unknownFormat()
  if (!Array.isArray(dates) || !Array.isArray(types) || dates.length !== types.length) throw unknownFormat()
  const changed = Array.isArray(exec.Andrad) ? exec.Andrad : []
  const pickups = dates.map((date, i) => {
    if (typeof date !== 'string' || !isValidDate(date) || typeof types[i] !== 'string') throw unknownFormat()
    return { date, type: types[i].trim(), changed: changed[i] === 1 }
  })
  const street = Adress.trim()
  return { building: { raw: street, street, locality: Ort.trim(), buildingId: id }, pickups }
}

/**
 * NSR gör om "Södra Torggatan 7A" till "Södra Torggatan $1 $2" och hittar ingenting, varken i
 * sökningen eller i kalenderfilen. Utan bokstaven kommer 7A med bland träffarna.
 */
const searchable = (q: string) => q.trim().replace(/(\d+)\D*$/, '$1')

/** Fritext på gata och nummer. Orten följer inte med: "Rosenvägen 3, Helsingborg" ger inga träffar. */
export async function nsrSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<NsrHit[]> {
  const res = await fetchJson<{ fp?: unknown }>(`${NSR_URL}/search?${new URLSearchParams({ query: searchable(q) })}`, {}, { fetchFn, timeoutMs })
  if (!res || !Array.isArray(res.fp)) throw unknownFormat()
  return res.fp.map(toHit)
}

const unescape = (value: string) => value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()

/** Händelserna i NSR:s ICS-fil, en gång var (filen har varje händelse två gånger). */
export function parseNsrIcs(text: string): (NsrPickup & { location: string })[] {
  if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) throw unknownFormat()
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const seen = new Map<string, NsrPickup & { location: string }>()
  for (const [, body] of unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)) {
    const event = body.replace(/BEGIN:VALARM[\s\S]*?END:VALARM\r?\n?/g, '')
    const start = event.match(/^DTSTART[^:\r\n]*:(\d{4})(\d{2})(\d{2})/m)
    const summary = event.match(/^SUMMARY:(.*)$/m)
    if (!start || !summary) throw unknownFormat()
    const date = `${start[1]}-${start[2]}-${start[3]}`
    const text = unescape(summary[1])
    const type = text.replace(/^Ändrad:\s*/i, '')
    const location = unescape(event.match(/^LOCATION:(.*)$/m)?.[1] ?? '')
    seen.set(`${date}|${type}`, { date, type, changed: type !== text, location })
  }
  return [...seen.values()]
}

/**
 * Kalenderfilen och sökträffens fyra veckor ihop, från i dag. Sökträffen täcker årsskiftet innan
 * NSR har lagt ut nästa års kalender. Bara källans egna datum, inga beräknade.
 */
export async function nsrSchedule(hit: NsrHit, fetchFn?: typeof fetch, timeoutMs = 5000, today = todayInStockholm()): Promise<Schedule> {
  const { street, locality, buildingId } = hit.building
  const params = new URLSearchParams({ query: searchable(street), id: buildingId, calendar_type: 'ical' })
  const events = await fetchCalendar(`${NSR_URL}/calendar?${params}`, { fetchFn, timeoutMs }).then(parseNsrIcs, (error: Error) => {
    // Utan tömningar svarar NSR 500 i stället för en tom kalender.
    if (hit.pickups.length === 0 && /svarade 500$/.test(error.message)) return []
    throw error
  })
  // NSR:s id är inte unikt, så filen måste gälla samma adress som träffen.
  const own = events.filter((e) => e.location.toLowerCase() === `${street}, ${locality}`.toLowerCase())
  if (events.length > 0 && own.length === 0) throw unknownFormat()

  const byType = new Map<string, Map<string, boolean>>()
  for (const p of [...own, ...hit.pickups]) {
    if (p.date < today) continue
    const dates = byType.get(p.type) ?? new Map<string, boolean>()
    dates.set(p.date, (dates.get(p.date) ?? false) || p.changed)
    byType.set(p.type, dates)
  }
  const series = [...byType].map(([type, dates]): PickupSeries | null => {
    // Villornas "KÄRL 1" och "KÄRL 2" är fyrfackskärl.
    const mapped = mapWasteType(type, '', /^kärl \d+$/i.test(type) ? 'fyrfack' : '')
    const pickups = [...dates].map(([date, changed]) => ({ date, estimated: false, ...(changed && { warning: MOVED }) }))
    return mapped ? { pickups, mapped } : null
  })
  return { bins: [], events: mergeSeries(series.filter((s) => s !== null)), updatedAt: today }
}

/**
 * Flera träffar med samma gata och ort (två abonnemang) får kärlen som särskiljare, och har de
 * samma kärl också nästa tömning. NSR:s id säger användaren ingenting.
 */
export function nsrDetails(hits: NsrHit[]): [EdpBuilding, string | undefined][] {
  const key = (h: NsrHit) => `${h.building.street}|${h.building.locality}`
  const bins = (h: NsrHit) => [...new Set(h.pickups.map((p) => p.type.replace(/^KÄRL/, 'Kärl')))].join(', ')
  const groups = new Map<string, NsrHit[]>()
  for (const h of hits) groups.set(key(h), [...(groups.get(key(h)) ?? []), h])
  return hits.map((h) => {
    const group = groups.get(key(h))!
    if (group.length === 1) return [h.building, undefined]
    const sameBins = group.some((o) => o !== h && bins(o) === bins(h))
    const next = h.pickups[0]?.date
    const detail = sameBins && next ? `${bins(h)}, nästa ${formatShort(next)}` : bins(h) || 'Inga tömningar just nu'
    return [h.building, detail]
  })
}
