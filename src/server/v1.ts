// Det publika, versionerade API:t (/api/v1/…). Formaterar svaren; källogiken ligger i lookup.ts.
// Kontraktet: fält tas aldrig bort eller byter namn, och fält utan värde skickas som null.

import { areaDetail, areasForDate } from '../domain/areas.js'
import { isValidDate, secondsToStockholmMidnight, todayInStockholm } from '../domain/dates.js'
import { FRACTIONS, sortFractions } from '../domain/fractions.js'
import { nextPerFraction, pickupSummary } from '../domain/next.js'
import { upcoming } from '../domain/schedule.js'
import { mergeHits, normalize, rankHits, searchAddresses } from '../domain/search.js'
import type { Address, Area, FractionId, Schedule } from '../domain/types.js'
import { namesSource, pickLiveSources, shardKey, sourcesAtPlace, splitPlace, streetAtSourcePlace, type StreetShard } from '../data/street-index.js'
import type { PlaceLookup } from '../data/sweden-places.js'
import type { AddressIndexFile, AreasIndexFile } from '../data/static-format.js'
import { areaNoticeText, isLive, needsPlaces, SOURCES, type Source, type SourceContact } from '../sources/index.js'
import { CACHE_PARTIAL, CACHE_SEARCH, decodeId, searchLiveSource, type HandlerOptions } from './handlers.js'
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
    } catch (e) {
      console.error('Oväntat fel i API v1', e)
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
        ...selectionFields(source),
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

const selectionFields = (source: Source | undefined) => ({
  selection: source?.selection ?? 'address',
  notice: areaNoticeText(source) ?? null,
})

const v1Address = (a: Address, origin: string, sources: Source[]) => {
  const source = sources.find((s) => s.id === a.sourceId)
  return {
    id: a.id,
    street: a.street,
    locality: a.locality,
    kommun: a.kommun,
    source: a.sourceId,
    detail: a.detail ?? null,
    ...selectionFields(source),
    // Sajtens sida med alla platser i områdena och vem man kan fråga
    areasUrl: source?.selection === 'area' ? `${origin}/${a.sourceId}/omraden` : null,
    url: `${origin}/api/v1/adress/${a.sourceId}/${encodeURIComponent(a.id)}`,
  }
}

/** Statiska källor söks lokalt i sin adressfil. */
async function searchStatic(source: Source, query: string, origin: string, opts: HandlerOptions, areaPrefix: boolean): Promise<Address[]> {
  const index = await siteJson<AddressIndexFile>(origin, `/data/${source.id}/addresses.json`, opts.fetchFn, opts.timeoutMs)
  if (!index) throw new Error(`${source.id} saknar adressfil`)
  const kommun = source.kommuner[0]?.name ?? source.name
  const addresses = index.addresses.map(([id, street, locality, , area]) => ({
    id,
    street,
    locality,
    sourceId: source.id,
    kommun,
    ...(area && { detail: area.detail, searchTerms: area.searchTerms }),
  }))
  const find = (q: string) => searchAddresses(q, addresses, SEARCH_LIMIT, { areaPrefix })
  const hits = find(query)
  if (source.selection !== 'area') return hits
  // Nämner frågan källans plats söks områdena också på gatudelen, som i registret på sajten.
  const street = await streetAtSourcePlace(query, source, (key) => streetShard(key, origin, opts))
  return street ? mergeHits(hits, find(street)).slice(0, SEARCH_LIMIT) : hits
}

/** Gatuindexet hjälper till att välja källor. Når vi det inte frågar vi som om gatan saknades. */
async function streetShard(q: string, origin: string, opts: HandlerOptions): Promise<StreetShard | null> {
  try {
    return await siteJson<StreetShard>(origin, `/data/gator/${shardKey(q)}.json`, opts.fetchFn, opts.timeoutMs)
  } catch {
    return null
  }
}

/** Källorna som täcker platsen i frågan, null när platsen är okänd. Saknas filerna frågas som vanligt. */
async function sourcesForPlace(place: string, live: Source[], origin: string, opts: HandlerOptions): Promise<string[] | null> {
  const [lookup, placeShard, orter] = await Promise.all([
    siteJson<PlaceLookup>(origin, '/data/sverige.json', opts.fetchFn, opts.timeoutMs).catch(() => null),
    streetShard(place, origin, opts),
    opts.places ?? loadServerPlaces(origin, opts.fetchFn),
  ])
  return sourcesAtPlace(place, placeShard, lookup, orter, live)
}

/** En långsam källa får inte hålla tillbaka svaret. Den hamnar i `failed`. */
const SEARCH_DEADLINE_MS = 2000

function withDeadline<T>(work: Promise<T>, ms: number | undefined): Promise<T> {
  if (ms === undefined) return work
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Källan hann inte svara')), ms)
  })
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer))
}

/** GET /api/v1/sok?q=storgatan 2[&kalla=uppsala] */
export const handleV1Search: V1Handler = async (request, opts = {}) => {
  const url = new URL(request.url)
  const q = url.searchParams.get('q') ?? ''
  if (normalize(q).length < 3) return v1Error(400, 'bad_request', 'Minst tre tecken')

  const visible = visibleSources(opts)
  const kalla = url.searchParams.get('kalla')
  let sources: Source[]
  /** Källor som frågas först när de utpekade saknar adressen: postorter kan korsa kommungränser. */
  let others: Source[] = []
  let pointedOut = !!kalla
  // Källorna söker bara på gatan; orten eller kommunen efter den filtreras här.
  let parts = splitPlace(null, q)
  if (kalla) {
    const only = visible.find((s) => s.id === kalla)
    if (!only) return v1Error(404, 'not_found', 'Källan finns inte')
    sources = [only]
  } else {
    const live = visible.filter(isLive)
    const shard = await streetShard(q, url.origin, opts)
    parts = splitPlace(shard, q)
    const picked = pickLiveSources(shard, q, live.map((s) => s.id), false)
    const atPlace = parts.place ? await sourcesForPlace(parts.place, live, url.origin, opts) : null
    const first = atPlace ?? picked
    pointedOut = atPlace !== null
    sources = [...live.filter((s) => first.includes(s.id)), ...visible.filter((s) => !isLive(s))]
    others = live.filter((s) => picked.includes(s.id) && !first.includes(s.id))
  }
  const { street, place } = parts

  const places =
    opts.places ?? ([...sources, ...others].some((s) => isLive(s) && needsPlaces(s)) ? await loadServerPlaces(url.origin, opts.fetchFn) : undefined)
  const deadlineMs = opts.searchDeadlineMs ?? SEARCH_DEADLINE_MS
  const ask = (list: Source[], ms?: number) =>
    Promise.allSettled(
      list.map((s) =>
        withDeadline(
          (async () => (isLive(s) ? (await searchLiveSource(s, street, place, { ...opts, places })).slice(0, SEARCH_LIMIT) : await searchStatic(s, q, url.origin, opts, !!kalla)))(),
          ms,
        ),
      ),
    )
  const hits = (settled: PromiseSettledResult<Address[]>[]) => settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))

  const results = await ask(sources, pointedOut ? undefined : deadlineMs)
  const failed = sources.filter((_, i) => results[i].status === 'rejected').map((s) => s.id)
  let found = hits(results)
  let complete = failed.length === 0
  if (found.length === 0 && complete && others.length > 0) {
    // Det ovanliga fallet, och här väntar nästan alltid en fråga som saknar träff: kortare tid.
    const more = await ask(others, deadlineMs / 2)
    found = hits(more)
    complete = more.every((r) => r.status === 'fulfilled')
  }
  const addresses = rankHits(street, place, found).map((a) => v1Address(a, url.origin, visible))
  return v1Json({ addresses, failed }, 200, complete ? CACHE_SEARCH : CACHE_PARTIAL)
}

/**
 * GET /api/v1/omraden?plats=avesta[&tomning=2026-10-27]: områdena hos källor med områdesval som täcker platsen.
 * Med tomning bara områden med hämtning det datumet. Ingen gissning om adressen: datumet kommer från användaren.
 */
export const handleV1Areas: V1Handler = async (request, opts = {}) => {
  const url = new URL(request.url)
  const place = (url.searchParams.get('plats') ?? '').trim().replace(/\s+kommun$/i, '')
  if (normalize(place).length < 2) return v1Error(400, 'bad_request', 'Minst två tecken')

  const now = opts.now ?? new Date()
  const tomning = url.searchParams.get('tomning')
  if (tomning !== null && !isValidDate(tomning)) return v1Error(400, 'bad_request', 'Ogiltigt datum, använd formen ÅÅÅÅ-MM-DD')
  if (tomning !== null && tomning > todayInStockholm(now)) return v1Error(400, 'bad_request', 'Datumet har inte varit än')

  const shard = await streetShard(place, url.origin, opts)
  const sources = visibleSources(opts).filter((s) => s.selection === 'area' && namesSource(place, shard, s))
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const index = await siteJson<AreasIndexFile>(url.origin, `/data/${source.id}/omraden.json`, opts.fetchFn, opts.timeoutMs)
      if (!index) throw new Error(`${source.id} saknar områdesfil`)
      const kommun = source.kommuner[0]?.name ?? source.name
      const toAddress = (area: Area): Address => ({ id: area.id, street: area.name, locality: '', sourceId: source.id, kommun, detail: areaDetail(area) })
      if (tomning === null) return { hits: index.areas.map((area) => ({ address: toAddress(area) })), covered: null }
      const result = areasForDate(tomning, index.areas)
      const matches = result.kind === 'found' ? result.matches : []
      return {
        hits: matches.map(({ area, previous, next }) => ({ address: toAddress(area), pickups: { previous, next } })),
        covered: result.kind !== 'outside',
      }
    }),
  )
  const failed = sources.filter((_, i) => results[i].status === 'rejected').map((s) => s.id)
  const answered = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  const addresses = answered.flatMap((r) => r.hits).map(({ address, ...rest }) => ({ ...v1Address(address, url.origin, sources), ...rest }))
  if (tomning === null) return v1Json({ addresses, failed }, 200, failed.length > 0 ? CACHE_PARTIAL : CACHE_SEARCH)

  // true räcker med en källa. Annars vet vi bara att datumet ligger utanför om alla källor svarade, och minst en fanns.
  const dateCovered = answered.some((r) => r.covered) ? true : failed.length > 0 || answered.length === 0 ? null : false
  return v1Json({ addresses, failed, dateCovered }, 200, failed.length > 0 ? CACHE_PARTIAL : addressCacheControl(now))
}

const v1Contact = (c: SourceContact) => ({
  phone: c.phone ?? null,
  email: c.email ?? null,
  page: c.page ?? null,
  checkedAt: c.checked.date,
  checkedUrl: c.checked.url,
})

/** GET /api/v1/kallor */
export const handleV1Sources: V1Handler = async (_request, opts = {}) =>
  v1Json(
    {
      sources: visibleSources(opts).map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        kommuner: s.kommuner.map((k) => ({ code: k.code, name: k.name })),
        testData: s.testData ?? false,
        contact: s.contact ? v1Contact(s.contact) : null,
      })),
      fractions: fractionRegistry(Object.keys(FRACTIONS) as FractionId[]),
    },
    200,
    CACHE_SOURCES,
  )

/** Allt annat under /api/v1/ */
export const handleV1NotFound: V1Handler = async () => v1Error(404, 'not_found', 'Okänd sökväg i API:t')
