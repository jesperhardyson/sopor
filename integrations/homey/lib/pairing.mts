// Adressökningen i parningen: ett fält, "gata husnummer" och gärna ", ort".
// Orten filtreras här och inte i API:t, eftersom källorna tolkar ort i frågan olika.

import type { SoporSearch, SoporSearchHit } from './api.mjs'

/** Fler träffar än så visas som en lista med orter att välja bland först. */
export const MAX_LIST = 12

export type SearchResult = 'found' | 'places' | 'failed' | 'none'

export interface Place {
  /** "<ort>|<kommun>" */
  key: string
  label: string
  count: number
}

export function parseQuery(input: string): { q: string; place: string } {
  const [q, ...rest] = input.split(',')
  return { q: q.trim(), place: rest.join(',').trim() }
}

const words = (s: string) => s.toLocaleLowerCase('sv').split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** Varje ord i `place` ska vara början på ett ord i ortens eller kommunens namn. */
function inPlace(hit: SoporSearchHit, place: string): boolean {
  const haystack = words(`${hit.locality} ${hit.kommun}`)
  return words(place).every((w) => haystack.some((h) => h.startsWith(w)))
}

export function searchOutcome(search: SoporSearch, place: string): { result: SearchResult; hits: SoporSearchHit[] } {
  const hits = place ? search.addresses.filter((hit) => inPlace(hit, place)) : search.addresses
  if (hits.length > MAX_LIST) return { result: 'places', hits }
  if (hits.length) return { result: 'found', hits }
  return { result: search.failed.length ? 'failed' : 'none', hits }
}

export const placeKey = (hit: SoporSearchHit) => `${hit.locality}|${hit.kommun}`

/** Orterna bland träffarna, flest träffar först. */
export function places(hits: SoporSearchHit[]): Place[] {
  const byKey = new Map<string, Place>()
  for (const hit of hits) {
    const key = placeKey(hit)
    const place = byKey.get(key) ?? { key, label: hit.locality ? `${hit.locality}, ${hit.kommun}` : hit.kommun, count: 0 }
    place.count++
    byKey.set(key, place)
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'sv'))
}
