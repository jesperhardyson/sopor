// Stockholm Vatten och Avfall: den publika tjänsten bakom sidan "När kommer sopbilen?" (bara villor
// och radhus). Tjänsten är inte dokumenterad och har bytt format förut, så allt vi inte känner igen
// blir ett fel i stället för ett tomt svar. Se docs/specs/2026-11-02-stockholm.md.

import { isValidDate, todayInStockholm } from '../domain/dates.js'
import { expandEvery, type ExpandedPickup } from '../domain/recurrence.js'
import type { FractionId, Schedule } from '../domain/types.js'
import { encode, mergeSeries, queryFromAddressId } from './edp.js'
import { mapWasteType } from './fractions-map.js'
import { fetchJson, SourceError } from './http.js'

export const SVOA_URL = 'https://www.stockholmvattenochavfall.se/villa-och-radhus/avfallstjanster/nar-kommer-sopbilen'

const unknownFormat = () => new SourceError('stockholmvattenochavfall.se svarade med ett okänt format')

export interface SvoaAddress {
  /** Hela adressen som tjänsten skriver den: "Hjortronvägen 3, Bromma, 168 59" */
  raw: string
  street: string
  locality: string
  postcode: string
}

export function parseSvoaAddress(raw: string): SvoaAddress | null {
  const parts = raw.split(',').map((p) => p.trim())
  if (parts.length !== 3 || parts.some((p) => !p)) return null
  const [street, locality, postcode] = parts
  return { raw, street, locality, postcode }
}

const compactPostcode = (postcode: string) => postcode.replace(/\s+/g, '')

/** "hjortronvägen-3_bromma-16859": som EDP:s id, med postnumret i stället för byggnads-id. */
export function svoaAddressId(a: SvoaAddress): string {
  return `${encode(`${a.street}, ${a.locality}`)}-${compactPostcode(a.postcode)}`
}

/** Söksträng ("hjortronvägen 3") och postnummer utan mellanslag ("16859") */
export function queryFromSvoaId(id: string): { query: string; postcode: string } | null {
  const parsed = queryFromAddressId(id)
  if (!parsed || !/^\d{5}$/.test(parsed.buildingId)) return null
  return { query: parsed.query.split(',')[0].trim(), postcode: parsed.buildingId }
}

/** Gatan och postnumret som id:t pekar på. Orten jämförs inte, så att en ny stavning inte tappar adressen. */
export function sameSvoaAddress(id: string, a: SvoaAddress): boolean {
  const parsed = queryFromSvoaId(id)
  return !!parsed && parsed.postcode === compactPostcode(a.postcode) && encode(parsed.query) === encode(a.street)
}

/** "Kärl 1 - restavfall och matavfall" → rest och mat. Okända kärl blir `karl` med källans text. */
export function svoaFractions(group: string): { fractions: FractionId[]; label?: string } {
  const [, list] = group.split(/\s+-\s+/)
  const parts = list ? list.split(/\s+och\s+|\s*,\s*/) : [group.split(',')[0]]
  const mapped = parts.map((p) => mapWasteType(p))
  if (mapped.some((m) => !m || m.fractions.includes('karl'))) {
    return list ? { fractions: ['karl'], label: group.trim() } : { fractions: ['karl'], label: parts[0].trim() }
  }
  return { fractions: [...new Set(mapped.flatMap((m) => m!.fractions))] }
}

const STEPS: [RegExp, number][] = [
  [/^varje vecka/, 7],
  [/^varannan vecka/, 14],
  [/^var 3:e vecka/, 21],
  [/^var 4:e vecka/, 28],
]
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

/** "Varannan vecka (april-nov)" → 14 dagar i april–november. null för en frekvens vi inte känner igen. */
export function svoaStep(frequency: string): { stepDays: number; inMonths?: number[] } | null {
  const text = frequency.trim().toLowerCase()
  const step = STEPS.find(([pattern]) => pattern.test(text))?.[1]
  if (!step) return null
  const season = text.match(/\((\p{L}+)\s*-\s*(\p{L}+)\)/u)
  if (!season) return { stepDays: step }
  const from = MONTHS.indexOf(season[1].slice(0, 3)) + 1
  const to = MONTHS.indexOf(season[2].slice(0, 3)) + 1
  if (!from || !to) return null
  const inMonths = Array.from({ length: ((to - from + 12) % 12) + 1 }, (_, i) => ((from - 1 + i) % 12) + 1)
  return { stepDays: step, inMonths }
}

export async function svoaSearch(q: string, fetchFn?: typeof fetch, timeoutMs = 3000): Promise<SvoaAddress[]> {
  const res = await fetchJson<unknown>(`${SVOA_URL}/AutoCompleteMe?${new URLSearchParams({ query: q })}`, {}, { fetchFn, timeoutMs })
  if (!Array.isArray(res)) throw unknownFormat()
  return res.map((r) => {
    const a = typeof r?.value === 'string' ? parseSvoaAddress(r.value) : null
    if (!a) throw unknownFormat()
    return a
  })
}

interface Pickup {
  group: string
  frequency: string
  date: string
}

/** Dagens form (en lista) och den äldre (ett objekt per kärl). Allt annat är ett okänt format. */
function readPickups(res: unknown): Pickup[] {
  const rows: Pickup[] = Array.isArray(res)
    ? res.map((r) => ({ group: r?.group, frequency: r?.fetchFrequency, date: r?.executionDate }))
    : res && typeof res === 'object'
      ? Object.entries(res).map(([group, list]) => {
          const first = Array.isArray(list) ? list[0] : undefined
          return { group, frequency: first?.FetchFrequency, date: first?.ExecutionDate }
        })
      : []
  if (!Array.isArray(res) && rows.length === 0) throw unknownFormat()
  for (const r of rows) {
    if (typeof r.group !== 'string' || typeof r.date !== 'string' || !isValidDate(r.date)) throw unknownFormat()
  }
  return rows
}

export async function svoaSchedule(raw: string, fetchFn?: typeof fetch, timeoutMs = 5000): Promise<Schedule> {
  const res = await fetchJson<unknown>(`${SVOA_URL}/Search?${new URLSearchParams({ address: raw })}`, {}, { fetchFn, timeoutMs })
  const series = readPickups(res).map((p) => {
    const step = svoaStep(String(p.frequency ?? ''))
    // En frekvens vi inte känner igen ger bara källans eget datum, aldrig gissade datum.
    const pickups: ExpandedPickup[] = step ? expandEvery({ next: p.date, ...step }) : [{ date: p.date, estimated: false }]
    return { pickups, mapped: svoaFractions(p.group) }
  })
  return { bins: [], events: mergeSeries(series), updatedAt: todayInStockholm() }
}
