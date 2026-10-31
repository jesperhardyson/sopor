// Det publika, versionerade API:t (/api/v1/…). Formaterar svaren; källogiken ligger i lookup.ts.
// Kontraktet: fält tas aldrig bort eller byter namn, och fält utan värde skickas som null.

import { secondsToStockholmMidnight, todayInStockholm } from '../domain/dates.js'
import { FRACTIONS, sortFractions } from '../domain/fractions.js'
import { nextPerFraction, pickupSummary } from '../domain/next.js'
import { upcoming } from '../domain/schedule.js'
import type { FractionId, Schedule } from '../domain/types.js'
import { SOURCES } from '../sources/index.js'
import { decodeId, type HandlerOptions } from './handlers.js'
import { lookupAddress } from './lookup.js'

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
