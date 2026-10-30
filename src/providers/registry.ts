import type { Address } from '@/domain/types'
import { getSource, SOURCES, type Source } from '@/sources'
import { candidateSources, shardKey, type StreetShard } from '@/data/street-index'
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

/** Live-källor att fråga: de som gatuindexet pekar ut, eller alla om gatan saknas i indexet. */
async function liveSourcesFor(query: string): Promise<string[]> {
  const live = SOURCES.filter((s) => s.config.system !== 'static').map((s) => s.id)
  if (live.length === 0 || normalize(query).length < 3) return []
  const shard = await loadShard(shardKey(query))
  const candidates = shard ? candidateSources(shard, query).filter((id) => live.includes(id)) : []
  return candidates.length > 0 ? candidates : live
}

async function searchLive(query: string, signal?: AbortSignal): Promise<SearchResult> {
  const sources = await liveSourcesFor(query)
  if (sources.length === 0) return { addresses: [], failed: [] }
  try {
    const res = await fetch(`/api/sok?${new URLSearchParams({ q: query, sources: sources.join(',') })}`, { signal })
    if (!res.ok) return { addresses: [], failed: sources }
    const body = (await res.json()) as SearchResult
    const places = await loadPlaces()
    const addresses = body.addresses.map((a) => {
      const source = getSource(a.sourceId)
      return source ? { ...a, kommun: kommunForLocality(source, a.locality, places[source.id]) } : a
    })
    return { addresses, failed: body.failed }
  } catch {
    if (signal?.aborted) throw new DOMException('Avbruten', 'AbortError')
    return { addresses: [], failed: sources }
  }
}

/** Sök i alla källor: statiska lokalt, live-källor via /api/sok. */
export async function searchAll(query: string, signal?: AbortSignal): Promise<SearchResult> {
  const local = SOURCES.filter((m) => m.config.system === 'static')
  const [localResults, live] = await Promise.all([
    Promise.allSettled(local.map((m) => providerFor(m).searchAddresses(query, signal))),
    searchLive(query, signal),
  ])
  const localAddresses = localResults.some((r) => r.status === 'fulfilled') ? mergeResults(localResults, 8) : []
  return { addresses: [...localAddresses, ...live.addresses].slice(0, 12), failed: live.failed }
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
