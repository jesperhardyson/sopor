import type { KommunPage } from '@/data/kommun-pages'
import type { Address } from '@/domain/types'
import { getSource, placeKommuner, SOURCES, supportedKommuner, type Kommun, type Source } from '@/sources'
import { isKnownStreet, matchesPlace, namesSource, pickLiveSources, shardKey, splitPlace, streetAtSourcePlace, type QueryParts, type StreetShard } from '@/data/street-index'
import { kommunerForPlace } from '@/data/sweden-places'
import { mergeHits, normalize } from '@/domain/search'
import { kommunForLocality } from '@/sources'
import { createApiProvider } from './api'
import { loadKommunPages, loadPlaces, loadSwedenPlaces } from './places'
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

/** Börjar hämta adressen och schemat innan sidan visas, t.ex. när fingret landar på en länk. */
export function prefetchAddress(sourceId: string, addressId: string): void {
  const source = getSource(sourceId)
  if (!source) return
  const provider = providerFor(source)
  provider.getAddress(addressId).catch(() => {})
  provider.getSchedule(addressId).catch(() => {})
}

/** Slår ihop svar från flera kommuner. En kommun som inte svarar får inte fälla de andra. */
export function mergeResults(results: PromiseSettledResult<Address[]>[], limit: number): Address[] {
  const ok = results.filter((r) => r.status === 'fulfilled')
  if (ok.length === 0 && results.length > 0) throw (results[0] as PromiseRejectedResult).reason
  return ok.flatMap((r) => r.value).slice(0, limit)
}

/** En källa där man väljer område i stället för adress, och om sökningen redan gav områdesträffar. */
export interface AreaPicker {
  sourceId: string
  kommun: string
  hasHits: boolean
}

export interface SearchResult {
  addresses: Address[]
  /** Källor som inte svarade, t.ex. ["uppsala"] */
  failed: string[]
  /** Källor med områdesval som sökningen ska erbjuda, t.ex. [{ sourceId: "avesta", … }] */
  areaPickers: AreaPicker[]
}

const shards = new Map<string, Promise<StreetShard | null>>()

/** Delfiler sparas under sidans livstid, också de som inte finns. Misslyckade hämtningar får ett nytt försök. */
function loadShard(key: string): Promise<StreetShard | null> {
  let shard = shards.get(key)
  if (!shard) {
    shard = fetch(`/data/gator/${encodeURIComponent(key)}.json`)
      .then((r) => {
        if (r.ok) return r.json() as Promise<StreetShard>
        if (r.status === 404) return null
        throw new Error(`Delfilen ${key} svarade ${r.status}`)
      })
      .catch(() => {
        shards.delete(key)
        return null
      })
    shards.set(key, shard)
  }
  return shard
}

export interface SearchOptions {
  /** Användaren tryckte Enter: fråga alla källor även om gatan saknas i indexet. */
  submitted?: boolean
  /** Sök bara hos kommunens källor och visa bara adresser i kommunen. */
  kommun?: Kommun
}

const coversKommun = (source: Source, kommun?: Kommun) => !kommun || placeKommuner(source).some((k) => k.code === kommun.code)

/** Bara adresser som säkert ligger i en annan kommun faller bort: en okänd ort kan ligga i den här. */
function mayBeInKommun(address: Address, kommun?: Kommun): boolean {
  if (!kommun || address.kommun === kommun.name) return true
  const source = getSource(address.sourceId)
  return !source || !placeKommuner(source).some((k) => k.name === address.kommun)
}

/** "Köpings kommun" → "köping". Källorna matchar början av orten, så "västerå" hittar Västerås. */
const mainPlace = (kommun: Kommun) => liveKey(kommun.name.replace(/ kommun$/, '').replace(/^Region /, '').replace(/s$/, ''))

/** Live-källor att fråga (valda av `pickLiveSources`), och frågan uppdelad i gata och plats. */
async function liveSourcesFor(query: string, { submitted = false, kommun }: SearchOptions): Promise<{ sources: string[] } & QueryParts> {
  const live = SOURCES.filter((s) => s.config.system !== 'static' && coversKommun(s, kommun)).map((s) => s.id)
  const none = { sources: [], street: query, place: '' }
  if (live.length === 0 || normalize(query).length < 2) return none
  // Delfilen hämtas redan vid två tecken, så att den finns när frågan blir lång nog att skickas.
  const shard = await loadShard(shardKey(query))
  const parts = splitPlace(shard, query)
  if (normalize(parts.street).length < 3) return none
  // Ingen källa har adresser i en kommun som Sopor saknar: svara direkt i stället för att fråga alla.
  if (parts.place && (await missingForPlace(parts.place)).length > 0) return { ...parts, sources: [] }
  return { sources: pickLiveSources(shard, query, live, submitted), ...parts }
}

/** EDP svarar med högst så här många adresser per källa. Färre betyder att svaret är komplett. */
const SOURCE_LIMIT = 10
/** Väntan innan servern frågas, utöver sökrutans debounce: halvskrivna ord ska inte kosta anrop. */
const NETWORK_DELAY_MS = 150
const CACHE_SIZE = 300
/** Så länge svaren samlas innan de visas. De flesta källor hinner svara; sena läggs till efteråt. */
const HOLD_MS = 400

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

async function askSource(id: string, q: string, signal?: AbortSignal): Promise<Address[]> {
  const res = await fetch(`/api/sok?${new URLSearchParams({ q, sources: id })}`, { signal })
  if (!res.ok) throw new Error(`/api/sok svarade ${res.status}`)
  const body = (await res.json()) as Omit<SearchResult, 'areaPickers'>
  if (body.failed.includes(id)) throw new Error(`${id} svarade inte`)
  return body.addresses
}

/**
 * Frågar en källa via /api/sok. En fråga per källa: svaren cachas och visas var för sig.
 * Källor som inte svarar har ofta bara somnat och är vakna vid nästa fråga, så de får ett nytt försök.
 */
async function fetchSource(id: string, q: string, signal?: AbortSignal): Promise<Address[]> {
  let addresses: Address[]
  try {
    addresses = await askSource(id, q, signal)
  } catch (error) {
    if (signal?.aborted) throw error
    addresses = await askSource(id, q, signal)
  }
  remember(id, q, addresses)
  return addresses
}

async function searchLive(
  query: string,
  signal: AbortSignal | undefined,
  options: SearchOptions,
  onPartial: (partial: Omit<SearchResult, 'areaPickers'>) => void,
): Promise<Omit<SearchResult, 'areaPickers'>> {
  const started = Date.now()
  const placesPromise = loadPlaces() // parallellt med sökningen
  const { sources, street, place } = await liveSourcesFor(liveKey(query), options)
  // Källorna söker på gatan, och orten eller kommunen efter den filtreras här. Är svaret avkortat
  // kan rätt ort saknas; då frågas källan också med "gata, ort", som den matchar på början.
  // Utan ort i en avgränsad sökning är det kommunens huvudort som frågas.
  const q = liveKey(street)
  const narrowTo = place || (options.kommun && mainPlace(options.kommun))
  const withPlace = liveKey(`${street}, ${narrowTo}`)
  const merge = (base: Address[], extra: Address[]) => [...base, ...extra.filter((a) => !base.some((b) => b.id === a.id))]
  const cachedFor = (id: string) => {
    const base = fromCache(id, q)
    if (!base || !narrowTo || base.length < SOURCE_LIMIT) return base
    const extra = fromCache(id, withPlace)
    return extra && merge(base, extra)
  }
  const fetchFor = async (id: string) => {
    const base = fromCache(id, q) ?? (await fetchSource(id, q, signal))
    if (!narrowTo || base.length < SOURCE_LIMIT) return base
    return merge(base, fromCache(id, withPlace) ?? (await fetchSource(id, withPlace, signal)))
  }
  const hits = sources.map((id) => ({ id, cached: cachedFor(id) }))
  const missing = hits.filter((h) => !h.cached).map((h) => h.id)
  // Ort-tabellen behövs först när svaren ska visas, så den får inte hålla tillbaka anropen.
  const withKommun = async (list: Address[]) => {
    const places = await placesPromise
    return list
      .map((a) => {
        const source = getSource(a.sourceId)
        return source ? { ...a, kommun: kommunForLocality(source, a.locality, places[source.id]) } : a
      })
      .filter((a) => matchesPlace(a, place) && mayBeInKommun(a, options.kommun))
  }

  let addresses: Address[] = []
  const failed: string[] = []
  // Svaren från nätet samlas en kort stund, så att listan inte byggs om för varje källa.
  let holding = false
  const report = () => {
    if (!holding && !signal?.aborted && addresses.length > 0) onPartial({ addresses, failed: [...failed] })
  }
  const add = (found: Address[]) => {
    addresses = [...addresses, ...found]
    if (found.length > 0) report()
  }
  const fetched = async () => {
    // Väntan räknas från sökningens början: den löper medan gatuindexet laddas.
    await wait(Math.max(0, NETWORK_DELAY_MS - (Date.now() - started)), signal)
    holding = true
    const timer = setTimeout(() => {
      holding = false
      report()
    }, HOLD_MS)
    await Promise.all(
      missing.map(async (id) => {
        try {
          add(await withKommun(await fetchFor(id)))
        } catch {
          failed.push(id)
        }
      }),
    )
    clearTimeout(timer)
    if (signal?.aborted) throw new DOMException('Avbruten', 'AbortError')
  }
  await Promise.all([
    withKommun(hits.flatMap((h) => h.cached ?? [])).then(add),
    missing.length > 0 ? fetched() : undefined,
  ])
  return { addresses, failed }
}

/**
 * Källor med områdesval som sökningen ska erbjuda: de som gav områdesträffar, de som har gatan
 * i frågan (hel gata, med eller utan nummer) och de vars kommun frågan nämner ("Okändgatan 3, Avesta").
 */
async function areaPickersFor(query: string, found: Address[], kommun?: Kommun): Promise<AreaPicker[]> {
  const sources = SOURCES.filter((s) => s.selection === 'area' && coversKommun(s, kommun))
  if (sources.length === 0 || normalize(query).length < 2) return []
  const shard = await loadShard(shardKey(query))
  const { place } = splitPlace(shard, query)
  const placeShard = place ? await loadShard(shardKey(place)) : null
  return sources.flatMap((s) => {
    const hasHits = found.some((a) => a.sourceId === s.id)
    // Nämner frågan en annan plats hör gatan inte till källan, hur väl gatan än är känd.
    const relevant = hasHits || (place ? namesSource(place, placeShard, s) : isKnownStreet(shard, query, s.id))
    return relevant ? [{ sourceId: s.id, kommun: s.kommuner[0]?.name ?? s.name, hasHits }] : []
  })
}

/**
 * Sökningen hos en statisk källa. Nämner frågan källans plats söks områdena också på gatudelen.
 * Hela frågan söks alltid, eftersom "Avesta tätort" kan delas i gatan "avesta" och platsen "tätort".
 */
async function searchStaticSource(source: Source, query: string, signal: AbortSignal | undefined, kommun?: Kommun): Promise<Address[]> {
  const provider = providerFor(source)
  // Sökningen i en kommun gäller just kommunens källor, så där räcker början av ett ord.
  const mode = { areaPrefix: !!kommun }
  const hits = await provider.searchAddresses(query, signal, mode)
  if (source.selection !== 'area') return hits
  const street = await streetAtSourcePlace(query, source, loadShard)
  return street ? mergeHits(hits, await provider.searchAddresses(street, signal, mode)) : hits
}

/** Väcker sökfunktionen och laddar ort-tabellen i förväg, t.ex. när sökfältet får fokus. */
export function warmUpSearch(): void {
  void loadPlaces()
  if (SOURCES.some((s) => s.config.system !== 'static')) void fetch('/api/sok?q=').catch(() => {})
}

/**
 * Sök i alla källor: statiska lokalt, live-källor via /api/sok. Träffarna lämnas via `onPartial`
 * allteftersom de kommer, så att en långsam källa inte håller tillbaka de andra.
 */
export async function searchAll(
  query: string,
  signal?: AbortSignal,
  onPartial?: (partial: SearchResult) => void,
  options: SearchOptions = {},
): Promise<SearchResult> {
  let localAddresses: Address[] = []
  let localDone = false
  let areaPickers: AreaPicker[] = []
  const report = (live: Omit<SearchResult, 'areaPickers'>) => {
    if (localDone && !signal?.aborted) onPartial?.({ addresses: [...localAddresses, ...live.addresses], failed: [], areaPickers })
  }
  let latest: Omit<SearchResult, 'areaPickers'> = { addresses: [], failed: [] }
  const live = searchLive(query, signal, options, (partial) => report((latest = partial)))
  const local = SOURCES.filter((m) => m.config.system === 'static' && coversKommun(m, options.kommun))
  const localResults = await Promise.allSettled(local.map((m) => searchStaticSource(m, query, signal, options.kommun)))
  localAddresses = localResults.some((r) => r.status === 'fulfilled') ? mergeResults(localResults, 8).filter((a) => mayBeInKommun(a, options.kommun)) : []
  areaPickers = await areaPickersFor(query, localAddresses, options.kommun)
  localDone = true
  report(latest)
  const { addresses, failed } = await live
  return { addresses: [...localAddresses, ...addresses], failed, areaPickers }
}

/**
 * Kommunerna som frågans ort ligger i, om Sopor inte har någon av dem ("Storgatan 12, Hedemora").
 * Tom lista utan ort, för okända orter och för orter i kommuner som Sopor har, helt eller delvis.
 */
export async function missingKommuner(query: string, signal?: AbortSignal): Promise<string[]> {
  const { place } = splitPlace(await loadShard(shardKey(query)), query)
  return place && !signal?.aborted ? missingForPlace(place) : []
}

async function missingForPlace(place: string): Promise<string[]> {
  const lookup = await loadSwedenPlaces()
  if (!lookup) return []
  const codes = kommunerForPlace(lookup, place)
  const covered = new Set(SOURCES.flatMap(placeKommuner).map((k) => k.code))
  return codes.some((code) => covered.has(code)) ? [] : codes.map((code) => lookup.kommuner[code])
}

export interface KommunStatus {
  name: string
  covered: boolean
}

/**
 * "Finns din kommun?": kommunerna som en ort eller kommun ligger i och om Sopor har dem.
 * Kommuner där en källa bara har en del adresser räknas inte. Null när ortfilen inte går att hämta.
 */
export async function kommunStatus(place: string): Promise<KommunStatus[] | null> {
  const [lookup, places] = await Promise.all([loadSwedenPlaces(), loadPlaces()])
  if (!lookup) return null
  const covered = new Set(supportedKommuner().map((k) => k.name))
  const names = kommunerForPlace(lookup, place.trim()).map((code) => lookup.kommuner[code])
  // Stadsdelar som Limhamn är inga tätorter, men källornas egna orter kan känna till dem
  const key = normalize(place, false)
  const local = Object.values(places).flatMap((p) => p[key] ?? [])
  return [...new Set([...names, ...local])].map((name) => ({ name, covered: covered.has(name) }))
}

export interface PlaceSuggestion {
  place: string
  kommuner: KommunStatus[]
}

/** "uppsala näs" → "Uppsala Näs". Ortnamnen finns bara normaliserade. */
const titleCase = (key: string) => key.replace(/(^|[ -])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toLocaleUpperCase('sv'))

/** Orter som börjar som det man skrivit, kortast först, för "Menade du …?" medan man skriver. */
export async function placeSuggestions(prefix: string, limit = 5): Promise<PlaceSuggestion[]> {
  const key = normalize(prefix, false)
  if (key.length < 2) return []
  const [lookup, places] = await Promise.all([loadSwedenPlaces(), loadPlaces()])
  const keys = new Set([...Object.keys(lookup?.orter ?? {}), ...Object.values(places).flatMap(Object.keys)])
  // "stockholms" finns bara för att "Stockholms kommun" ska hittas och är inget eget förslag
  const hits = [...keys]
    .filter((k) => k.startsWith(key) && k !== key && !(k.endsWith('s') && keys.has(k.slice(0, -1))))
    .sort((a, b) => a.length - b.length || a.localeCompare(b, 'sv'))
    .slice(0, limit)
  return Promise.all(hits.map(async (k) => ({ place: titleCase(k), kommuner: (await kommunStatus(k)) ?? [] })))
}

/** Förslag för "Menade du:" (bara statiska källor har listan lokalt). */
export async function suggestAll(query: string, signal?: AbortSignal, kommun?: Kommun): Promise<Address[]> {
  const local = SOURCES.filter((m) => m.config.system === 'static' && coversKommun(m, kommun))
  const results = await Promise.allSettled(local.map((m) => providerFor(m).suggestAddresses(query, signal)))
  return results.some((r) => r.status === 'fulfilled') ? mergeResults(results, 3).filter((a) => mayBeInKommun(a, kommun)) : []
}

/** Sökning och förslag avgränsade till en kommun, för sökfältet på kommunsidan. */
export function searchInKommun(kommun: Kommun) {
  return {
    search: (query: string, signal?: AbortSignal, onPartial?: (partial: SearchResult) => void, options?: SearchOptions) =>
      searchAll(query, signal, onPartial, { ...options, kommun }),
    suggest: (query: string, signal?: AbortSignal) => suggestAll(query, signal, kommun),
  }
}

export async function getAddress(sourceId: string, addressId: string, signal?: AbortSignal): Promise<Address | null> {
  const m = getSource(sourceId)
  return m ? providerFor(m).getAddress(addressId, signal) : null
}

/** Alla kommunsidor. Null när filen inte går att hämta. */
export function kommunPages(): Promise<KommunPage[] | null> {
  return loadKommunPages()
}

/** En kommunsida. Undefined när kommunen inte finns, null när filen inte går att hämta. */
export async function kommunPage(slug: string): Promise<KommunPage | undefined | null> {
  const pages = await loadKommunPages()
  return pages && pages.find((p) => p.slug === slug)
}
