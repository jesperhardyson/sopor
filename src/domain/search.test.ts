import { describe, expect, it } from 'vitest'
import { groupByKommun, normalize, searchAddresses, suggest } from './search'
import type { Address } from './types'

const a = (id: string, street: string, locality: string): Address => ({ id, street, locality, sourceId: 'avesta', kommun: 'Avesta kommun' })

const ADDRESSES: Address[] = [
  a('krylbo-storgatan-12b', 'Storgatan 12 B', 'Krylbo'),
  a('avesta-storgatan-12', 'Storgatan 12', 'Avesta'),
  a('fors-storgatan-21', 'Storgatan 21', 'Fors'),
  a('horndal-bergsvagen-4', 'Bergsvägen 4', 'Horndal'),
  a('avesta-kyrkogatan-3', 'Kyrkogatan 3', 'Avesta'),
  a('horndal-bruksgatan-2', 'Bruksgatan 2', 'Horndal'),
  a('fors-asgatan-9', 'Åsgatan 9', 'Fors'),
  a('horndal-smedjebacksvagen-30', 'Smedjebacksvägen 30', 'Horndal'),
]

const ids = (list: Address[]) => list.map((x) => x.id)

describe('normalize', () => {
  it('gör gemener, trimmar och slår ihop husnummer med bokstav', () => {
    expect(normalize('  Storgatan  12 B ')).toBe('storgatan 12b')
  })

  it('tar bort diakriter utom å, ä och ö', () => {
    expect(normalize('Café')).toBe('cafe')
    expect(normalize('Åsgatan')).toBe('åsgatan')
    expect(normalize('ÄLVVÄGEN')).toBe('älvvägen')
  })
})

describe('searchAddresses', () => {
  it('hittar alla Storgatan', () => {
    expect(ids(searchAddresses('storg', ADDRESSES)).sort()).toEqual(
      ['avesta-storgatan-12', 'fors-storgatan-21', 'krylbo-storgatan-12b'].sort(),
    )
  })

  it('tolkar 12b och 12 B likadant', () => {
    expect(ids(searchAddresses('storgatan 12b', ADDRESSES))).toEqual(['krylbo-storgatan-12b'])
    expect(ids(searchAddresses('STORGATAN 12 B', ADDRESSES))).toEqual(['krylbo-storgatan-12b'])
  })

  it('hittar adresser på ort', () => {
    expect(ids(searchAddresses('horndal', ADDRESSES)).sort()).toEqual(
      ['horndal-bergsvagen-4', 'horndal-bruksgatan-2', 'horndal-smedjebacksvagen-30'].sort(),
    )
  })

  it('bryr sig inte om ordningen på orden', () => {
    expect(ids(searchAddresses('krylbo storg', ADDRESSES))).toEqual(['krylbo-storgatan-12b'])
  })

  it('kräver minst två tecken', () => {
    expect(searchAddresses('s', ADDRESSES)).toEqual([])
  })

  it('skiljer på å och a', () => {
    expect(searchAddresses('asgatan', ADDRESSES)).toEqual([])
  })

  it('rangordnar gator som börjar med frågan först', () => {
    const list = [a('x-1', 'Lillgatan 1', 'Kyrkby'), a('x-2', 'Kyrkogatan 1', 'Avesta')]
    expect(ids(searchAddresses('kyrk', list))).toEqual(['x-2', 'x-1'])
  })

  it('begränsar antalet träffar', () => {
    expect(searchAddresses('gatan', ADDRESSES, 2)).toHaveLength(0)
    expect(searchAddresses('st', ADDRESSES, 2)).toHaveLength(2)
  })
})

describe('suggest', () => {
  it('föreslår Storgatan 12 för felstavningen Storgtan 12', () => {
    const result = suggest('Storgtan 12', ADDRESSES)
    expect(result[0].id).toBe('avesta-storgatan-12')
    expect(ids(result)).not.toContain('krylbo-storgatan-12b')
  })

  it('föreslår inget för helt okända gator', () => {
    expect(suggest('xyzvägen 1', ADDRESSES)).toEqual([])
  })
})

describe('searchAddresses medan man skriver orten', () => {
  it('hittar adressen när en ensam bokstav efter numret är början på orten', () => {
    expect(ids(searchAddresses('storgatan 12 k', ADDRESSES))).toEqual(['krylbo-storgatan-12b'])
  })
})

describe('groupByKommun', () => {
  const k = (id: string, kommun: string): Address => ({ ...a(id, id, id), kommun })

  it('grupperar i den ordning kommunerna först dyker upp och behåller träffarnas ordning', () => {
    const groups = groupByKommun([k('1', 'Avesta kommun'), k('2', 'Säters kommun'), k('3', 'Avesta kommun')])
    expect(groups.map((g) => [g.kommun, ids(g.addresses)])).toEqual([
      ['Avesta kommun', ['1', '3']],
      ['Säters kommun', ['2']],
    ])
  })

  it('ger inga grupper för en tom lista', () => {
    expect(groupByKommun([])).toEqual([])
  })
})
