// Logiken bakom Vercel-funktionerna i api/. Hålls fri från Vercel-specifika typer så att den kan
// testas direkt och köras av Vites dev-server.

import { buildIcs } from '../domain/ics.js'
import { normalize } from '../domain/search.js'
import type { Address } from '../domain/types.js'
import { kommunForLocality, SOURCES, type Source } from '../sources/index.js'
import { edpAddressId, edpSchedule, edpSearch, queryFromAddressId, type EdpBuilding } from './edp.js'

export interface HandlerOptions {
  fetchFn?: typeof fetch
  sources?: Source[]
  timeoutMs?: number
  now?: Date
  /** Ort → kommun per källa (från gatuindexet) */
  places?: Record<string, Record<string, string>>
}

const CACHE_SEARCH = 'public, s-maxage=86400, stale-while-revalidate=604800'
const CACHE_SCHEDULE = 'public, s-maxage=21600, stale-while-revalidate=86400'
const CACHE_PARTIAL = 'public, s-maxage=60'

const json = (body: unknown, status = 200, cache = 'no-store') =>
  Response.json(body, { status, headers: { 'Cache-Control': cache } })

function edpSources(ids: string[], sources: Source[]) {
  return ids
    .map((id) => sources.find((s) => s.id === id))
    .filter((s): s is Source & { config: { system: 'edp'; baseUrl: string } } => s?.config.system === 'edp')
}

function toAddress(source: Source, b: EdpBuilding, places: HandlerOptions['places']): Address {
  return {
    id: edpAddressId(b),
    street: b.street,
    locality: b.locality,
    sourceId: source.id,
    kommun: kommunForLocality(source, b.locality, places?.[source.id]),
  }
}

/** GET /api/sok?q=storgatan 1&sources=uppsala,vafab */
export async function handleSearch(url: URL, opts: HandlerOptions = {}): Promise<Response> {
  const q = url.searchParams.get('q') ?? ''
  if (normalize(q).length < 3) return json({ error: 'Minst tre tecken' }, 400)
  const sources = edpSources((url.searchParams.get('sources') ?? '').split(','), opts.sources ?? SOURCES)

  const results = await Promise.allSettled(
    sources.map(async (s) =>
      (await edpSearch(s.config.baseUrl, q, opts.fetchFn, opts.timeoutMs ?? 3000)).map((b) => toAddress(s, b, opts.places)),
    ),
  )
  const failed = sources.filter((_, i) => results[i].status === 'rejected').map((s) => s.id)
  const addresses = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  return json({ addresses, failed }, 200, failed.length > 0 ? CACHE_PARTIAL : CACHE_SEARCH)
}

/** Hittar adressen bakom ett id genom att söka på den avkodade adressen och välja rätt byggnads-id. */
async function resolve(url: URL, opts: HandlerOptions, id: string) {
  const source = (opts.sources ?? SOURCES).find((s) => s.id === url.searchParams.get('source'))
  const parsed = queryFromAddressId(id)
  if (!source || source.config.system !== 'edp' || !parsed) return { status: 404 as const }
  try {
    const hits = await edpSearch(source.config.baseUrl, parsed.query, opts.fetchFn, opts.timeoutMs ?? 3000)
    const building = hits.find((b) => b.buildingId === parsed.buildingId)
    if (!building) return { status: 404 as const }
    const schedule = await edpSchedule(source.config.baseUrl, building.raw, opts.fetchFn, opts.now, opts.timeoutMs ?? 5000)
    return { status: 200 as const, address: toAddress(source, building, opts.places), schedule }
  } catch {
    return { status: 502 as const }
  }
}

/** GET /api/schema?source=uppsala&id=storgatan-2_uppsala-4004688 */
export async function handleSchedule(url: URL, opts: HandlerOptions = {}): Promise<Response> {
  const r = await resolve(url, opts, url.searchParams.get('id') ?? '')
  if (r.status === 404) return json({ error: 'Adressen finns inte hos källan' }, 404, CACHE_PARTIAL)
  if (r.status === 502) return json({ error: 'Källan svarar inte just nu' }, 502)
  return json({ address: r.address, schedule: r.schedule }, 200, CACHE_SCHEDULE)
}

/** GET /api/ics?source=uppsala&file=storgatan-2_uppsala-4004688.ics (via rewrite från /ics/…) */
export async function handleIcs(url: URL, opts: HandlerOptions = {}): Promise<Response> {
  const id = decodeURIComponent((url.searchParams.get('file') ?? '').replace(/\.ics$/, ''))
  const r = await resolve(url, opts, id)
  if (r.status !== 200) return new Response('Hittades inte', { status: r.status, headers: { 'Cache-Control': CACHE_PARTIAL } })
  const content = buildIcs({ address: r.address, kommunName: r.address.kommun, schedule: r.schedule })
  return new Response(content, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': CACHE_SCHEDULE },
  })
}

