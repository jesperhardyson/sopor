import { describe, expect, it } from 'vitest'
import { mapWasteType } from './fractions-map'

describe('mapWasteType', () => {
  it.each([
    ['Restavfall', 'rest'],
    ['RESTAVFALL', 'rest'],
    ['Matavfall', 'mat'],
    ['Pappersförp.', 'papper'],
    ['Plastförp.', 'plast'],
    ['Glasförp.färg', 'glas'],
    ['Glasförp.ofärg', 'glas'],
    ['Metallförp.', 'metall'],
    ['Tidningar', 'tidningar'],
  ])('%s blir %s', (text, fraction) => {
    expect(mapWasteType(text)).toEqual({ fraction })
  })

  it('visar kärl med flera fraktioner med källans text', () => {
    expect(mapWasteType('Fyrfack 1')).toEqual({ fraction: 'karl', label: 'Fyrfack 1' })
    expect(mapWasteType('Kärl 1', 'Måndag udda vecka. Fyrfack')).toEqual({ fraction: 'karl', label: 'Kärl 1 – fyrfack' })
    expect(mapWasteType('FNI Kärl 2')).toEqual({ fraction: 'karl', label: 'FNI Kärl 2' })
  })

  it('hoppar över slam', () => {
    expect(mapWasteType('Slam')).toBeNull()
  })
})
