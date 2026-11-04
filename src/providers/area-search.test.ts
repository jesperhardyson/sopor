// Sökningen på område med Avestas riktiga områden och det riktiga gatuindexet.
import '@/test/show-hidden-sources'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildMunicipality, parseAreasFile, parseSchedulesFile } from '@/data/static-format'
import { buildStreetIndex, type OsmKommun } from '@/data/street-index'
import { ALL_SOURCES, getSource } from '@/sources'
import { searchAll, type SearchOptions } from './registry'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'))

const { index } = buildMunicipality(
  [
    {
      year: 2026,
      schedules: parseSchedulesFile(read('data/avesta/2026/schedules.json'), 'schedules.json'),
      addresses: [],
      areas: parseAreasFile(read('data/avesta/2026/omraden.json'), 'omraden.json'),
    },
  ],
  getSource('avesta')!,
)
const osm = readdirSync(path.join(root, 'data/osm')).map((file) => read(`data/osm/${file}`) as OsmKommun)
const { shards } = buildStreetIndex(osm, ALL_SOURCES)

beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/data/avesta/addresses.json') return Response.json(index)
      if (url === '/data/orter.json') return Response.json({})
      const shard = url.match(/^\/data\/gator\/(.+)\.json$/)
      if (shard) {
        const found = shards[decodeURIComponent(shard[1])]
        return found ? Response.json(found) : new Response('', { status: 404 })
      }
      if (url.startsWith('/api/sok')) return Response.json({ addresses: [], failed: [] })
      return new Response('', { status: 404 })
    }),
  )
})

afterAll(() => {
  vi.unstubAllGlobals()
})

async function areas(query: string, options?: SearchOptions) {
  const { addresses } = await searchAll(query, undefined, undefined, options)
  return addresses.filter((a) => a.sourceId === 'avesta').map((a) => a.id)
}

describe('söktexten för integrationerna', () => {
  it.each(index.addresses.map(([id, street]) => [id, street.split(',')[0]]))('%s hittas på första delen av namnet', async (id, first) => {
    expect(await areas(first)).toContain(id)
  })
})

describe('halvskrivna frågor', () => {
  const avesta = { code: '2084', name: 'Avesta kommun' }

  it.each(['st', 'stor', 'stallg', 'östan'])('%s ger inga områden på startsidan', async (query) => {
    expect(await areas(query)).toEqual([])
  })

  it.each([
    ['Storbyn', 'trakt-2'],
    ['Östanfors', 'trakt-7'],
    ['Avesta tätort', 'trakt-7'],
  ])('%s ger området på startsidan', async (query, id) => {
    expect(await areas(query)).toContain(id)
  })

  it('östan ger Östanfors på kommunsidan', async () => {
    expect(await areas('östan', { kommun: avesta })).toContain('trakt-7')
  })

  it('st ger områden på kommunsidan', async () => {
    expect((await areas('st', { kommun: avesta })).length).toBeGreaterThan(0)
  })
})

describe('områden när frågan nämner en plats', () => {
  it.each(['Näs 12, Gotland', 'Torp 5, Ljusdal', 'Stallgatan 5, Stockholm'])('%s ger inga områden', async (query) => {
    expect(await areas(query)).toEqual([])
  })

  it.each(['Stallgatan 5, Avesta', 'Stallgatan, Avesta', 'Stallgatan Avesta', 'Storbogatan Avesta', 'Stallgatan 5, Krylbo'])(
    '%s ger området med gatan',
    async (query) => {
      expect(await areas(query)).toEqual(['trakt-1'])
    },
  )

  it('Avesta tätort ger området, fast frågan kan delas i gata och plats', async () => {
    expect(await areas('Avesta tätort')).toEqual(['trakt-7'])
  })

  it('ger ingen rad för områdesval när platsen är en annan', async () => {
    const { areaPickers } = await searchAll('Stallgatan 5, Stockholm')
    expect(areaPickers).toEqual([])
  })
})
