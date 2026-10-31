// Gatuindex från OpenStreetMap: vilka källor en gata kan finnas hos, och vilken kommun en ort
// ligger i. Byggs av scripts/build-data.ts från data/osm/<kommunkod>.json.

import { normalize } from '../domain/search.js'
import type { Source } from '../sources/index.js'

/** Gatunamn och ortnamn för en kommun, hämtade från OpenStreetMap. */
export interface OsmKommun {
  code: string
  streets: string[]
  places: string[]
}

/** normaliserat gatu- eller ortnamn → källornas id */
export type StreetShard = Record<string, string[]>

export interface StreetIndex {
  shards: Record<string, StreetShard>
  /** källa → normaliserad ort → kommunnamn (bara källor med flera kommuner) */
  places: Record<string, Record<string, string>>
}

/** Delfilens nyckel: de två första tecknen i det normaliserade namnet. */
export function shardKey(text: string): string {
  return normalize(text, false).slice(0, 2)
}

export function buildStreetIndex(osm: OsmKommun[], sources: Source[]): StreetIndex {
  const shards: Record<string, StreetShard> = {}
  const places: StreetIndex['places'] = {}

  for (const source of sources) {
    const placeKommun = new Map<string, string | null>()
    for (const kommun of source.kommuner) {
      const data = osm.find((o) => o.code === kommun.code)
      if (!data) continue
      // Orterna också: på landsbygden börjar adressen ofta med byn ("Funbo 113", "Vänge Väsby 50").
      for (const street of [...data.streets, ...data.places]) {
        const key = normalize(street, false)
        if (key.length < 2) continue
        const shard = (shards[shardKey(key)] ??= {})
        const ids = (shard[key] ??= [])
        if (!ids.includes(source.id)) ids.push(source.id)
      }
      for (const place of data.places) {
        const key = normalize(place, false)
        // Samma ort i två av källans kommuner är tvetydig och utelämnas.
        placeKommun.set(key, placeKommun.has(key) && placeKommun.get(key) !== kommun.name ? null : kommun.name)
      }
    }
    if (source.kommuner.length > 1) {
      places[source.id] = Object.fromEntries([...placeKommun].filter((e): e is [string, string] => e[1] !== null))
    }
  }

  for (const shard of Object.values(shards)) for (const ids of Object.values(shard)) ids.sort()
  return { shards, places }
}

/**
 * Källorna som kan ha gatan i sökningen. Gatan är orden före husnumret eller kommatecknet.
 * Den längsta början av orden som matchar något gatunamn används, så att "kungsgatan enköping"
 * hittar Kungsgatan.
 */
export function candidateSources(shard: StreetShard, query: string): string[] {
  const words = normalize(query.split(',')[0], false).split(' ')
  const firstNumber = words.findIndex((w) => /^\d/.test(w))
  const streetWords = firstNumber > 0 ? words.slice(0, firstNumber) : words
  const keys = Object.keys(shard)
  for (let n = streetWords.length; n > 0; n--) {
    const prefix = streetWords.slice(0, n).join(' ')
    if (prefix.length < 2) break
    const hits = keys.filter((k) => k.startsWith(prefix))
    if (hits.length > 0) return [...new Set(hits.flatMap((k) => shard[k]))].sort()
  }
  return []
}
