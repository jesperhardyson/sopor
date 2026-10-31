// Läser och skriver versionen i appens filer. Sökvägarna är relativa till integrations/homey.

import { readFileSync, writeFileSync } from 'node:fs'
import type { Versions } from './version.mjs'

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
export const write = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n')

export function readVersions(): Versions {
  return {
    compose: read('.homeycompose/app.json').version,
    app: read('app.json').version,
    pkg: read('package.json').version,
    changelog: read('.homeychangelog.json'),
  }
}

/** Sätter versionen i alla filer, också package-lock.json. */
export function writeVersion(version: string) {
  for (const file of ['.homeycompose/app.json', 'app.json', 'package.json']) write(file, { ...read(file), version })
  const lock = read('package-lock.json')
  lock.version = version
  lock.packages[''].version = version
  write('package-lock.json', lock)
}

export function addChangelog(version: string, en: string, sv: string) {
  write('.homeychangelog.json', { ...read('.homeychangelog.json'), [version]: { en, sv } })
}
