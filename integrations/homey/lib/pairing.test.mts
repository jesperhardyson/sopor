import { describe, expect, it } from 'vitest'
import type { SoporSearchHit, SoporSource } from './api.mjs'
import { kommunChoices, parseKommun, searchOutcome } from './pairing.mjs'

const source = (id: string, kommuner: string[]): SoporSource => ({
  id,
  name: id,
  kommuner: kommuner.map((name, i) => ({ code: `${id}${i}`, name })),
})

const hit = (street: string, kommun: string): SoporSearchHit => ({
  id: street, street, locality: 'Ort', kommun, source: 'vafab', detail: null, url: `https://sopor.hardyson.se/${street}`,
})

const vafab = source('vafab', ['Västerås stad', 'Arboga kommun', 'Enköpings kommun'])

describe('parningen', () => {
  it('listar alla kommuner i bokstavsordning med källan i nyckeln', () => {
    const choices = kommunChoices([source('vafab', ['Västerås stad', 'Arboga kommun']), source('orebro', ['Örebro kommun'])])
    expect(choices).toEqual([
      { key: 'vafab|Arboga kommun', name: 'Arboga kommun' },
      { key: 'vafab|Västerås stad', name: 'Västerås stad' },
      { key: 'orebro|Örebro kommun', name: 'Örebro kommun' },
    ])
  })

  it('läser tillbaka källa och kommun ur nyckeln', () => {
    expect(parseKommun('vafab|Västerås stad')).toEqual({ source: 'vafab', kommun: 'Västerås stad' })
    expect(parseKommun('trasig')).toBeNull()
  })

  it('behåller bara träffar i vald kommun, eftersom en källa kan täcka flera', () => {
    const addresses = [hit('Storgatan 1', 'Västerås stad'), hit('Storgatan 1', 'Arboga kommun')]
    const outcome = searchOutcome({ addresses, failed: [] }, 'Arboga kommun', vafab)
    expect(outcome.result).toBe('found')
    expect(outcome.hits.map((h) => h.kommun)).toEqual(['Arboga kommun'])
  })

  it('ber om husnummer när källans tio träffar alla ligger i andra kommuner', () => {
    const addresses = Array.from({ length: 10 }, (_, i) => hit(`Storgatan ${i}`, 'Enköpings kommun'))
    expect(searchOutcome({ addresses, failed: [] }, 'Västerås stad', vafab)).toEqual({ result: 'tooMany', hits: [] })
  })

  it('skiljer på att källan inte svarade och att inget hittades', () => {
    expect(searchOutcome({ addresses: [], failed: ['vafab'] }, 'Västerås stad', vafab).result).toBe('failed')
    expect(searchOutcome({ addresses: [], failed: [] }, 'Västerås stad', vafab).result).toBe('none')
  })

  it('behåller träffar i kommuner som källan inte listar (grannkommuner och okända orter)', () => {
    const addresses = [hit('Storgatan 1', 'Oskarshamns kommun'), hit('Storgatan 2', 'Enköpings kommun')]
    const outcome = searchOutcome({ addresses, failed: [] }, 'Västerås stad', vafab)
    expect(outcome.hits.map((h) => h.kommun)).toEqual(['Oskarshamns kommun'])
  })
})
