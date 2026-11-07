// Gatuindex från OpenStreetMap: vilka källor en gata kan finnas hos, och vilken kommun en ort
// ligger i. Byggs av scripts/build-data.ts från data/osm/<kommunkod>.json.

import { normalize } from '../domain/search.js'
import { kommunerNamed, type PlaceLookup } from './sweden-places.js'
import { needsPlaces, placeKommuner, type Kommun, type Source } from '../sources/index.js'

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
    }
    if (needsPlaces(source)) places[source.id] = { ...placeTable(osm, placeKommuner(source)), ...postortTable(source) }
  }

  for (const shard of Object.values(shards)) for (const ids of Object.values(shard)) ids.sort()
  return { shards, places }
}

/** "Borgholms kommun" → "borgholm": centralorten heter som kommunen, ibland utan genitiv-s. */
function isCentralort(place: string, kommun: Kommun): boolean {
  const base = normalize(kommun.name.replace(/ kommun$/, ''), false)
  return place === base || `${place}s` === base
}

/**
 * Normaliserad ort → kommun. Samma ortnamn i två kommuner är tvetydigt och utelämnas, utom när
 * det är centralorten i den ena (Sävsjö är både en stad och en by i Kalmar kommun).
 */
function placeTable(osm: OsmKommun[], kommuner: Kommun[]): Record<string, string> {
  const table = new Map<string, string | null>()
  const central = new Set<string>()
  for (const kommun of kommuner) {
    for (const place of osm.find((o) => o.code === kommun.code)?.places ?? []) {
      const key = normalize(place, false)
      if (central.has(key)) continue
      if (isCentralort(key, kommun)) {
        central.add(key)
        table.set(key, kommun.name)
      } else {
        table.set(key, table.has(key) && table.get(key) !== kommun.name ? null : kommun.name)
      }
    }
  }
  return Object.fromEntries([...table].filter((e): e is [string, string] => e[1] !== null))
}

/** Källans egna postorter (Source.postorter). En kommunkod som källan inte har är ett skrivfel. */
function postortTable(source: Source): Record<string, string> {
  const kommuner = placeKommuner(source)
  return Object.fromEntries(
    Object.entries(source.postorter ?? {}).map(([ort, code]) => {
      const kommun = kommuner.find((k) => k.code === code)
      if (!kommun) throw new Error(`Postorten ${ort} hos ${source.id} pekar på ${code}, som inte är källans kommun`)
      return [normalize(ort, false), kommun.name]
    }),
  )
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

/**
 * Live-källor att fråga: de som gatuindexet pekar ut. Saknas gatan i indexet frågas alla källor,
 * men bara när frågan har ett husnummer eller användaren tryckt Enter. Det är den dyraste
 * sökningen, och utan nummer är det oftast ett halvskrivet eller felstavat namn.
 */
export function pickLiveSources(shard: StreetShard | null, query: string, live: string[], submitted: boolean): string[] {
  const candidates = shard ? candidateSources(shard, query).filter((id) => live.includes(id)) : []
  if (candidates.length > 0) return candidates
  return submitted || /\d/.test(query) ? live : []
}

/**
 * Källorna som täcker en plats, så att frågan slipper gå till resten av landet. Ett kommunnamn
 * betyder kommunen, även om en by på annat håll heter likadant. Annars söks platsen exakt i Sveriges
 * orter, källornas orter och gatuindexet (`placeShard`, platsens delfil). Finns den inte används
 * början av ortnamnen, men inte gatorna i indexet. Null när platsen är okänd: då får den inte
 * begränsa något. En tom lista betyder att platsen är känd men att ingen av källorna täcker den.
 */
export function sourcesAtPlace(
  place: string,
  placeShard: StreetShard | null,
  lookup: PlaceLookup | null,
  orter: Record<string, Record<string, string>>,
  sources: Source[],
): string[] | null {
  const key = normalize(place, false)
  if (key.length < 2 || !lookup) return null
  const covering = (codes: string[]) => sources.filter((s) => placeKommuner(s).some((k) => codes.includes(k.code))).map((s) => s.id)
  const inOrter = (match: (name: string) => boolean) =>
    sources.filter((s) => Object.keys(orter[s.id] ?? {}).some(match)).map((s) => s.id)
  const known = (ids: string[]) => ids.filter((id) => sources.some((s) => s.id === id))

  const atKommun = covering(kommunerNamed(lookup, key))
  if (atKommun.length > 0) return atKommun.sort()

  const exactCodes = lookup.orter[key]
  const exactOrter = inOrter((name) => name === key)
  const exactShard = placeShard?.[key]
  if (exactCodes || exactOrter.length > 0 || exactShard) {
    return [...new Set([...covering(exactCodes ?? []), ...exactOrter, ...known(exactShard ?? [])])].sort()
  }
  const prefixCodes = Object.keys(lookup.orter).filter((name) => name.startsWith(key)).flatMap((name) => lookup.orter[name])
  const prefixOrter = inOrter((name) => name.startsWith(key))
  if (prefixCodes.length === 0 && prefixOrter.length === 0) return null
  return [...new Set([...covering(prefixCodes), ...prefixOrter])].sort()
}

/** Frågan uppdelad: gatan som källorna söker på och platsen (ort eller kommun) som träffarna filtreras på. */
export interface QueryParts {
  street: string
  place: string
}

/**
 * "Storgatan 1 Uppsala" → gatan "storgatan 1" och platsen "uppsala". Källorna jämför bara början
 * av adressen, så en plats efter gatan ger annars inga träffar. Platsen står efter ett kommatecken,
 * efter husnumret (och en ensam husbokstav), eller utan nummer efter den längsta början som är ett
 * känt gatunamn. Utan gatuindex gissas ingen plats utan nummer.
 */
export function splitPlace(shard: StreetShard | null, query: string): QueryParts {
  const clean = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim()
  const comma = query.indexOf(',')
  if (comma >= 0) return { street: clean(query.slice(0, comma)), place: clean(query.slice(comma + 1)) }

  const words = clean(query).split(' ')
  const split = (end: number) => ({ street: words.slice(0, end).join(' '), place: words.slice(end).join(' ') })
  const number = words.findIndex((w) => /^\d/.test(w))
  if (number > 0) return split(/^\p{L}$/u.test(words[number + 1] ?? '') ? number + 2 : number + 1)

  const keys = shard ? Object.keys(shard) : []
  for (let end = words.length; end > 0; end--) {
    const prefix = normalize(words.slice(0, end).join(' '), false)
    if (keys.some((k) => k.startsWith(prefix))) return split(end)
  }
  return split(words.length)
}

/** Om adressen ligger på platsen: början av orten eller kommunen. Utan plats matchar allt. */
export function matchesPlace(a: { locality: string; kommun: string }, place: string): boolean {
  const p = normalize(place, false)
  return !p || [a.locality, a.kommun].some((name) => normalize(name, false).startsWith(p))
}

/** Om platsen är källans kommun, eller en ort eller gata hos källan enligt platsens delfil. */
export function namesSource(place: string, placeShard: StreetShard | null, source: Source): boolean {
  const key = normalize(place, false)
  if (key === '') return false
  return (
    placeKommuner(source).some((k) => normalize(k.name.replace(/ kommun$/, ''), false) === key) ||
    (placeShard?.[key]?.includes(source.id) ?? false)
  )
}

/**
 * Gatudelen när frågan nämner källans kommun eller en ort i den: "Stallgatan 5, Avesta" → "stallgatan 5".
 * Undefined när frågan inte nämner någon plats eller nämner en annan. Gator som saknas i indexet
 * delar `splitPlace` inte, så utan plats prövas sista ordet: "Storbogatan Avesta".
 */
export async function streetAtSourcePlace(
  query: string,
  source: Source,
  loadShard: (key: string) => Promise<StreetShard | null>,
): Promise<string | undefined> {
  if (normalize(query).length < 2) return undefined
  const parts = splitPlace(await loadShard(shardKey(query)), query)
  const words = parts.street.split(' ')
  const { street, place } = parts.place ? parts : { street: words.slice(0, -1).join(' '), place: words.at(-1) ?? '' }
  if (!street || !place) return undefined
  return namesSource(place, await loadShard(shardKey(place)), source) ? street : undefined
}

/**
 * Om frågans gata (utan husnummer) finns hos källan, exakt och inte bara som början av ett namn.
 * Delfilen har både gator och orter, så en fråga som bara är en ort räknas också.
 */
export function isKnownStreet(shard: StreetShard | null, query: string, sourceId: string): boolean {
  if (!shard) return false
  const has = (name: string) => shard[name]?.includes(sourceId) ?? false
  if (has(normalize(query, false))) return true
  const words = normalize(splitPlace(shard, query).street, false).split(' ')
  const number = words.findIndex((w) => /^\d/.test(w))
  const street = (number > 0 ? words.slice(0, number) : words).join(' ')
  return has(street)
}
