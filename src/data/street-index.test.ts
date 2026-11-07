import { describe, expect, it } from 'vitest'
import type { Source } from '@/sources'
import { buildStreetIndex, candidateSources, isKnownStreet, matchesPlace, pickLiveSources, shardKey, sourcesAtPlace, splitPlace, type OsmKommun } from './street-index'

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
    expect(index.shards.st).toEqual({ storgatan: ['uppsala', 'vafab'], storvreta: ['uppsala'] })
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

  it('låter centralorten vinna när en by i en annan kommun heter likadant', () => {
    const osm: OsmKommun[] = [
      { code: '0880', streets: ['Storgatan'], places: ['Kalmar', 'Sävsjö'] },
      { code: '0684', streets: ['Storgatan'], places: ['Sävsjö', 'Vrigstad'] },
    ]
    const sydost = { ...src('sydost', [['0880', 'Kalmar kommun']]), grannkommuner: [{ code: '0684', name: 'Sävsjö kommun' }] }
    expect(buildStreetIndex(osm, [sydost]).places.sydost).toEqual({
      kalmar: 'Kalmar kommun',
      sävsjö: 'Sävsjö kommun',
      vrigstad: 'Sävsjö kommun',
    })
  })

  it('tar grannkommunernas orter till ort-tabellen men inte deras gator till sökningen', () => {
    const vafab = { ...SOURCES[1], grannkommuner: [{ code: '0380', name: 'Uppsala kommun' }] }
    const withNeighbour = buildStreetIndex(OSM, [vafab])
    expect(withNeighbour.places.vafab.storvreta).toBe('Uppsala kommun')
    expect(withNeighbour.shards.sv).toBeUndefined()
  })

  it('tar källans postorter före OpenStreetMaps orter, också tvetydiga och saknade', () => {
    const vafab = { ...SOURCES[1], postorter: { Skultuna: '0381', 'Västerås Hamn': '1980' } }
    expect(buildStreetIndex(OSM, [vafab]).places.vafab).toMatchObject({ skultuna: 'Enköpings kommun', 'västerås hamn': 'Västerås kommun' })
  })

  it('kastar för en postort i en kommun som källan inte har', () => {
    const vafab = { ...SOURCES[1], postorter: { Storvreta: '0380' } }
    expect(() => buildStreetIndex(OSM, [vafab])).toThrow('Storvreta')
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

  it('hittar källan för landsbygdsadresser som börjar med ortnamnet', () => {
    expect(candidateSources(index.shards.gr, 'Grillby 12')).toEqual(['vafab'])
    expect(candidateSources(index.shards.sk, 'Skultuna 4')).toEqual(['vafab'])
  })

  it('ger inget för okända gator', () => {
    expect(candidateSources(index.shards.st ?? {}, 'strandvägen')).toEqual([])
  })
})

describe('pickLiveSources', () => {
  const shard = { storgatan: ['uppsala', 'vafab'] }
  const live = ['uppsala', 'orebro']

  it('ger de live-källor som gatuindexet pekar ut', () => {
    expect(pickLiveSources(shard, 'storgatan 2, uppsala', live, false)).toEqual(['uppsala'])
  })

  it('ger inget för en gata som saknas utan siffra och utan Enter', () => {
    expect(pickLiveSources(shard, 'strandvägen', live, false)).toEqual([])
  })

  it('ger alla live-källor för en gata som saknas med siffra eller Enter', () => {
    expect(pickLiveSources(shard, 'strandvägen 4', live, false)).toEqual(live)
    expect(pickLiveSources(shard, 'strandvägen', live, true)).toEqual(live)
  })

  it('behandlar en saknad delfil som en gata som saknas', () => {
    expect(pickLiveSources(null, 'storgatan', live, false)).toEqual([])
    expect(pickLiveSources(null, 'storgatan 2', live, false)).toEqual(live)
    expect(pickLiveSources(null, 'storgatan', live, true)).toEqual(live)
  })
})

describe('splitPlace', () => {
  const index = buildStreetIndex(OSM, SOURCES)

  it('tar platsen efter husnumret', () => {
    expect(splitPlace(index.shards.st, 'Storgatan 1 Uppsala')).toEqual({ street: 'storgatan 1', place: 'uppsala' })
    expect(splitPlace(index.shards.st, 'storgatan 12 b uppsala')).toEqual({ street: 'storgatan 12 b', place: 'uppsala' })
    expect(splitPlace(index.shards.st, 'storgatan 2-4 upplands väsby')).toEqual({ street: 'storgatan 2-4', place: 'upplands väsby' })
  })

  it('tar platsen efter kommatecknet', () => {
    expect(splitPlace(index.shards.st, 'storgatan 1, uppsala')).toEqual({ street: 'storgatan 1', place: 'uppsala' })
    expect(splitPlace(index.shards.ku, 'kungsgatan, enköping')).toEqual({ street: 'kungsgatan', place: 'enköping' })
  })

  it('tar platsen efter ett känt gatunamn när numret saknas', () => {
    expect(splitPlace(index.shards.ku, 'kungsgatan enköping')).toEqual({ street: 'kungsgatan', place: 'enköping' })
  })

  it('ger ingen plats för en gata som skrivs eller en adress utan plats', () => {
    expect(splitPlace(index.shards.ku, 'kungsg')).toEqual({ street: 'kungsg', place: '' })
    expect(splitPlace(index.shards.st, 'Storgatan  1 ')).toEqual({ street: 'storgatan 1', place: '' })
    expect(splitPlace(index.shards.sk, 'Skultuna 4')).toEqual({ street: 'skultuna 4', place: '' })
  })

  it('gissar inte utan gatuindex när numret saknas', () => {
    expect(splitPlace(null, 'kungsgatan enköping')).toEqual({ street: 'kungsgatan enköping', place: '' })
  })
})

describe('matchesPlace', () => {
  const marstrand = { locality: 'Marstrand', kommun: 'Kungälvs kommun' }

  it('matchar början av orten eller kommunen', () => {
    expect(matchesPlace(marstrand, 'marstr')).toBe(true)
    expect(matchesPlace(marstrand, 'kungälv')).toBe(true)
    expect(matchesPlace(marstrand, 'Kungalv')).toBe(false) // å, ä och ö är egna bokstäver
    expect(matchesPlace(marstrand, 'uppsala')).toBe(false)
  })

  it('släpper igenom allt när platsen saknas', () => {
    expect(matchesPlace(marstrand, '')).toBe(true)
  })
})

describe('isKnownStreet', () => {
  const shard = { kungsgatan: ['avesta'], storgatan: ['avesta', 'uppsala'], avesta: ['avesta'] }

  it('jämför gatudelen exakt, med eller utan husnummer', () => {
    expect(isKnownStreet(shard, 'Kungsgatan', 'avesta')).toBe(true)
    expect(isKnownStreet(shard, 'Kungsgatan 12', 'avesta')).toBe(true)
    expect(isKnownStreet(shard, 'Kungsgatan 12 B, Avesta', 'avesta')).toBe(true)
  })

  it('godtar inte en början av namnet eller en annan källa', () => {
    expect(isKnownStreet(shard, 'Kungsg', 'avesta')).toBe(false)
    expect(isKnownStreet(shard, 'Hornsgatan 1', 'avesta')).toBe(false)
    expect(isKnownStreet(shard, 'Storgatan 1', 'vafab')).toBe(false)
  })

  it('godtar en hel fråga som är en ort i delfilen', () => {
    expect(isKnownStreet(shard, 'Avesta', 'avesta')).toBe(true)
  })

  it('ger false utan delfil', () => {
    expect(isKnownStreet(null, 'Kungsgatan', 'avesta')).toBe(false)
  })
})

describe('sourcesAtPlace', () => {
  const src = (id: string, code: string, name: string) => ({ id, name: id, url: 'https://x', kommuner: [{ code, name }], config: { system: 'edp', baseUrl: 'https://x' } }) as Source
  const sources = [src('falkenberg', '1382', 'Falkenbergs kommun'), src('falun', '2080', 'Falu kommun'), src('uppsala', '0380', 'Uppsala kommun'), src('vasyd', '1280', 'Malmö kommun')]
  const lookup = {
    kommuner: { '1382': 'Falkenbergs kommun', '2080': 'Falu kommun', '0380': 'Uppsala kommun', '1280': 'Malmö kommun' },
    orter: { falkenberg: ['1382'], falun: ['2080'], uppsala: ['0380'], grums: ['1764'] },
  }

  it('ger källorna som täcker orten', () => {
    expect(sourcesAtPlace('Falkenberg', null, lookup, {}, sources)).toEqual(['falkenberg'])
  })

  it('tar med alla kommuner orten ligger i', () => {
    const twoKommuner = { ...lookup, orter: { ...lookup.orter, bro: ['1382', '0380'] } }
    expect(sourcesAtPlace('bro', null, twoKommuner, {}, sources)).toEqual(['falkenberg', 'uppsala'])
  })

  it('känner igen källornas egna orter och platser i gatuindexet', () => {
    expect(sourcesAtPlace('limhamn', null, lookup, { vasyd: { limhamn: 'Malmö kommun' } }, sources)).toEqual(['vasyd'])
    expect(sourcesAtPlace('limhamn', { limhamn: ['vasyd'] }, lookup, {}, sources)).toEqual(['vasyd'])
  })

  it('låter ett kommunnamn betyda kommunen, även om en by på annat håll heter likadant', () => {
    expect(sourcesAtPlace('falkenberg', { falkenberg: ['uppsala'] }, lookup, { vasyd: { falkenberg: 'Malmö kommun' } }, sources)).toEqual(['falkenberg'])
  })

  it('använder början av namnet när orten är halvskriven, men inte gatunamn', () => {
    expect(sourcesAtPlace('fal', { falkgatan: ['uppsala'] }, lookup, {}, sources)).toEqual(['falkenberg', 'falun'])
  })

  it('ger null för en okänd plats, som då inte får begränsa sökningen', () => {
    expect(sourcesAtPlace('lgh 1002', null, lookup, {}, sources)).toBeNull()
    expect(sourcesAtPlace('', null, lookup, {}, sources)).toBeNull()
    expect(sourcesAtPlace('f', null, lookup, {}, sources)).toBeNull()
    expect(sourcesAtPlace('falkenberg', null, null, {}, sources)).toBeNull()
  })

  it('ger en tom lista när orten är känd men ingen av källorna täcker den', () => {
    expect(sourcesAtPlace('grums', null, lookup, {}, sources)).toEqual([])
  })
})
