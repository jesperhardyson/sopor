import { describe, expect, it } from 'vitest'
import { fairShare, groupByKommun, normalize, searchAddresses, stableMerge, suggest } from './search'
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

describe('fairShare', () => {
  const k = (id: string, kommun: string): Address => ({ ...a(id, id, id), kommun })

  it('ger varje kommun sin tur, så att en kommun med många träffar inte tränger ut de andra', () => {
    const many = Array.from({ length: 10 }, (_, i) => k(`b${i}`, 'Borås kommun'))
    const list = [...many, k('f1', 'Falkenbergs kommun'), k('f2', 'Falkenbergs kommun'), k('u1', 'Uppsala kommun')]
    expect(ids(fairShare(list, 6))).toEqual(['b0', 'b1', 'b2', 'f1', 'f2', 'u1'])
  })

  it('fyller platserna som andra kommuner inte behöver', () => {
    const list = [k('b0', 'Borås kommun'), k('b1', 'Borås kommun'), k('b2', 'Borås kommun'), k('u1', 'Uppsala kommun')]
    expect(ids(fairShare(list, 3))).toEqual(['b0', 'b1', 'u1'])
  })

  it('lämnar listan orörd när den ryms', () => {
    const list = [k('u1', 'Uppsala kommun'), k('b0', 'Borås kommun')]
    expect(fairShare(list, 12)).toEqual(list)
  })
})

describe('stableMerge', () => {
  const x = (id: string, sourceId = 'uppsala'): Address => ({ id, street: id, locality: 'x', sourceId, kommun: sourceId })
  const ids = (list: Address[]) => list.map((r) => `${r.sourceId}/${r.id}`)

  it('behåller ordningen för rader som redan syns och lägger nya sist', () => {
    const shown = [x('a'), x('b', 'boras')]
    expect(ids(stableMerge(shown, [x('c', 'orebro'), x('b', 'boras'), x('a')], 12))).toEqual(['uppsala/a', 'boras/b', 'orebro/c'])
  })

  it('tar bort rader som inte längre finns i svaret, t.ex. när man skrivit vidare', () => {
    expect(ids(stableMerge([x('a'), x('b')], [x('b'), x('c')], 12))).toEqual(['uppsala/b', 'uppsala/c'])
  })

  it('skiljer på samma id från olika källor', () => {
    expect(ids(stableMerge([x('a', 'boras')], [x('a'), x('a', 'boras')], 12))).toEqual(['boras/a', 'uppsala/a'])
  })

  it('använder det nya svarets data, t.ex. kommunen, för rader som står kvar', () => {
    const fresh = { ...x('a'), kommun: 'Uppsala kommun' }
    expect(stableMerge([x('a')], [fresh], 12)[0].kommun).toBe('Uppsala kommun')
  })

  it('fördelar platserna per kommun när inget syns än', () => {
    const many = [...Array.from({ length: 11 }, (_, i) => x(`u${i}`)), x('b', 'boras')]
    const merged = stableMerge([], many, 4)
    expect(merged).toHaveLength(4)
    expect(ids(merged)).toContain('boras/b')
  })

  it('håller sig till gränsen första gången, även med fler kommuner än platser', () => {
    const kommuner = Array.from({ length: 6 }, (_, i) => x('a', `k${i}`))
    expect(stableMerge([], kommuner, 4)).toHaveLength(4)
  })

  it('tar aldrig bort en rad som syns för att ge plats åt en annan kommun', () => {
    const shown = [x('u1'), x('u2'), x('u3')]
    const merged = stableMerge(shown, [...shown, x('u4'), x('b', 'boras')], 3)
    expect(ids(merged).slice(0, 3)).toEqual(['uppsala/u1', 'uppsala/u2', 'uppsala/u3'])
  })

  it('ger en kommun som svarar sent en rad längst ner, även när listan är full', () => {
    const shown = [x('u1'), x('u2'), x('u3')]
    const merged = stableMerge(shown, [...shown, x('u4'), x('b', 'boras')], 3)
    expect(ids(merged)).toEqual(['uppsala/u1', 'uppsala/u2', 'uppsala/u3', 'boras/b'])
  })
})
