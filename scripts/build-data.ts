// Läser data/<kommun>/<år>/ och genererar public/data/<kommun>/ och public/ics/<kommun>/.
// Körs av `npm run build:data` (och automatiskt före dev och build).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildKommunPages } from '../src/data/kommun-pages'
import { buildMunicipality, DataError, parseAddressesCsv, parseSchedulesFile } from '../src/data/static-format'
import { buildStreetIndex, type OsmKommun } from '../src/data/street-index'
import { buildPlaceLookup, type SwedenPlacesFile } from '../src/data/sweden-places'
import { ALL_SOURCES, SOURCES } from '../src/sources/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function readYears(municipalityDir: string) {
  return fs
    .readdirSync(municipalityDir)
    .filter((name) => /^\d{4}$/.test(name))
    .map((name) => {
      const dir = path.join(municipalityDir, name)
      const rel = (file: string) => path.relative(root, path.join(dir, file))
      const schedules = parseSchedulesFile(
        JSON.parse(fs.readFileSync(path.join(dir, 'schedules.json'), 'utf8')),
        rel('schedules.json'),
      )
      const addresses = parseAddressesCsv(fs.readFileSync(path.join(dir, 'addresses.csv'), 'utf8'), rel('addresses.csv'))
      return { year: Number(name), schedules, addresses }
    })
}

function writeFile(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

/** Gatuindex från data/osm/*.json → public/data/gator/<två tecken>.json och public/data/orter.json */
function writeStreetIndex() {
  const osmDir = path.join(root, 'data', 'osm')
  if (!fs.existsSync(osmDir)) return
  const osm = fs
    .readdirSync(osmDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(osmDir, f), 'utf8')) as OsmKommun)
  const { shards, places } = buildStreetIndex(osm, SOURCES)
  const out = path.join(root, 'public', 'data', 'gator')
  fs.rmSync(out, { recursive: true, force: true })
  for (const [key, shard] of Object.entries(shards)) writeFile(path.join(out, `${key}.json`), JSON.stringify(shard))
  writeFile(path.join(root, 'public', 'data', 'orter.json'), JSON.stringify(places))
  console.log(`build-data: gatuindex: ${Object.keys(shards).length} delfiler från ${osm.length} kommuner`)
}

/** Orter i hela Sverige från data/sverige/orter.json → public/data/sverige.json */
function writeSwedenPlaces() {
  const file = path.join(root, 'data', 'sverige', 'orter.json')
  if (!fs.existsSync(file)) return
  const lookup = buildPlaceLookup(JSON.parse(fs.readFileSync(file, 'utf8')) as SwedenPlacesFile)
  writeFile(path.join(root, 'public', 'data', 'sverige.json'), JSON.stringify(lookup))
  console.log(`build-data: orter i Sverige: ${Object.keys(lookup.orter).length}`)
}

/** Kommunsidornas data från data/sverige/orter.json och SOURCES */
export function readKommunPages() {
  const file = JSON.parse(fs.readFileSync(path.join(root, 'data', 'sverige', 'orter.json'), 'utf8')) as SwedenPlacesFile
  return buildKommunPages(file, SOURCES)
}

function main() {
  writeStreetIndex()
  writeSwedenPlaces()
  writeFile(path.join(root, 'public', 'data', 'kommuner.json'), JSON.stringify(readKommunPages()))
  for (const municipality of ALL_SOURCES) {
    if (municipality.config.system !== 'static') continue
    const dataDir = path.join(root, 'data', municipality.id)
    const dataOut = path.join(root, 'public', 'data', municipality.id)
    const icsOut = path.join(root, 'public', 'ics', municipality.id)

    const { index, scheduleFiles, ics } = buildMunicipality(readYears(dataDir), municipality)

    fs.rmSync(dataOut, { recursive: true, force: true })
    fs.rmSync(icsOut, { recursive: true, force: true })
    // Dolda källor valideras (buildMunicipality kastar vid fel) men publiceras inte.
    if (municipality.hidden) {
      console.log(`build-data: ${municipality.id}: dold, ${index.addresses.length} adresser validerade men inte publicerade`)
      continue
    }
    writeFile(path.join(dataOut, 'addresses.json'), JSON.stringify(index))
    for (const s of scheduleFiles) writeFile(path.join(dataOut, 'schedules', `${s.id}.json`), JSON.stringify(s))
    for (const i of ics) writeFile(path.join(icsOut, `${i.addressId}.ics`), i.content)

    console.log(
      `build-data: ${municipality.id}: ${index.addresses.length} adresser, ${scheduleFiles.length} scheman, ${ics.length} .ics`,
    )
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    if (error instanceof DataError) {
      console.error(`build-data: FEL i datan: ${error.message}`)
      process.exit(1)
    }
    throw error
  }
}
