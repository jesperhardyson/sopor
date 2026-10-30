import type { AddressIndexFile, ScheduleFile } from '@/data/static-format'
import { mergeParts } from '@/domain/schedule'
import { searchAddresses, suggest } from '@/domain/search'
import type { Address } from '@/domain/types'
import type { Source } from '@/sources'
import type { WasteProvider } from './types'

interface LoadedIndex {
  updatedAt: string
  addresses: Address[]
  refs: Map<string, string[]>
}

/** Läser filerna som scripts/build-data.ts genererar till public/. */
export function createStaticProvider(source: Source, fetchFn: typeof fetch = (...args) => fetch(...args)): WasteProvider {
  const base = `/data/${source.id}`
  let indexPromise: Promise<LoadedIndex> | undefined

  async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const res = await fetchFn(url, { signal })
    if (!res.ok) throw new Error(`Kunde inte hämta ${url} (${res.status})`)
    return res.json() as Promise<T>
  }

  function loadIndex(): Promise<LoadedIndex> {
    // Indexet delas mellan anrop och avbryts därför inte av enskilda signaler.
    indexPromise ??= getJson<AddressIndexFile>(`${base}/addresses.json`).then(
      (file) => ({
        updatedAt: file.updatedAt,
        addresses: file.addresses.map(([id, street, locality]) => ({
          id,
          street,
          locality,
          sourceId: source.id,
          kommun: source.kommuner[0]?.name ?? source.name,
        })),
        refs: new Map(file.addresses.map(([id, , , refs]) => [id, refs])),
      }),
      (error: unknown) => {
        indexPromise = undefined
        throw error
      },
    )
    return indexPromise
  }

  return {
    async searchAddresses(query) {
      return searchAddresses(query, (await loadIndex()).addresses)
    },
    async suggestAddresses(query) {
      return suggest(query, (await loadIndex()).addresses)
    },
    async getAddress(addressId) {
      return (await loadIndex()).addresses.find((a) => a.id === addressId) ?? null
    },
    async getSchedule(addressId, signal) {
      const refs = (await loadIndex()).refs.get(addressId)
      if (!refs) return null
      const parts = await Promise.all(
        refs.map((ref) => getJson<ScheduleFile>(`${base}/schedules/${encodeURIComponent(ref)}.json`, signal)),
      )
      return mergeParts(parts)
    },
    async dataUpdatedAt() {
      return (await loadIndex()).updatedAt || null
    },
    icsUrl(addressId) {
      return `/ics/${source.id}/${encodeURIComponent(addressId)}.ics`
    },
  }
}
