// Stoppar en ändring som tar bort eller byter namn på ett befintligt adress-id.
// Kalenderprenumerationer hänger på id:na, så de får aldrig försvinna ur en befintlig fil.
//
//   npx tsx scripts/check-address-ids.ts [bas-ref]   (standard: origin/main)

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAddressesCsv } from '../src/data/static-format'

type IdsByFile = Map<string, string[]>

export function findRemovedIds(base: IdsByFile, head: IdsByFile): { file: string; id: string }[] {
  const removed: { file: string; id: string }[] = []
  for (const [file, ids] of base) {
    const now = new Set(head.get(file) ?? [])
    for (const id of ids) if (!now.has(id)) removed.push({ file, id })
  }
  return removed
}

const isAddressFile = (f: string) => /^data\/[^/]+\/\d{4}\/addresses\.csv$/.test(f)
const ids = (text: string, file: string) => parseAddressesCsv(text, file).map((r) => r.id)
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
