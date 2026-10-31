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
    expect(mapWasteType(text)).toEqual({ fractions: [fraction] })
  })

  it('kallar flerfackskärl för fyrfackskärl och behåller numret', () => {
    expect(mapWasteType('Fyrfack 1')).toEqual({ fractions: ['karl'], label: 'Fyrfackskärl 1' })
    expect(mapWasteType('Kärl 1', 'Måndag udda vecka. Fyrfack')).toEqual({ fractions: ['karl'], label: 'Fyrfackskärl 1' })
    expect(mapWasteType('FNI Kärl 2', '', 'Kärl, 370 L fyrfack. Kärl 2. Var 4:e vecka. Småhus')).toEqual({
      fractions: ['karl'],
      label: 'Fyrfackskärl 2',
    })
    expect(mapWasteType('Kärl 2', '', 'Kärl, 370 L flerfack. Kärl 2. Var 4:e vecka')).toEqual({ fractions: ['karl'], label: 'Fyrfackskärl 2' })
  })

  it('visar källans text när kärlet inte är ett flerfackskärl', () => {
    expect(mapWasteType('FNI Kärl 2')).toEqual({ fractions: ['karl'], label: 'FNI Kärl 2' })
  })

  it('läser fraktionskoderna i beskrivningen (Uppsala)', () => {
    expect(mapWasteType('Kärl 1', 'Onsdag jämn vecka', 'Kärl 1, MA PA TI ME. 370L varannan vecka')).toEqual({
      fractions: ['mat', 'papper', 'tidningar', 'metall'],
    })
    expect(mapWasteType('Kärl 2', '', 'Kärl 2, RE PL GF GO. 370L var fjärde vecka')).toEqual({
      fractions: ['rest', 'plast', 'glas'],
    })
  })

  it('gissar inte när en kod är okänd', () => {
    expect(mapWasteType('Kärl 1', '', 'Kärl 1, MA XX. 370L')).toEqual({ fractions: ['karl'], label: 'Kärl 1' })
  })

  it('hoppar över slam', () => {
    expect(mapWasteType('Slam')).toBeNull()
  })
})
