import { describe, expect, it } from 'vitest'
import { findRemovedIds } from './check-address-ids'

describe('findRemovedIds', () => {
  const base = new Map([
    ['data/avesta/2026/addresses.csv', ['krylbo-storgatan-12b', 'fors-storgatan-21']],
  ])

  it('godkänner nya adresser och nya år', () => {
    const head = new Map([
      ['data/avesta/2026/addresses.csv', ['krylbo-storgatan-12b', 'fors-storgatan-21', 'avesta-ny-1']],
      ['data/avesta/2027/addresses.csv', ['krylbo-storgatan-12b']],
    ])
    expect(findRemovedIds(base, head)).toEqual([])
  })

  it('hittar id som tagits bort eller bytt namn', () => {
    const head = new Map([['data/avesta/2026/addresses.csv', ['krylbo-storgatan-12-b', 'fors-storgatan-21']]])
    expect(findRemovedIds(base, head)).toEqual([{ file: 'data/avesta/2026/addresses.csv', id: 'krylbo-storgatan-12b' }])
  })

  it('hittar id i en fil som tagits bort helt', () => {
    expect(findRemovedIds(base, new Map())).toHaveLength(2)
  })
})
