// Hämtar gatunamn och ortnamn per kommun från OpenStreetMap (Overpass) till data/osm/<kod>.json.
// Körs för hand eller av en schemalagd GitHub Action: `npm run build:streets [-- --force]`.
// Data © OpenStreetMaps bidragsgivare, ODbL.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { placeKommuner, SOURCES } from '../src/sources/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'data', 'osm')
const OVERPASS = 'https://overpass-api.de/api/interpreter'
const PLACE = '^(city|town|village|hamlet|suburb|neighbourhood|quarter|locality|isolated_dwelling)$'

export function overpassQuery(code: string): string {
  return `[out:json][timeout:180];
rel["boundary"="administrative"]["admin_level"="7"]["ref"="${code}"];
map_to_area->.k;
way(area.k)["highway"]["name"];
out tags;
node(area.k)["place"~"${PLACE}"]["name"];
out tags;`
}

async function fetchKommun(code: string, attempt = 1): Promise<{ streets: string[]; places: string[] }> {
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'User-Agent': 'Sopor/1.0 (+https://sopor.hardyson.se)', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: overpassQuery(code) }),
  })
  // Overpass är ofta tillfälligt överbelastad (429/502/504): vänta och försök igen.
  if ([429, 502, 503, 504].includes(res.status) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 15000 * attempt))
    return fetchKommun(code, attempt + 1)
  }
  if (!res.ok) throw new Error(`Overpass svarade ${res.status} för ${code}`)
  const json = (await res.json()) as { elements: { type: string; tags?: Record<string, string> }[] }
  const names = (type: string) =>
    [...new Set(json.elements.filter((e) => e.type === type && e.tags?.name).map((e) => e.tags!.name.trim()))].sort((a, b) =>
      a.localeCompare(b, 'sv'),
    )
  return { streets: names('way'), places: names('node') }
}

async function main() {
  const force = process.argv.includes('--force')
  fs.mkdirSync(outDir, { recursive: true })
  const kommuner = new Map(SOURCES.flatMap(placeKommuner).map((k) => [k.code, k.name]))
  for (const [code, name] of kommuner) {
    const file = path.join(outDir, `${code}.json`)
    if (fs.existsSync(file) && !force) continue
    const { streets, places } = await fetchKommun(code)
    if (streets.length === 0) throw new Error(`Inga gator för ${name} (${code}). Stämmer kommunkoden?`)
    fs.writeFileSync(file, JSON.stringify({ code, name, source: 'OpenStreetMap (ODbL)', streets, places }, null, 1) + '\n')
    console.log(`build-streets: ${name}: ${streets.length} gator, ${places.length} orter`)
    await new Promise((r) => setTimeout(r, 2000))
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`build-streets: ${error.message}`)
    process.exit(1)
  })
}
