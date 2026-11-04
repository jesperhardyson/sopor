// Slår upp en adress (källa + id) och hämtar dess schema, oavsett om källan är EDP eller statisk.

import { todayInStockholm } from '../domain/dates.js'
import { mergeParts } from '../domain/schedule.js'
import type { Address, Schedule } from '../domain/types.js'
import type { AddressIndexFile, ScheduleFile } from '../data/static-format.js'
import { needsPlaces, type Source } from '../sources/index.js'
import { edpAddressId, edpSchedule, edpSearch, queryFromAddressId, type EdpBuilding } from './edp.js'
import { nsrDetails, nsrSchedule, nsrSearch } from './nsr.js'
import { appbolagetFind, appbolagetSchedule } from './appbolaget.js'
import { SRV_CUSTOMER_TIMEOUT_MS, srvFind, srvSchedule } from './srv.js'
import { roslagsvattenFind, roslagsvattenPickups, roslagsvattenSchedule } from './roslagsvatten.js'
import { uddevallaFind, uddevallaPickups, uddevallaSchedule } from './uddevalla.js'
import { vasydSchedule, vasydSearch } from './vasyd.js'
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
    if (source.config.system === 'vasyd') return await lookupVasyd(source, id, origin, opts)
    if (source.config.system === 'nsr') return await lookupNsr(source, id, origin, opts)
    if (source.config.system === 'srv') return await lookupSrv(source, id, origin, opts)
    if (source.config.system === 'appbolaget') return await lookupAppbolaget(source, source.config.unit, id, opts)
    if (source.config.system === 'uddevalla') return await lookupUddevalla(source, id, opts)
    if (source.config.system === 'roslagsvatten') return await lookupRoslagsvatten(source, source.config.municipality, id, opts)
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

/** Malmö och Burlöv: som EDP, men ett id utan träff ger 502 (se lookupSvoa). */
async function lookupVasyd(source: Source, id: string, origin: string, opts: HandlerOptions): Promise<Lookup> {
  const parsed = queryFromAddressId(id)
  if (!parsed) return { status: 502 }
  // Id:t tappar kolonet i "S:t", och VA Syd hittar inte "St Knuts väg", så den stavningen provas också.
  const queries = [parsed.query, parsed.query.replace(/^st /, 's:t ')]
  let found: [EdpBuilding, string | undefined] | undefined
  for (const q of [...new Set(queries.flatMap(searchCandidates))]) {
    const hits = withDetails(await vasydSearch(q, opts.fetchFn, opts.timeoutMs ?? 3000))
    found = hits.find(([b]) => b.buildingId === parsed.buildingId)
    if (found) break
  }
  if (!found) return { status: 502 }
  const [building, detail] = found
  const schedule = await vasydSchedule(building, opts.fetchFn, opts.timeoutMs ?? 5000)
  const places = opts.places ?? (needsPlaces(source) ? await loadServerPlaces(origin, opts.fetchFn) : undefined)
  return { status: 200, address: toAddress(source, building, places, detail), schedule }
}

/**
 * NSR: som VA Syd, men NSR:s id är inte unikt, så hela adress-id:t (gata, ort och id) måste
 * stämma. Sökningen tar bara gatan; med orten blir det inga träffar.
 */
async function lookupNsr(source: Source, id: string, origin: string, opts: HandlerOptions): Promise<Lookup> {
  const parsed = queryFromAddressId(id)
  if (!parsed) return { status: 502 }
  const street = parsed.query.split(',')[0].trim()
  for (const q of [...new Set([street, street.replace(/^st /, 's:t ')])]) {
    const hits = await nsrSearch(q, opts.fetchFn, opts.timeoutMs ?? 3000)
    const index = hits.findIndex((h) => edpAddressId(h.building) === id)
    if (index < 0) continue
    const [building, detail] = nsrDetails(hits)[index]
    const schedule = await nsrSchedule(hits[index], opts.fetchFn, opts.timeoutMs ?? 5000, todayInStockholm(opts.now))
    const places = opts.places ?? (needsPlaces(source) ? await loadServerPlaces(origin, opts.fetchFn) : undefined)
    return { status: 200, address: toAddress(source, building, places, detail), schedule }
  }
  return { status: 502 }
}

/** SRV: kundnumret i id:t pekar ut adressen. Ett id utan träff ger 502 (se lookupSvoa). */
async function lookupSrv(source: Source, id: string, origin: string, opts: HandlerOptions): Promise<Lookup> {
  const found = await srvFind(id, opts.fetchFn, opts.timeoutMs ?? SRV_CUSTOMER_TIMEOUT_MS)
  if (!found) return { status: 502 }
  const schedule = srvSchedule(found.containers, todayInStockholm(opts.now))
  const places = opts.places ?? (needsPlaces(source) ? await loadServerPlaces(origin, opts.fetchFn) : undefined)
  return { status: 200, address: toAddress(source, found.building, places), schedule }
}

/** Appbolaget: uuid:t i id:t pekar ut adressen, utan sökning. Ett id utan träff ger 502 (se lookupSvoa). */
async function lookupAppbolaget(source: Source, unit: string, id: string, opts: HandlerOptions): Promise<Lookup> {
  const found = await appbolagetFind(unit, id, opts.fetchFn, opts.timeoutMs ?? 5000)
  if (!found) return { status: 502 }
  const schedule = await appbolagetSchedule(unit, found.propertyIds, opts.fetchFn, opts.timeoutMs ?? 5000, todayInStockholm(opts.now))
  return { status: 200, address: toAddress(source, found.building, opts.places), schedule }
}

/** Uddevalla: hashen i id:t pekar ut adressen bland sökträffarna. Ett id utan träff ger 502 (se lookupSvoa). */
async function lookupUddevalla(source: Source, id: string, opts: HandlerOptions): Promise<Lookup> {
  const timeoutMs = opts.timeoutMs ?? 5000
  const found = await uddevallaFind(id, opts.fetchFn, timeoutMs)
  if (!found) return { status: 502 }
  const schedule = uddevallaSchedule(await uddevallaPickups(found.plantNumber, opts.fetchFn, timeoutMs), todayInStockholm(opts.now))
  return { status: 200, address: toAddress(source, found.building, opts.places), schedule }
}

/** Roslagsvatten: som Uddevalla, men kommunen krävs i varje anrop. */
async function lookupRoslagsvatten(source: Source, municipality: string, id: string, opts: HandlerOptions): Promise<Lookup> {
  const timeoutMs = opts.timeoutMs ?? 5000
  const found = await roslagsvattenFind(municipality, id, opts.fetchFn, timeoutMs)
  if (!found) return { status: 502 }
  const schedule = roslagsvattenSchedule(await roslagsvattenPickups(municipality, found.buildingId, opts.fetchFn, timeoutMs), todayInStockholm(opts.now))
  return { status: 200, address: toAddress(source, found.building, opts.places), schedule }
}

async function lookupStatic(source: Source, id: string, origin: string, opts: HandlerOptions): Promise<Lookup> {
  const base = `/data/${source.id}`
  const index = await siteJson<AddressIndexFile>(origin, `${base}/addresses.json`, opts.fetchFn, opts.timeoutMs)
  if (!index) return { status: 502 }
  const row = index.addresses.find(([rowId]) => rowId === id)
  if (!row) return { status: 404 }
  const [, street, locality, refs, area] = row
  const parts = await Promise.all(
    refs.map((ref) => siteJson<ScheduleFile>(origin, `${base}/schedules/${encodeURIComponent(ref)}.json`, opts.fetchFn, opts.timeoutMs)),
  )
  if (parts.some((p) => p === null)) return { status: 502 }
  const address: Address = { id, street, locality, sourceId: source.id, kommun: source.kommuner[0]?.name ?? source.name }
  if (area) address.detail = area.detail
  return { status: 200, address, schedule: mergeParts(parts as ScheduleFile[]) }
}
