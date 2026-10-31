// Det publika, versionerade API:t (/api/v1/…). Formaterar svaren; källogiken ligger i lookup.ts.
// Kontraktet: fält tas aldrig bort eller byter namn, och fält utan värde skickas som null.

import { secondsToStockholmMidnight, todayInStockholm } from '../domain/dates.js'
import { FRACTIONS, sortFractions } from '../domain/fractions.js'
import { nextPerFraction, pickupSummary } from '../domain/next.js'
import { upcoming } from '../domain/schedule.js'
import { normalize, searchAddresses } from '../domain/search.js'
import type { Address, FractionId, Schedule } from '../domain/types.js'
import { pickLiveSources, shardKey, type StreetShard } from '../data/street-index.js'
import type { AddressIndexFile } from '../data/static-format.js'
import { SOURCES, type Source } from '../sources/index.js'
import { edpSearch } from './edp.js'
import { CACHE_PARTIAL, CACHE_SEARCH, decodeId, toAddress, withDetails, type HandlerOptions } from './handlers.js'
import { lookupAddress } from './lookup.js'
import { loadServerPlaces, siteJson } from './site.js'

export type V1Handler = (request: Request, opts?: HandlerOptions) => Promise<Response>

const CACHE_SHORT = 'public, s-maxage=60'
const CACHE_SOURCES = 'public, s-maxage=86400'

const v1Json = (body: object, status = 200, cache = 'no-store') =>
  Response.json({ apiVersion: '1', ...body }, { status, headers: { 'Cache-Control': cache } })

export function v1Error(
  status: 400 | 404 | 502,
  code: 'bad_request' | 'not_found' | 'source_unavailable',
  message: string,
  cache = status === 404 ? CACHE_SHORT : 'no-store',
): Response {
  return v1Json({ error: { code, message } }, status, cache)
}

/** OPTIONS → 204. Lägger till CORS på alla svar (apiVersion lägger handlern själv). Ett kast blir 502 i felformen. */
export function v1(handler: V1Handler) {
  return async (request: Request, opts?: HandlerOptions): Promise<Response> => {
    let res: Response
    try {
      res = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await handler(request, opts)
    } catch {
      res = v1Error(502, 'source_unavailable', 'Något gick fel, försök igen senare')
    }
    res.headers.set('Access-Control-Allow-Origin', '*')
    return res
  }
}

/** Cachen slutar vid midnatt i Stockholm, så att isToday och daysUntil aldrig är från igår. */
export function addressCacheControl(now: Date): string {
  const left = secondsToStockholmMidnight(now)
  const maxAge = Math.max(1, Math.min(21600, left))
  const swr = Math.min(3600, left - maxAge)
  return `public, s-maxage=${maxAge}${swr > 0 ? `, stale-while-revalidate=${swr}` : ''}`
}

const visibleSources = (opts: HandlerOptions) => (opts.sources ?? SOURCES).filter((s) => !s.hidden)

function fractionRegistry(ids: Iterable<FractionId>) {
  return Object.fromEntries(
    sortFractions([...new Set(ids)]).map((id) => {
      const { name, short, color, icon } = FRACTIONS[id]
      return [id, { name, short, color, icon }]
    }),
  )
}

function scheduleBody(schedule: Schedule, today: string) {
  const events = upcoming(schedule, today).map((e) => ({
    date: e.date,
    fractions: e.fractions,
    estimated: e.estimated ?? false,
    deviation: e.deviation ? { originalDate: e.deviation.originalDate ?? null, reason: e.deviation.reason } : null,
    warning: e.warning ?? null,
    labels: e.labels ?? {},
  }))
  const bins = schedule.bins.map((b) => ({
    fraction: b.fraction,
    sizeLiters: b.sizeLiters ?? null,
    pickupsPerYear: b.pickupsPerYear ?? null,
    frequencyText: b.frequencyText ?? null,
  }))
  const next = nextPerFraction(schedule, today).map((n) => ({
    fraction: n.fraction,
    name: FRACTIONS[n.fraction].name,
    color: FRACTIONS[n.fraction].color,
    date: n.date,
    daysUntil: n.daysUntil,
    isToday: n.daysUntil === 0,
    isTomorrow: n.daysUntil === 1,
    estimated: n.estimated,
    warning: n.warning,
    text: n.text,
  }))
  const used = [...events.flatMap((e) => e.fractions), ...bins.map((b) => b.fraction)]
  return { next, summary: pickupSummary(schedule, today), events, bins, fractions: fractionRegistry(used) }
}

/** GET /api/v1/adress?source=uppsala&id=storgatan-2_uppsala-4004688 (via rewrite från /api/v1/adress/<källa>/<id>) */
export const handleV1Address: V1Handler = async (request, opts = {}) => {
  const url = new URL(request.url)
  const sourceId = url.searchParams.get('source')
  const raw = url.searchParams.get('id')
  const id = raw && decodeId(raw)
  if (!sourceId || !id) return v1Error(400, 'bad_request', 'Källa och adress-id krävs')
  const source = visibleSources(opts).find((s) => s.id === sourceId)
  if (!source) return v1Error(404, 'not_found', 'Källan finns inte')

  const r = await lookupAddress(source, id, url.origin, opts)
  if (r.status === 404) return v1Error(404, 'not_found', 'Adressen finns inte hos källan')
  if (r.status === 502) return v1Error(502, 'source_unavailable', 'Källan svarar inte just nu')

  const now = opts.now ?? new Date()
  const today = todayInStockholm(now)
  const { address, schedule } = r
  const path = `${source.id}/${encodeURIComponent(address.id)}`
  return v1Json(
    {
      today,
      address: {
        id: address.id,
        street: address.street,
        locality: address.locality,
        kommun: address.kommun,
        source: address.sourceId,
        detail: address.detail ?? null,
      },
      ...scheduleBody(schedule, today),
      links: { ics: `${url.origin}/ics/${path}.ics`, web: `${url.origin}/${path}` },
      updatedAt: schedule.updatedAt,
    },
    200,
    addressCacheControl(now),
  )
}

const SEARCH_LIMIT = 10

const v1Address = (a: Address, origin: string) => ({
  id: a.id,
  street: a.street,
  locality: a.locality,
  kommun: a.kommun,
  source: a.sourceId,
  detail: a.detail ?? null,
  url: `${origin}/api/v1/adress/${a.sourceId}/${encodeURIComponent(a.id)}`,
})

/** Statiska källor söks lokalt i sin adressfil. */
async function searchStatic(source: Source, query: string, origin: string, opts: HandlerOptions): Promise<Address[]> {
  const index = await siteJson<AddressIndexFile>(origin, `/data/${source.id}/addresses.json`, opts.fetchFn, opts.timeoutMs)
  if (!index) throw new Error(`${source.id} saknar adressfil`)
  const kommun = source.kommuner[0]?.name ?? source.name
  const addresses = index.addresses.map(([id, street, locality]) => ({ id, street, locality, sourceId: source.id, kommun }))
  return searchAddresses(query, addresses, SEARCH_LIMIT)
}

/** Gatuindexet hjälper till att välja källor. Når vi det inte frågar vi som om gatan saknades. */
async function streetShard(q: string, origin: string, opts: HandlerOptions): Promise<StreetShard | null> {
  try {
    return await siteJson<StreetShard>(origin, `/data/gator/${shardKey(q)}.json`, opts.fetchFn, opts.timeoutMs)
  } catch {
    return null
  }
}

/** GET /api/v1/sok?q=storgatan 2[&kalla=uppsala] */
export const handleV1Search: V1Handler = async (request, opts = {}) => {
  const url = new URL(request.url)
  const q = url.searchParams.get('q') ?? ''
  if (normalize(q).length < 3) return v1Error(400, 'bad_request', 'Minst tre tecken')

  const visible = visibleSources(opts)
  const kalla = url.searchParams.get('kalla')
  let sources: Source[]
  if (kalla) {
    const only = visible.find((s) => s.id === kalla)
    if (!only) return v1Error(404, 'not_found', 'Källan finns inte')
    sources = [only]
  } else {
    const live = visible.filter((s) => s.config.system === 'edp')
    const shard = await streetShard(q, url.origin, opts)
    const picked = pickLiveSources(shard, q, live.map((s) => s.id), false)
    sources = [...live.filter((s) => picked.includes(s.id)), ...visible.filter((s) => s.config.system !== 'edp')]
  }

  // Orttabellen behövs bara när en live-källa täcker flera kommuner.
  const places =
    opts.places ?? (sources.some((s) => s.config.system === 'edp' && s.kommuner.length > 1) ? await loadServerPlaces(url.origin, opts.fetchFn) : undefined)
  const results = await Promise.allSettled(
    sources.map(async (s) =>
      s.config.system === 'edp'
        ? withDetails(await edpSearch(s.config.baseUrl, q, opts.fetchFn, opts.timeoutMs ?? 3000))
            .slice(0, SEARCH_LIMIT)
            .map(([b, detail]) => toAddress(s, b, places, detail))
        : await searchStatic(s, q, url.origin, opts),
    ),
  )
  const failed = sources.filter((_, i) => results[i].status === 'rejected').map((s) => s.id)
  const addresses = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).map((a) => v1Address(a, url.origin))
  return v1Json({ addresses, failed }, 200, failed.length > 0 ? CACHE_PARTIAL : CACHE_SEARCH)
}

/** GET /api/v1/kallor */
export const handleV1Sources: V1Handler = async (_request, opts = {}) =>
  v1Json(
    {
      sources: visibleSources(opts).map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        kommuner: s.kommuner,
        testData: s.testData ?? false,
      })),
      fractions: fractionRegistry(Object.keys(FRACTIONS) as FractionId[]),
    },
    200,
    CACHE_SOURCES,
  )

/** Allt annat under /api/v1/ */
export const handleV1NotFound: V1Handler = async () => v1Error(404, 'not_found', 'Okänd sökväg i API:t')
