// Kommunvalet i parningen. Valet blir `kalla` i sökningen, så att träffarna blir få.

import type { SoporSearch, SoporSearchHit, SoporSource } from './api.mjs'

/** API:t ger högst så många träffar per källa. */
const MAX_PER_SOURCE = 10

export interface KommunChoice {
  /** "<källa>|<kommunnamn>" */
  key: string
  name: string
}

export function kommunChoices(sources: SoporSource[]): KommunChoice[] {
  return sources
    .flatMap((source) => source.kommuner.map((kommun) => ({ key: `${source.id}|${kommun.name}`, name: kommun.name })))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
}

export function parseKommun(key: string): { source: string; kommun: string } | null {
  const [source, kommun] = key.split('|')
  return source && kommun ? { source, kommun } : null
}

export type SearchResult = 'found' | 'tooMany' | 'failed' | 'none'

/**
 * En källa kan täcka flera kommuner, så träffarna filtreras på den valda.
 * Fyllde källan sina tio träffar med andra kommuner kan adressen ändå finnas: då behövs husnummer.
 */
export function searchOutcome(search: SoporSearch, kommun: string): { result: SearchResult; hits: SoporSearchHit[] } {
  const hits = search.addresses.filter((hit) => hit.kommun === kommun)
  if (hits.length) return { result: 'found', hits }
  if (search.addresses.length >= MAX_PER_SOURCE) return { result: 'tooMany', hits }
  return { result: search.failed.length ? 'failed' : 'none', hits }
}
