import type { Address } from '@/domain/types'
import { getSource, SOURCES, type Source } from '@/sources'
import { pickLiveSources, shardKey, type StreetShard } from '@/data/street-index'
import { normalize } from '@/domain/search'
import { kommunForLocality } from '@/sources'
import { createApiProvider } from './api'
import { loadPlaces } from './places'
import { createStaticProvider } from './static'
import type { WasteProvider } from './types'

const providers = new WeakMap<Source, WasteProvider>()

export function providerFor(m: Source): WasteProvider {
  let provider = providers.get(m)
  if (!provider) {
    provider = m.config.system === 'static' ? createStaticProvider(m) : createApiProvider(m)
    providers.set(m, provider)
  }
  return provider
}

/** Slår ihop svar från flera kommuner. En kommun som inte svarar får inte fälla de andra. */
export function mergeResults(results: PromiseSettledResult<Address[]>[], limit: number): Address[] {
  const ok = results.filter((r) => r.status === 'fulfilled')
  if (ok.length === 0 && results.length > 0) throw (results[0] as PromiseRejectedResult).reason
  return ok.flatMap((r) => r.value).slice(0, limit)
}

export interface SearchResult {
  addresses: Address[]
  /** Källor som inte svarade, t.ex. ["uppsala"] */
  failed: string[]
}

const shards = new Map<string, Promise<StreetShard | null>>()

function loadShard(key: string): Promise<StreetShard | null> {
  let shard = shards.get(key)
  if (!shard) {
    shard = fetch(`/data/gator/${encodeURIComponent(key)}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<StreetShard>) : null))
      .catch(() => null)
    shards.set(key, shard)
  }
  return shard
}

export interface SearchOptions {
  /** Användaren tryckte Enter: fråga alla källor även om gatan saknas i indexet. */
  submitted?: boolean
}

/** Live-källor att fråga för sökningen; valet görs av `pickLiveSources`. */
async function liveSourcesFor(query: string, { submitted = false }: SearchOptions): Promise<string[]> {
  const live = SOURCES.filter((s) => s.config.system !== 'static').map((s) => s.id)
  if (live.length === 0 || normalize(query).length < 3) return []
  const shard = await loadShard(shardKey(query))
  return pickLiveSources(shard, query, live, submitted)
}

/** EDP svarar med högst så här många adresser per källa. Färre betyder att svaret är komplett. */
const SOURCE_LIMIT = 10
/** Väntan innan servern frågas, utöver sökrutans debounce: halvskrivna ord ska inte kosta anrop. */
const NETWORK_DELAY_MS = 150
const CACHE_SIZE = 300

/** Som källorna jämför: gemener och enkla mellanslag. Källorna matchar början av adressen. */
const liveKey = (query: string) => query.toLowerCase().replace(/\s+/g, ' ').trim()

/** Svar per källa och fråga under sidans livstid. Källor som inte svarade sparas inte. */
const liveCache = new Map<string, Address[]>()

function remember(sourceId: string, query: string, addresses: Address[]) {
  if (liveCache.size >= CACHE_SIZE) liveCache.delete(liveCache.keys().next().value!)
  liveCache.set(`${sourceId}|${query}`, addresses)
}

/**
 * Svaret för en källa utan att fråga servern: samma fråga igen, eller en kortare fråga vars svar
 * var komplett. Den kortare frågans träffar innehåller då alla som den längre kan ge.
 */
function fromCache(sourceId: string, query: string): Address[] | null {
  const exact = liveCache.get(`${sourceId}|${query}`)
  if (exact) return exact
  for (let end = query.length - 1; end >= 3; end--) {
    const shorter = liveCache.get(`${sourceId}|${query.slice(0, end)}`)
    if (shorter && shorter.length < SOURCE_LIMIT) {
      return shorter.filter((a) => liveKey(`${a.street}, ${a.locality}`).startsWith(query))
    }
  }
  return null
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('Avbruten', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
  })
}

async function searchLive(query: string, signal: AbortSignal | undefined, options: SearchOptions): Promise<SearchResult> {
  const placesPromise = loadPlaces() // parallellt med sökningen
  const q = liveKey(query)
  const sources = await liveSourcesFor(q, options)
  const hits = sources.map((id) => ({ id, cached: fromCache(id, q) }))
  const cached = hits.flatMap((h) => h.cached ?? [])
  const missing = hits.filter((h) => !h.cached).map((h) => h.id)
  let fetched: Address[] = []
  let failed: string[] = []
  if (missing.length > 0) {
    await wait(NETWORK_DELAY_MS, signal)
    try {
      const res = await fetch(`/api/sok?${new URLSearchParams({ q, sources: missing.join(',') })}`, { signal })
      if (!res.ok) throw new Error(`/api/sok svarade ${res.status}`)
      const body = (await res.json()) as SearchResult
      fetched = body.addresses
      failed = body.failed
      for (const id of missing.filter((id) => !failed.includes(id))) {
        remember(id, q, fetched.filter((a) => a.sourceId === id))
      }
    } catch {
      if (signal?.aborted) throw new DOMException('Avbruten', 'AbortError')
      failed = missing
    }
  }
  const places = await placesPromise
  const addresses = [...cached, ...fetched].map((a) => {
    const source = getSource(a.sourceId)
    return source ? { ...a, kommun: kommunForLocality(source, a.locality, places[source.id]) } : a
  })
  return { addresses, failed }
}

/** Väcker sökfunktionen och laddar ort-tabellen i förväg, t.ex. när sökfältet får fokus. */
export function warmUpSearch(): void {
  void loadPlaces()
  if (SOURCES.some((s) => s.config.system !== 'static')) void fetch('/api/sok?q=').catch(() => {})
}

/**
 * Sök i alla källor: statiska lokalt, live-källor via /api/sok. De lokala träffarna lämnas direkt
 * via `onPartial`, så att användaren ser något medan live-källorna svarar.
 */
export async function searchAll(
  query: string,
  signal?: AbortSignal,
  onPartial?: (partial: SearchResult) => void,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const live = searchLive(query, signal, options)
  const local = SOURCES.filter((m) => m.config.system === 'static')
  const localResults = await Promise.allSettled(local.map((m) => providerFor(m).searchAddresses(query, signal)))
  const localAddresses = localResults.some((r) => r.status === 'fulfilled') ? mergeResults(localResults, 8) : []
  if (!signal?.aborted) onPartial?.({ addresses: localAddresses, failed: [] })
  const { addresses, failed } = await live
  return { addresses: [...localAddresses, ...addresses].slice(0, 12), failed }
}

/** Förslag för "Menade du:" (bara statiska källor har listan lokalt). */
export async function suggestAll(query: string, signal?: AbortSignal): Promise<Address[]> {
  const local = SOURCES.filter((m) => m.config.system === 'static')
  const results = await Promise.allSettled(local.map((m) => providerFor(m).suggestAddresses(query, signal)))
  return results.some((r) => r.status === 'fulfilled') ? mergeResults(results, 3) : []
}

export async function getAddress(sourceId: string, addressId: string, signal?: AbortSignal): Promise<Address | null> {
  const m = getSource(sourceId)
  return m ? providerFor(m).getAddress(addressId, signal) : null
}
