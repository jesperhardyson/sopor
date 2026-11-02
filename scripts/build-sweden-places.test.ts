import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPlaceLookup, kommunerForPlace, type SwedenPlacesFile } from '@/data/sweden-places'
import { toPlacesFile } from './build-sweden-places'

const row = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value }]))
const Q = (id: string) => `http://www.wikidata.org/entity/${id}`

describe('toPlacesFile', () => {
  const file = toPlacesFile(
    [
      row({ kommun: Q('Q506250'), kod: '0180', kommunLabel: 'Stockholms kommun' }),
      row({ kommun: Q('Q499404'), kod: '0162', kommunLabel: 'Danderyds kommun' }),
    ],
    [
      row({ kommun: Q('Q499404'), ortLabel: 'Stockholm' }),
      row({ kommun: Q('Q506250'), ortLabel: 'Stockholm' }),
      row({ kommun: Q('Q499404'), ortLabel: 'Djursholm' }),
      row({ kommun: Q('Q999'), ortLabel: 'Utanför' }),
      row({ kommun: Q('Q506250'), ortLabel: 'Q123456' }),
    ],
    '2026-11-02',
  )

  it('ger kommunerna efter kod', () => {
    expect(file.kommuner).toEqual({ '0162': 'Danderyds kommun', '0180': 'Stockholms kommun' })
  })

  it('samlar kommunkoderna per ort, sorterade', () => {
    expect(file.orter).toEqual({ Djursholm: ['0162'], Stockholm: ['0162', '0180'] })
  })

  it('anger källa och datum', () => {
    expect(file).toMatchObject({ source: 'Wikidata (CC0)', updatedAt: '2026-11-02' })
  })
})

describe('data/sverige/orter.json', () => {
  const data = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../data/sverige/orter.json'), 'utf8')) as SwedenPlacesFile

  it('har alla 290 kommuner. Kör `npm run build:orter` om den saknas', () => {
    expect(Object.keys(data.kommuner)).toHaveLength(290)
  })

  it('ger de största städerna rätt kommun', () => {
    // Tätorten Malmö pekar bara på Lomma i Wikidata. Kommunnamnet rättar upp det.
    const lookup = buildPlaceLookup(data)
    expect(kommunerForPlace(lookup, 'Stockholm')).toEqual(['0180'])
    expect(kommunerForPlace(lookup, 'Göteborg')).toEqual(['1480'])
    expect(kommunerForPlace(lookup, 'Malmö')).toEqual(['1280'])
  })
})
