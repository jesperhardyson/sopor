import { describe, expect, it } from 'vitest'
import type { Address } from '@/domain/types'
import type { Source } from '@/sources'
import { getSource, SOURCES } from '@/sources'
import { mergeResults, providerFor } from './registry'

const a = (id: string, sourceId: string): Address => ({ id, street: id, locality: 'x', sourceId, kommun: 'x' })

describe('kommunregistret', () => {
  it('har Avesta med statisk provider', () => {
    expect(getSource('avesta')?.config).toEqual({ system: 'static' })
    expect(getSource('hedemora')).toBeUndefined()
    expect(SOURCES.map((m) => m.id)).toEqual(['avesta'])
  })
})

describe('providerFor', () => {
  it('ger en provider för statiska kommuner', () => {
    expect(providerFor(getSource('avesta')!).icsUrl('x')).toBe('/ics/avesta/x.ics')
  })

  it('säger tydligt att EDP inte är byggd än', () => {
    const edp: Source = { ...getSource('avesta')!, config: { system: 'edp', baseUrl: 'https://x' } }
    expect(() => providerFor(edp)).toThrow('EDP-provider ej implementerad')
  })
})

describe('mergeResults', () => {
  it('slår ihop flera kommuners träffar och hoppar över de som misslyckades', () => {
    const merged = mergeResults(
      [
        { status: 'fulfilled', value: [a('1', 'avesta')] },
        { status: 'rejected', reason: new Error('nere') },
        { status: 'fulfilled', value: [a('2', 'hedemora')] },
      ],
      8,
    )
    expect(merged.map((x) => x.id)).toEqual(['1', '2'])
  })

  it('kastar om alla kommuner misslyckades', () => {
    expect(() => mergeResults([{ status: 'rejected', reason: new Error('nere') }], 8)).toThrow('nere')
  })
})
