import { describe, expect, it } from 'vitest'
import { enterTarget, fairShare, groupByKommun, matchedTerm, normalize, searchAddresses, stableMerge, suggest } from './search'
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
    expect(ids(stableMerge(shown, [x('c', 'orebro'), x('b', 'boras'), x('a')]))).toEqual(['uppsala/a', 'boras/b', 'orebro/c'])
  })

  it('tar bort rader som inte längre finns i svaret, t.ex. när man skrivit vidare', () => {
    expect(ids(stableMerge([x('a'), x('b')], [x('b'), x('c')]))).toEqual(['uppsala/b', 'uppsala/c'])
  })

  it('skiljer på samma id från olika källor', () => {
    expect(ids(stableMerge([x('a', 'boras')], [x('a'), x('a', 'boras')]))).toEqual(['boras/a', 'uppsala/a'])
  })

  it('använder det nya svarets data, t.ex. kommunen, för rader som står kvar', () => {
    const fresh = { ...x('a'), kommun: 'Uppsala kommun' }
    expect(stableMerge([x('a')], [fresh])[0].kommun).toBe('Uppsala kommun')
  })

  it('ger det nya svaret som det är när inget syns', () => {
    expect(ids(stableMerge([], [x('b'), x('a')]))).toEqual(['uppsala/b', 'uppsala/a'])
  })
})

describe('enterTarget', () => {
  const horn = (nr: string, locality: string) => a(`${locality}-${nr}`, `Hornsgatan ${nr}`, locality)

  it('väljer den enda raden', () => {
    expect(enterTarget('hornsg', [horn('10', 'Boden')])?.id).toBe('Boden-10')
  })

  it('väljer den enda raden med rätt husnummer, även om den inte står först', () => {
    expect(enterTarget('Hornsgatan 1', [horn('10', 'Boden'), horn('1', 'Kalmar')])?.id).toBe('Kalmar-1')
  })

  it('väljer inget när bara andra husnummer finns', () => {
    expect(enterTarget('Hornsgatan 1', [horn('10', 'Boden'), horn('12', 'Boden')])).toBeUndefined()
  })

  it('väljer inget när adressen finns på flera orter', () => {
    expect(enterTarget('Hornsgatan 1', [horn('1', 'Borås'), horn('1', 'Kalmar')])).toBeUndefined()
  })

  it('skiljer dem åt när orten står med', () => {
    expect(enterTarget('Hornsgatan 1, Kalmar', [horn('1', 'Borås'), horn('1', 'Kalmar')])?.id).toBe('Kalmar-1')
  })

  it('väljer inget när flera byggnader har samma adress', () => {
    const twins = [horn('1', 'Kalmar'), { ...horn('1', 'Kalmar'), id: 'annan', detail: 'Byggnad 2' }]
    expect(enterTarget('Hornsgatan 1', twins)).toBeUndefined()
  })

  it('räknar husbokstaven som en del av adressen', () => {
    expect(enterTarget('storgatan 12 b', [a('x', 'Storgatan 12 B', 'Krylbo'), a('y', 'Storgatan 12', 'Avesta')])?.id).toBe('x')
  })
})

describe('områdessökning', () => {
  const area = (id: string, street: string, searchTerms: string[]): Address => ({ ...a(id, street, 'Avesta'), searchTerms })
  const AREAS: Address[] = [
    area('trakt-1', 'Trakt 1', ['trakt 1', 'Stallgatan', 'Askön']),
    area('trakt-10', 'Trakt 10', ['trakt 10', 'Horndal tätort']),
    area('trakt-2', 'Trakt 2', ['Backa']),
    area('trakt-4', 'Trakt 4', ['Backa']),
    area('trakt-7', 'Avesta tätort, Östanfors m.fl.', []),
  ]

  it('områden hittas på sitt namn', () => {
    expect(ids(searchAddresses('Avesta tätort', AREAS))).toEqual(['trakt-7'])
    expect(ids(searchAddresses('AVESTA TÄTORT', AREAS))).toEqual(['trakt-7'])
  })

  it('områden hittas på sökord', () => {
    expect(ids(searchAddresses('Askön', AREAS))).toEqual(['trakt-1'])
  })

  it('ett exakt sökord utesluter längre', () => {
    expect(ids(searchAddresses('trakt 1', AREAS))).toEqual(['trakt-1'])
  })

  it('alla områden med samma namn visas', () => {
    expect(ids(searchAddresses('Backa', AREAS))).toEqual(['trakt-2', 'trakt-4'])
  })

  it('gata i listan med nummer', () => {
    expect(ids(searchAddresses('Stallgatan 5', AREAS))).toEqual(['trakt-1'])
    expect(ids(searchAddresses('Stallgatan 5 B', AREAS))).toEqual(['trakt-1'])
  })

  it('orelaterad gata ger inget', () => {
    expect(searchAddresses('Kungsgatan 12', AREAS)).toEqual([])
  })

  it('ord får inte hämtas från olika sökord', () => {
    expect(searchAddresses('Askön Stallgatan', AREAS)).toEqual([])
  })

  it('adresser utan sökord fungerar som förut', () => {
    expect(ids(searchAddresses('storgatan 12b', [...AREAS, ...ADDRESSES]))).toEqual(['krylbo-storgatan-12b'])
  })

  describe('matchedTerm', () => {
    it('ger sökordet som gav träff', () => {
      expect(matchedTerm('Backa', AREAS[2])).toBe('Backa')
    })

    it('ger null när namnet redan visar träffen', () => {
      expect(matchedTerm('Avesta tätort', AREAS[4])).toBeNull()
    })

    it('ger null för en adress utan sökord', () => {
      expect(matchedTerm('Storgatan', ADDRESSES[0])).toBeNull()
    })
  })
})
