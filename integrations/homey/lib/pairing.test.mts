import { describe, expect, it, vi } from 'vitest'
import type { SoporSearchHit } from './api.mjs'
import { MAX_LIST, areaLinks, findHits, kommunNames, notices, parseQuery, placeCovered, places, searchOutcome } from './pairing.mjs'

const hit = (street: string, locality: string, kommun = `${locality} kommun`): SoporSearchHit => ({
  id: `${street}-${locality}`, street, locality, kommun, source: 'x', detail: null, notice: null, areasUrl: null, url: `https://sopor.hardyson.se/${street}`,
})

const many = (locality: string, n: number) => Array.from({ length: n }, (_, i) => hit(`Storgatan ${i + 1}`, locality))

describe('parningens sökning', () => {
  it('delar "gata, ort" vid första kommat', () => {
    expect(parseQuery('Storgatan 2, Uppsala')).toEqual({ q: 'Storgatan 2', place: 'Uppsala' })
    expect(parseQuery(' Storgatan 2 ')).toEqual({ q: 'Storgatan 2', place: '' })
  })

  it('filtrerar på ort eller kommun när orten är angiven', () => {
    const hits = [hit('Storgatan 2', 'Uppsala'), hit('Storgatan 2', 'Örebro'), hit('Storgatan 2', 'Gamla Uppsala', 'Uppsala kommun')]
    const outcome = searchOutcome({ addresses: hits, failed: [] }, 'upps')
    expect(outcome.result).toBe('found')
    expect(outcome.hits.map((h) => h.locality)).toEqual(['Uppsala', 'Gamla Uppsala'])
  })

  it('ger få träffar direkt', () => {
    expect(searchOutcome({ addresses: many('Uppsala', MAX_LIST), failed: [] }, '').result).toBe('found')
  })

  it('ber om ort när träffarna är många, med orterna störst först', () => {
    const outcome = searchOutcome({ addresses: [...many('Örebro', 4), ...many('Uppsala', 10)], failed: [] }, '')
    expect(outcome.result).toBe('places')
    expect(places(outcome.hits)).toEqual([
      { key: 'Uppsala|Uppsala kommun', label: 'Uppsala, Uppsala kommun', count: 10 },
      { key: 'Örebro|Örebro kommun', label: 'Örebro, Örebro kommun', count: 4 },
    ])
  })

  it('visar bara kommunen när orten saknas', () => {
    expect(places([hit('Storgatan 2', '', 'Lidköpings kommun')])[0].label).toBe('Lidköpings kommun')
  })

  it('skiljer på att källor inte svarade och att inget hittades', () => {
    expect(searchOutcome({ addresses: [], failed: ['uppsala'] }, '').result).toBe('failed')
    expect(searchOutcome({ addresses: [], failed: [] }, '').result).toBe('none')
    expect(searchOutcome({ addresses: [hit('Storgatan 2', 'Örebro')], failed: [] }, 'uppsala').result).toBe('none')
  })
})

describe('kommunerna som finns', () => {
  const sources = {
    sources: [
      { id: 'vafab', kommuner: [{ code: '1980', name: 'Västerås kommun' }, { code: '0381', name: 'Enköpings kommun' }] },
      { id: 'uppsala', kommuner: [{ code: '0380', name: 'Uppsala kommun' }] },
      { id: 'dubblett', kommuner: [{ code: '0380', name: 'Uppsala kommun' }] },
    ],
  }

  it('listar varje kommun en gång, utan ordet kommun, i bokstavsordning', () => {
    expect(kommunNames(sources)).toEqual(['Enköpings', 'Uppsala', 'Västerås'])
  })

  it('känner igen orten som en kommun som finns, också i början av namnet', () => {
    const names = kommunNames(sources)
    expect(placeCovered(names, 'Uppsala')).toBe(true)
    expect(placeCovered(names, 'västerå')).toBe(true)
    expect(placeCovered(names, 'Enköping')).toBe(true)
    expect(placeCovered(names, 'Kommun')).toBe(false)
    expect(placeCovered(names, 'Lillby')).toBe(false)
  })

  it('släpper igenom en områdesträff utan ort som found', () => {
    const omrade: SoporSearchHit = {
      ...hit('Avesta tätort, Östanfors m.fl.', '', 'Avesta kommun'),
      detail: 'Tisdag, jämn vecka · Trakt 7',
    }
    const outcome = searchOutcome({ addresses: [omrade], failed: [] }, '')
    expect(outcome.result).toBe('found')
    expect(outcome.hits).toEqual([omrade])
  })
})

describe('varningen före valet', () => {
  const area = (name: string, notice: string) => ({ ...hit(name, ''), notice })

  it('är tom när ingen träff har någon', () => {
    expect(notices([hit('Storgatan 2', 'Uppsala')])).toEqual([])
  })

  it('visar samma text en gång, också i en blandad lista', () => {
    const hits = [hit('Storgatan 2', 'Uppsala'), area('Trakt 1', 'Avesta'), area('Trakt 2', 'Avesta')]
    expect(notices(hits)).toEqual(['Avesta'])
  })

  it('visar varje källas egen text i listans ordning', () => {
    expect(notices([area('Trakt 1', 'Avesta'), area('Norr', 'Säter')])).toEqual(['Avesta', 'Säter'])
  })
})

describe('från adress till områdesval', () => {
  const omrade = { ...hit('Dalsbyn, Finnbo m.fl.', '', 'Säters kommun'), notice: 'Kontrollera att området stämmer.' }
  const client = (addresses: SoporSearchHit[], failed: string[] = [], areas: SoporSearchHit[] = [omrade]) => ({
    search: vi.fn(async () => ({ addresses, failed })),
    areas: vi.fn(async () => ({ addresses: areas, failed: [] })),
  })

  it('ger områdena när adressen saknas på orten', async () => {
    const c = client([hit('Storgatan 2', 'Uppsala')])
    expect(await findHits(c, 'Storgatan 2', 'Säter')).toEqual({ result: 'areas', hits: [omrade] })
    expect(c.areas).toHaveBeenCalledWith('Säter')
  })

  it('ger områdena också när en annan källa inte svarade', async () => {
    expect((await findHits(client([], ['uppsala']), 'Storgatan 2', 'Säter')).result).toBe('areas')
  })

  it('frågar inte efter områden när adressen hittas', async () => {
    const c = client([hit('Storgatan 2', 'Uppsala')])
    expect((await findHits(c, 'Storgatan 2', 'Uppsala')).result).toBe('found')
    expect(c.areas).not.toHaveBeenCalled()
  })

  it('frågar inte efter områden utan ort, eftersom gatan kan finnas i många kommuner', async () => {
    const c = client([])
    expect((await findHits(c, 'Storgatan 2', '')).result).toBe('none')
    expect(c.areas).not.toHaveBeenCalled()
  })

  it('behåller resultatet när orten saknar områden', async () => {
    expect((await findHits(client([], [], []), 'Storgatan 2', 'Zzzville')).result).toBe('none')
  })

  it('behandlar fel från områdena som inga områden', async () => {
    const c = client([])
    c.areas.mockRejectedValue(new Error('nere'))
    expect((await findHits(c, 'Storgatan 2', 'Säter')).result).toBe('none')
  })
})

describe('areaLinks', () => {
  const omrade = (kommun: string, areasUrl: string) => ({ ...hit('Område', '', kommun), areasUrl })

  it('ger inga länkar för vanliga adresser', () => {
    expect(areaLinks([hit('Storgatan 2', 'Uppsala')])).toEqual([])
  })

  it('ger en länk per kommun', () => {
    const avesta = 'https://sopor.hardyson.se/avesta/omraden'
    const sater = 'https://sopor.hardyson.se/sater/omraden'
    expect(areaLinks([omrade('Avesta kommun', avesta), omrade('Avesta kommun', avesta), omrade('Säters kommun', sater)])).toEqual([
      { kommun: 'Avesta kommun', url: avesta },
      { kommun: 'Säters kommun', url: sater },
    ])
  })
})
