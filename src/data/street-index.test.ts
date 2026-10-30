import { describe, expect, it } from 'vitest'
import type { Source } from '@/sources'
import { buildStreetIndex, candidateSources, shardKey, type OsmKommun } from './street-index'

const src = (id: string, kommuner: [string, string][]): Source => ({
  id,
  name: `${id} AB`,
  url: 'https://x',
  kommuner: kommuner.map(([code, name]) => ({ code, name })),
  config: { system: 'edp', baseUrl: 'https://x' },
})

const SOURCES = [
  src('uppsala', [['0380', 'Uppsala kommun']]),
  src('vafab', [
    ['1980', 'Västerås kommun'],
    ['0381', 'Enköpings kommun'],
  ]),
]

const OSM: OsmKommun[] = [
  { code: '0380', streets: ['Storgatan', 'Svartbäcksgatan'], places: ['Uppsala', 'Storvreta'] },
  { code: '1980', streets: ['Storgatan', 'Kopparbergsvägen'], places: ['Västerås', 'Skultuna'] },
  { code: '0381', streets: ['Storgatan', 'Kungsgatan'], places: ['Enköping', 'Grillby', 'Skultuna'] },
  { code: '9999', streets: ['Storgatan'], places: ['Ingenstans'] },
]

describe('buildStreetIndex', () => {
  const index = buildStreetIndex(OSM, SOURCES)

  it('delar upp gatunamn per de två första tecknen och anger källorna', () => {
    expect(shardKey('Storgatan')).toBe('st')
    expect(index.shards.st).toEqual({ storgatan: ['uppsala', 'vafab'] })
    expect(index.shards.sv).toEqual({ svartbäcksgatan: ['uppsala'] })
    expect(index.shards.ku).toEqual({ kungsgatan: ['vafab'] })
  })

  it('tar bara med kommuner som någon källa täcker', () => {
    expect(JSON.stringify(index.shards)).not.toContain('9999')
  })

  it('mappar orter till kommun för källor med flera kommuner, men inte tvetydiga orter', () => {
    expect(index.places.vafab).toEqual({ västerås: 'Västerås kommun', enköping: 'Enköpings kommun', grillby: 'Enköpings kommun' })
    expect(index.places.uppsala).toBeUndefined()
  })
})

describe('candidateSources', () => {
  const index = buildStreetIndex(OSM, SOURCES)

  it('hittar källorna för början av ett gatunamn', () => {
    expect(candidateSources(index.shards.st, 'storg')).toEqual(['uppsala', 'vafab'])
    expect(candidateSources(index.shards.sv, 'Svartbäcksgatan 12')).toEqual(['uppsala'])
  })

  it('klarar ort efter gatan', () => {
    expect(candidateSources(index.shards.ku, 'kungsgatan 3, enköping')).toEqual(['vafab'])
    expect(candidateSources(index.shards.ku, 'kungsgatan enköping')).toEqual(['vafab'])
  })

  it('ger inget för okända gator', () => {
    expect(candidateSources(index.shards.st ?? {}, 'strandvägen')).toEqual([])
  })
})
