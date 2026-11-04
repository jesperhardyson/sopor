import { describe, expect, it } from 'vitest'
import type { SoporSearchHit } from './api.mjs'
import { MAX_LIST, kommunNames, parseQuery, placeCovered, places, searchOutcome } from './pairing.mjs'

const hit = (street: string, locality: string, kommun = `${locality} kommun`): SoporSearchHit => ({
  id: `${street}-${locality}`, street, locality, kommun, source: 'x', detail: null, url: `https://sopor.hardyson.se/${street}`,
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
