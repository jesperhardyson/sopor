import { describe, expect, it } from 'vitest'
import { findRemovedIds, isAddressFile, RETIRED_FAKE_IDS } from './check-address-ids'

describe('findRemovedIds', () => {
  const base = new Map([
    ['data/avesta/2026/addresses.csv', ['exempel-kungsgatan-12b', 'exempel-storgatan-21']],
  ])

  it('godkänner nya adresser och nya år', () => {
    const head = new Map([
      ['data/avesta/2026/addresses.csv', ['exempel-kungsgatan-12b', 'exempel-storgatan-21', 'avesta-ny-1']],
      ['data/avesta/2027/addresses.csv', ['exempel-kungsgatan-12b']],
    ])
    expect(findRemovedIds(base, head)).toEqual([])
  })

  it('hittar id som tagits bort eller bytt namn', () => {
    const head = new Map([['data/avesta/2026/addresses.csv', ['exempel-kungsgatan-12-b', 'exempel-storgatan-21']]])
    expect(findRemovedIds(base, head)).toEqual([{ file: 'data/avesta/2026/addresses.csv', id: 'exempel-kungsgatan-12b' }])
  })

  it('hittar id i en fil som tagits bort helt', () => {
    expect(findRemovedIds(base, new Map())).toHaveLength(2)
  })
})

describe('påhittade id', () => {
  const file = 'data/avesta/2026/addresses.csv'
  const base = new Map([[file, [...RETIRED_FAKE_IDS, 'riktigt-id']]])

  it('tillåter att de påhittade id:na försvinner', () => {
    expect(RETIRED_FAKE_IDS).toContain('krylbo-storgatan-12b')
    expect(findRemovedIds(base, new Map([[file, ['riktigt-id']]]))).toEqual([])
  })

  it('stoppar andra borttagna id', () => {
    expect(findRemovedIds(base, new Map([[file, []]]))).toEqual([{ file, id: 'riktigt-id' }])
  })
})

describe('isAddressFile', () => {
  it('räknar både addresses.csv och omraden.json som adressfil', () => {
    expect(isAddressFile('data/avesta/2026/addresses.csv')).toBe(true)
    expect(isAddressFile('data/avesta/2026/omraden.json')).toBe(true)
    expect(isAddressFile('data/avesta/2026/schedules.json')).toBe(false)
  })

  it('stoppar ett borttaget trakt-7', () => {
    const f = 'data/avesta/2026/omraden.json'
    expect(findRemovedIds(new Map([[f, ['trakt-7']]]), new Map([[f, []]]))).toEqual([{ file: f, id: 'trakt-7' }])
  })
})
