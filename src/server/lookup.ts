// Slår upp en adress (källa + id) och hämtar dess schema, oavsett om källan är EDP eller statisk.

import { mergeParts } from '../domain/schedule.js'
import type { Address, Schedule } from '../domain/types.js'
import type { AddressIndexFile, ScheduleFile } from '../data/static-format.js'
import { needsPlaces, type Source } from '../sources/index.js'
import { edpSchedule, edpSearch, queryFromAddressId, type EdpBuilding } from './edp.js'
import { queryFromSvoaId, sameSvoaAddress, SVOA_LIMIT, svoaSchedule, svoaSearch, type SvoaAddress } from './svoa.js'
import { searchCandidates, toAddress, withDetails, type HandlerOptions } from './handlers.js'
import { loadServerPlaces, siteJson } from './site.js'

export type Lookup =
  | { status: 200; address: Address; schedule: Schedule }
  | { status: 404 }
  | { status: 502 }

/** Schemat är sorterat på datum för båda källtyperna. */
export async function lookupAddress(
  source: Source | undefined,
  id: string,
  origin: string,
  opts: HandlerOptions,
): Promise<Lookup> {
  if (!source) return { status: 404 }
  try {
    if (source.config.system === 'edp') return await lookupEdp(source, source.config.baseUrl, id, origin, opts)
    if (source.config.system === 'svoa') return await lookupSvoa(source, id, opts)
    return await lookupStatic(source, id, origin, opts)
  } catch (e) {
    console.error('Uppslagning av adress misslyckades', e)
    return { status: 502 }
  }
}

async function lookupEdp(source: Source, baseUrl: string, id: string, origin: string, opts: HandlerOptions): Promise<Lookup> {
  const parsed = queryFromAddressId(id)
  if (!parsed) return { status: 404 }
  let found: [EdpBuilding, string | undefined] | undefined
  for (const q of searchCandidates(parsed.query)) {
    const hits = withDetails(await edpSearch(baseUrl, q, opts.fetchFn, opts.timeoutMs ?? 3000))
    found = hits.find(([b]) => b.buildingId === parsed.buildingId)
    if (found) break
  }
  if (!found) return { status: 404 }
  const [building, detail] = found
  const schedule = await edpSchedule(baseUrl, building.raw, opts.fetchFn, opts.now, opts.timeoutMs ?? 5000)
  const places = opts.places ?? (needsPlaces(source) ? await loadServerPlaces(origin, opts.fetchFn) : undefined)
  return { status: 200, address: toAddress(source, building, places, detail), schedule }
}

/**
 * Stockholm. Hittas inte id:t blir det 502, inte 404: en 404 byter ut hela kalenderprenumerationen
 * mot en uppmaning att söka igen, och det får inte hända alla för att SVOA ändrat en stavning.
 */
async function lookupSvoa(source: Source, id: string, opts: HandlerOptions): Promise<Lookup> {
  const parsed = queryFromSvoaId(id)
  if (!parsed) return { status: 502 }
  // Adressökningen ger högst fem svar. Är svaret fullt utan adressen frågas den också med orten.
  let found: SvoaAddress | undefined
  for (const q of [parsed.query, queryFromAddressId(id)!.query]) {
    const hits = await svoaSearch(q, opts.fetchFn, opts.timeoutMs ?? 3000)
    found = hits.find((a) => sameSvoaAddress(id, a))
    if (found || hits.length < SVOA_LIMIT) break
  }
  if (!found) return { status: 502 }
  const schedule = await svoaSchedule(found.raw, opts.fetchFn, opts.timeoutMs ?? 5000)
  const kommun = source.kommuner[0].name
  return { status: 200, address: { id, street: found.street, locality: found.locality, sourceId: source.id, kommun }, schedule }
}

async function lookupStatic(source: Source, id: string, origin: string, opts: HandlerOptions): Promise<Lookup> {
  const base = `/data/${source.id}`
  const index = await siteJson<AddressIndexFile>(origin, `${base}/addresses.json`, opts.fetchFn, opts.timeoutMs)
  if (!index) return { status: 502 }
  const row = index.addresses.find(([rowId]) => rowId === id)
  if (!row) return { status: 404 }
  const [, street, locality, refs] = row
  const parts = await Promise.all(
    refs.map((ref) => siteJson<ScheduleFile>(origin, `${base}/schedules/${encodeURIComponent(ref)}.json`, opts.fetchFn, opts.timeoutMs)),
  )
  if (parts.some((p) => p === null)) return { status: 502 }
  const address: Address = { id, street, locality, sourceId: source.id, kommun: source.kommuner[0]?.name ?? source.name }
  return { status: 200, address, schedule: mergeParts(parts as ScheduleFile[]) }
}
