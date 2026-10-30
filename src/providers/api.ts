import type { Address, Schedule } from '@/domain/types'
import { kommunForLocality, type Source } from '@/sources'
import { loadPlaces } from './places'
import type { WasteProvider } from './types'

type Loaded = { address: Address; schedule: Schedule } | null

/**
 * Provider för live-källor (EDP m.fl.) via Sopors egna API-funktioner. Sökningen görs samlat för
 * flera källor i registry.searchAll; den här providern hämtar adress och schema för en adress.
 */
export function createApiProvider(source: Source, fetchFn: typeof fetch = (...args) => fetch(...args)): WasteProvider {
  const loaded = new Map<string, Promise<Loaded>>()

  function load(addressId: string): Promise<Loaded> {
    let promise = loaded.get(addressId)
    if (!promise) {
      promise = (async () => {
        const res = await fetchFn(`/api/schema?${new URLSearchParams({ source: source.id, id: addressId })}`)
        if (res.status === 404) return null
        if (!res.ok) throw new Error(`${source.name} svarar inte just nu (${res.status})`)
        const body = (await res.json()) as { address: Address; schedule: Schedule }
        const places = (await loadPlaces(fetchFn))[source.id]
        return { ...body, address: { ...body.address, kommun: kommunForLocality(source, body.address.locality, places) } }
      })()
      // Ett fel ska kunna försökas igen, så det cachas inte.
      promise.catch(() => loaded.delete(addressId))
      loaded.set(addressId, promise)
    }
    return promise
  }

  return {
    async searchAddresses(query, signal) {
      const res = await fetchFn(`/api/sok?${new URLSearchParams({ q: query, sources: source.id })}`, { signal })
      return res.ok ? ((await res.json()) as { addresses: Address[] }).addresses : []
    },
    async suggestAddresses() {
      return []
    },
    async getAddress(addressId) {
      return (await load(addressId))?.address ?? null
    },
    async getSchedule(addressId) {
      return (await load(addressId))?.schedule ?? null
    },
    async dataUpdatedAt() {
      return null
    },
    icsUrl(addressId) {
      return `/ics/${source.id}/${encodeURIComponent(addressId)}.ics`
    },
  }
}
