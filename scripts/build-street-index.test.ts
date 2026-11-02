import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { placeKommuner, SOURCES } from '@/sources'

describe('gatunamn från OpenStreetMap', () => {
  const osmDir = path.resolve(import.meta.dirname, '../data/osm')
  const kommuner = new Map(SOURCES.flatMap(placeKommuner).map((k) => [k.code, k.name]))

  // Utan filen hoppar gatuindexet tyst över kommunen, och sökningen hittar då inte källan förrän
  // man skriver ett husnummer eller trycker Enter.
  it.each([...kommuner])('finns för %s (%s). Kör `npm run build:streets` om den saknas', (code) => {
    const file = path.join(osmDir, `${code}.json`)
    expect(fs.existsSync(file), `data/osm/${code}.json saknas`).toBe(true)
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { code: string; streets: string[] }
    expect(data.code).toBe(code)
    expect(data.streets.length).toBeGreaterThan(0)
  })
})
