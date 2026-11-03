// Logiken bakom Vercel-funktionerna i api/. Hålls fri från Vercel-specifika typer så att den kan
// testas direkt och köras av Vites dev-server.

import { buildIcs, buildNoticeIcs } from '../domain/ics.js'
import { todayInStockholm } from '../domain/dates.js'
import { normalize } from '../domain/search.js'
import type { Address } from '../domain/types.js'
import { matchesPlace } from '../data/street-index.js'
import { isLive, kommunForLocality, SOURCES, type LiveSource, type Source } from '../sources/index.js'
import { edpAddressId, edpSearch, type EdpBuilding } from './edp.js'
import { svoaAddressId, svoaSearch } from './svoa.js'
import { vasydSearch } from './vasyd.js'
import { lookupAddress } from './lookup.js'

export interface HandlerOptions {
  fetchFn?: typeof fetch
  sources?: Source[]
  timeoutMs?: number
  now?: Date
  /** Ort → kommun per källa (från gatuindexet) */
  places?: Record<string, Record<string, string>>
}

export const CACHE_SEARCH = 'public, s-maxage=86400, stale-while-revalidate=604800'
const CACHE_SCHEDULE = 'public, s-maxage=21600, stale-while-revalidate=86400'
export const CACHE_PARTIAL = 'public, s-maxage=60'

const json = (body: unknown, status = 200, cache = 'no-store') =>
  Response.json(body, { status, headers: { 'Cache-Control': cache } })

export function liveSources(ids: string[], sources: Source[]): LiveSource[] {
  return ids.map((id) => sources.find((s) => s.id === id)).filter((s): s is LiveSource => !!s && isLive(s))
}

/** EDP svarar med högst så här många adresser per sökning. */
export const EDP_LIMIT = 10

/**
 * Källan söker på gatan. Är svaret avkortat kan rätt ort saknas, så då frågas den också med
 * "gata, ort", som den matchar på början av adressen.
 */
async function edpSearchPlace(baseUrl: string, street: string, place: string, opts: HandlerOptions): Promise<EdpBuilding[]> {
  const found = await edpSearch(baseUrl, street, opts.fetchFn, opts.timeoutMs ?? 3000)
  if (!place || found.length < EDP_LIMIT) return found
  const more = await edpSearch(baseUrl, `${street}, ${place}`, opts.fetchFn, opts.timeoutMs ?? 3000)
  return [...found, ...more.filter((b) => !found.some((f) => f.buildingId === b.buildingId))]
}

/** En live-källas adresser för gatan, filtrerade på orten om den finns (sajtens sökning och API v1). */
export async function searchLiveSource(source: LiveSource, street: string, place: string, opts: HandlerOptions): Promise<Address[]> {
  if (source.config.system === 'svoa') {
    const kommun = source.kommuner[0].name
    return (await svoaSearch(street, opts.fetchFn, opts.timeoutMs ?? 3000))
      .map((a): Address => ({ id: svoaAddressId(a), street: a.street, locality: a.locality, sourceId: source.id, kommun }))
      .filter((a) => matchesPlace(a, place))
  }
  const buildings =
    source.config.system === 'vasyd'
      ? await vasydSearch(street, opts.fetchFn, opts.timeoutMs ?? 3000)
      : await edpSearchPlace(source.config.baseUrl, street, place, opts)
  return withDetails(buildings)
    .map(([b, detail]) => toAddress(source, b, opts.places, detail))
    .filter((a) => matchesPlace(a, place))
}

export function toAddress(source: Source, b: EdpBuilding, places: HandlerOptions['places'], detail?: string): Address {
  return {
    id: edpAddressId(b),
    street: b.street,
    locality: b.locality,
    sourceId: source.id,
    kommun: kommunForLocality(source, b.locality, places?.[source.id]),
    ...(detail && { detail }),
  }
}

/** Flera byggnader med samma gata och ort (flerbostadshus) får byggnads-id:t som särskiljare. */
export function withDetails(buildings: EdpBuilding[]): [EdpBuilding, string | undefined][] {
  const key = (b: EdpBuilding) => `${b.street}|${b.locality}`
  const count = new Map<string, number>()
  for (const b of buildings) count.set(key(b), (count.get(key(b)) ?? 0) + 1)
  return buildings.map((b) => [b, count.get(key(b))! > 1 ? `Byggnad ${b.buildingId}` : undefined])
}

/** GET /api/sok?q=storgatan 1&sources=uppsala,vafab */
export async function handleSearch(url: URL, opts: HandlerOptions = {}): Promise<Response> {
  const q = url.searchParams.get('q') ?? ''
  if (normalize(q).length < 3) return json({ error: 'Minst tre tecken' }, 400)
  const sources = liveSources((url.searchParams.get('sources') ?? '').split(','), opts.sources ?? SOURCES)

  const results = await Promise.allSettled(sources.map((s) => searchLiveSource(s, q, '', opts)))
  const failed = sources.filter((_, i) => results[i].status === 'rejected').map((s) => s.id)
  const addresses = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  // Svarade ingen källa cachas inget, så att sökrutans nya försök når källan och inte ett sparat fel.
  const cache = failed.length === 0 ? CACHE_SEARCH : failed.length < sources.length ? CACHE_PARTIAL : 'no-store'
  return json({ addresses, failed }, 200, cache)
}

/**
 * Söksträngar att pröva i tur och ordning: exakt adress med ort, gata med nummer och bara
 * gatunamnet. Bredare sökningar klarar att källan stavat om orten eller formatet.
 */
export function searchCandidates(query: string): string[] {
  const street = query.split(',')[0].trim()
  const streetName = street.replace(/\s*\d.*$/, '').trim()
  return [...new Set([query, street, streetName])].filter((q) => normalize(q).length >= 3)
}

/**
 * Adress-id innehåller aldrig '%'. Finns en procentkod kvar efter URLSearchParams har en rewrite
 * kodat id:t en gång till, så det avkodas en gång till. En trasig kod lämnas orörd (ger 404).
 */
export function decodeId(value: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const lookup = (url: URL, opts: HandlerOptions, id: string) =>
  lookupAddress((opts.sources ?? SOURCES).find((s) => s.id === url.searchParams.get('source')), id, url.origin, opts)

/** GET /api/schema?source=uppsala&id=storgatan-2_uppsala-4004688 */
export async function handleSchedule(url: URL, opts: HandlerOptions = {}): Promise<Response> {
  const r = await lookup(url, opts, url.searchParams.get('id') ?? '')
  if (r.status === 404) return json({ error: 'Adressen finns inte hos källan' }, 404, CACHE_PARTIAL)
  if (r.status === 502) return json({ error: 'Källan svarar inte just nu' }, 502)
  return json({ address: r.address, schedule: r.schedule }, 200, CACHE_SCHEDULE)
}

/** GET /api/ics?source=uppsala&file=storgatan-2_uppsala-4004688.ics (via rewrite från /ics/…) */
export async function handleIcs(url: URL, opts: HandlerOptions = {}): Promise<Response> {
  const id = decodeId((url.searchParams.get('file') ?? '').replace(/\.ics$/, ''))
  const r = await lookup(url, opts, id)
  // Källan nere, eller ett tomt schema från en live-källa (kan vara ett nytt format hos källan):
  // svara med fel så att kalenderappen behåller det den har i stället för att tömmas.
  const live = (opts.sources ?? SOURCES).find((s) => s.id === url.searchParams.get('source'))
  if (r.status === 502 || (r.status === 200 && r.schedule.events.length === 0 && live && isLive(live))) {
    return new Response('Källan svarar inte just nu', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
  if (r.status === 404) {
    const known = (opts.sources ?? SOURCES).some((s) => s.id === url.searchParams.get('source'))
    if (!known) return new Response('Hittades inte', { status: 404, headers: { 'Cache-Control': CACHE_PARTIAL } })
    return new Response(buildNoticeIcs({ addressId: id, today: todayInStockholm(opts.now) }), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600' },
    })
  }
  const content = buildIcs({ address: r.address, kommunName: r.address.kommun, schedule: r.schedule })
  return new Response(content, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': CACHE_SCHEDULE },
  })
}

