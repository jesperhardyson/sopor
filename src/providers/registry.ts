import type { Address } from '@/domain/types'
import { getMunicipality, MUNICIPALITIES, type Municipality } from '@/municipalities'
import { createStaticProvider } from './static'
import type { WasteProvider } from './types'

const providers = new WeakMap<Municipality, WasteProvider>()

export function providerFor(m: Municipality): WasteProvider {
  let provider = providers.get(m)
  if (!provider) {
    switch (m.provider.type) {
      case 'static':
        provider = createStaticProvider(m)
        break
      case 'edp':
        throw new Error('EDP-provider ej implementerad')
    }
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

async function fromAll(fn: (p: WasteProvider) => Promise<Address[]>, limit: number): Promise<Address[]> {
  return mergeResults(await Promise.allSettled(MUNICIPALITIES.map((m) => fn(providerFor(m)))), limit)
}

export function searchAll(query: string, signal?: AbortSignal): Promise<Address[]> {
  return fromAll((p) => p.searchAddresses(query, signal), 8)
}

export function suggestAll(query: string, signal?: AbortSignal): Promise<Address[]> {
  return fromAll((p) => p.suggestAddresses(query, signal), 3)
}

export async function getAddress(municipalityId: string, addressId: string, signal?: AbortSignal): Promise<Address | null> {
  const m = getMunicipality(municipalityId)
  return m ? providerFor(m).getAddress(addressId, signal) : null
}
