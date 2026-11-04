// Stoppar en ändring som tar bort eller byter namn på ett befintligt adress-id.
// Kalenderprenumerationer hänger på id:na, så de får aldrig försvinna ur en befintlig fil.
//
//   npx tsx scripts/check-address-ids.ts [bas-ref]   (standard: origin/main)

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAddressesCsv, parseAreasFile } from '../src/data/static-format'

type IdsByFile = Map<string, string[]>

/**
 * Id:n i data/avesta/2026/addresses.csv. De var påhittade (seed-data) och publicerades aldrig,
 * eftersom Avesta var dold, så de får försvinna när områdena ersätter filen.
 */
export const RETIRED_FAKE_IDS: readonly string[] = [
  'krylbo-storgatan-12b',
  'avesta-storgatan-12',
  'fors-storgatan-21',
  'horndal-bergsvagen-4',
  'avesta-kyrkogatan-3',
  'avesta-kungsgatan-15',
  'krylbo-brogatan-7',
  'horndal-bruksgatan-2',
  'fors-asgatan-9',
  'fors-alvvagen-11',
  'horndal-smedjebacksvagen-30',
]

export function findRemovedIds(base: IdsByFile, head: IdsByFile): { file: string; id: string }[] {
  const removed: { file: string; id: string }[] = []
  for (const [file, ids] of base) {
    const now = new Set(head.get(file) ?? [])
    for (const id of ids) if (!now.has(id) && !RETIRED_FAKE_IDS.includes(id)) removed.push({ file, id })
  }
  return removed
}

export const isAddressFile = (f: string) => /^data\/[^/]+\/\d{4}\/(addresses\.csv|omraden\.json)$/.test(f)
const ids = (text: string, file: string) =>
  file.endsWith('.json')
    ? parseAreasFile(JSON.parse(text), file).areas.map((a) => a.id)
    : parseAddressesCsv(text, file).map((r) => r.id)
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' })

function main() {
  const ref = process.argv[2] ?? 'origin/main'
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  process.chdir(root)

  const base: IdsByFile = new Map(
    git('ls-tree', '-r', '--name-only', ref, '--', 'data')
      .split('\n')
      .filter(isAddressFile)
      .map((f) => [f, ids(git('show', `${ref}:${f}`), `${ref}:${f}`)]),
  )
  const head: IdsByFile = new Map(
    [...base.keys()].filter((f) => fs.existsSync(f)).map((f) => [f, ids(fs.readFileSync(f, 'utf8'), f)]),
  )

  const removed = findRemovedIds(base, head)
  if (removed.length > 0) {
    console.error('Adress-id får inte tas bort eller byta namn (kalenderprenumerationer slutar fungera):')
    for (const r of removed) console.error(`  ${r.file}: ${r.id}`)
    process.exit(1)
  }
  console.log(`check-address-ids: inga borttagna id jämfört med ${ref} (${base.size} filer)`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
