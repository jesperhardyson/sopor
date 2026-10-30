// Läser data/<kommun>/<år>/ och genererar public/data/<kommun>/ och public/ics/<kommun>/.
// Körs av `npm run build:data` (och automatiskt före dev och build).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMunicipality, DataError, parseAddressesCsv, parseSchedulesFile } from '../src/data/static-format'
import { MUNICIPALITIES } from '../src/municipalities'

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

function main() {
  for (const municipality of MUNICIPALITIES) {
    if (municipality.provider.type !== 'static') continue
    const dataDir = path.join(root, 'data', municipality.id)
    const dataOut = path.join(root, 'public', 'data', municipality.id)
    const icsOut = path.join(root, 'public', 'ics', municipality.id)

    const { index, scheduleFiles, ics } = buildMunicipality(readYears(dataDir), municipality)

    fs.rmSync(dataOut, { recursive: true, force: true })
    fs.rmSync(icsOut, { recursive: true, force: true })
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
