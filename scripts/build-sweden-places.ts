// Hämtar Sveriges kommuner och deras tätorter och småorter från Wikidata till data/sverige/orter.json.
// Körs för hand när kommuner eller orter ändras: `npm run build:orter`. Data från Wikidata, CC0.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SwedenPlacesFile } from '../src/data/sweden-places.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outFile = path.join(root, 'data', 'sverige', 'orter.json')
const SPARQL = 'https://query.wikidata.org/sparql'

/** Kommuner (Q127448) med gällande kommunkod. Gamla koder från före länsbytena har slutdatum. */
const KOMMUNER = `SELECT ?kommun ?kod ?kommunLabel WHERE {
  ?kommun wdt:P31 wd:Q127448; p:P525 ?st. ?st ps:P525 ?kod.
  FILTER NOT EXISTS { ?st pq:P582 [] } FILTER NOT EXISTS { ?kommun wdt:P576 [] }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "sv". } }`

/**
 * Tätorter (Q12813115) och småorter (Q14839548) och vad de ligger i. Frågan hålls enkel för att
 * hinna inom Wikidatas 60 sekunder; det som inte är en kommun sorteras bort i toPlacesFile.
 */
const ORTER = `SELECT ?kommun ?ortLabel WHERE {
  VALUES ?typ { wd:Q12813115 wd:Q14839548 } ?ort wdt:P31 ?typ; wdt:P131 ?kommun; rdfs:label ?ortLabel.
  FILTER(LANG(?ortLabel) = "sv") }`

type Row = Record<string, { value: string }>

export function toPlacesFile(kommunRows: Row[], ortRows: Row[], updatedAt: string): SwedenPlacesFile {
  const codeOf = new Map(kommunRows.map((r) => [r.kommun.value, r.kod.value]))
  const kommuner = Object.fromEntries(
    kommunRows.map((r) => [r.kod.value, r.kommunLabel.value]).sort(([a], [b]) => a.localeCompare(b)),
  )
  const orter: Record<string, Set<string>> = {}
  for (const r of ortRows) {
    const code = codeOf.get(r.kommun.value)
    const name = r.ortLabel.value.trim()
    // Orter utan svensk etikett får sitt Q-id som etikett.
    if (!code || /^Q\d+$/.test(name)) continue
    ;(orter[name] ??= new Set()).add(code)
  }
  const sorted = Object.keys(orter).sort((a, b) => a.localeCompare(b, 'sv'))
  return { source: 'Wikidata (CC0)', updatedAt, kommuner, orter: Object.fromEntries(sorted.map((n) => [n, [...orter[n]].sort()])) }
}

async function query(sparql: string): Promise<Row[]> {
  const res = await fetch(`${SPARQL}?${new URLSearchParams({ query: sparql })}`, {
    headers: { 'User-Agent': 'Sopor/1.0 (+https://sopor.hardyson.se)', Accept: 'application/sparql-results+json' },
  })
  if (!res.ok) throw new Error(`Wikidata svarade ${res.status}`)
  return ((await res.json()) as { results: { bindings: Row[] } }).results.bindings
}

async function main() {
  const file = toPlacesFile(await query(KOMMUNER), await query(ORTER), new Date().toISOString().slice(0, 10))
  const count = Object.keys(file.kommuner).length
  if (count !== 290) throw new Error(`Väntade 290 kommuner, fick ${count}`)
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(file, null, 1) + '\n')
  console.log(`build-orter: ${count} kommuner, ${Object.keys(file.orter).length} orter`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`build-orter: ${error.message}`)
    process.exit(1)
  })
}
