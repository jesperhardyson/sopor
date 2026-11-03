import { describe, expect, it } from 'vitest'
import { isKnownBin, mapWasteType } from './fractions-map'

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
    // Kungälv (säckar med osorterat) och Boden (brännbart kärl bredvid matavfallskärlet)
    ['Osorterat', 'rest'],
    ['Brännbart', 'rest'],
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

  it('läser komma som ett delat kärl (Ale), men bara när varje del är en fraktion', () => {
    expect(mapWasteType('Plast,Papp')).toEqual({ fractions: ['plast', 'papper'] })
    expect(mapWasteType('Restavfall, 190 l')).toEqual({ fractions: ['rest'] })
  })

  it('ger varje fraktion i ett delat kärl (Danderyd, Lycksele)', () => {
    expect(mapWasteType('Papper/Plast', '', '1 st 240 l kärl tvådelat för papper/plast')).toEqual({ fractions: ['papper', 'plast'] })
    expect(mapWasteType('Glas/Glas/Metal', '', '1 st 240 l kärl tredelat för glas/glas/metal')).toEqual({ fractions: ['glas', 'metall'] })
    expect(mapWasteType('Rest/matavfall')).toEqual({ fractions: ['rest', 'mat'] })
    // Lyckseles villor: "240 l tvåfackskärl"
    expect(mapWasteType('Mat-/Restavfall', '', '240 l tvåfackskärl/14 dgr')).toEqual({ fractions: ['mat', 'rest'] })
  })

  it('gissar inte när en del av ett delat kärl är okänd', () => {
    expect(mapWasteType('Papper/Textil')).toEqual({ fractions: ['karl'], label: 'Papper/Textil' })
  })

  it('läser "4-fackskärl" som fyrfackskärl, med numret ur beskrivningen (Lund)', () => {
    expect(mapWasteType('Rest/matavfall', 'Onsdag udda vecka ', 'Tömning av 4-fackskärl, kärl 1, varannan vecka')).toEqual({
      fractions: ['karl'],
      label: 'Fyrfackskärl 1',
    })
    expect(mapWasteType('Returmaterial', 'Onsdag var 4:e vecka startvecka 1 ', 'Tömning av 4-fackskärl, kärl 2, var 4:e vecka')).toEqual({
      fractions: ['karl'],
      label: 'Fyrfackskärl 2',
    })
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

  it('läser "Hushåll" som restavfall (VIVAB: matavfallet har ett eget kärl)', () => {
    expect(mapWasteType('Hushåll', 'Måndag jämn vecka ', '190l restavfallskärl helårstömning')).toEqual({ fractions: ['rest'] })
    expect(mapWasteType('Hushåll', 'Fredag udda vecka ', '660l kärl14 dagars tömning helår separat matavfallskärl')).toEqual({
      fractions: ['rest'],
    })
  })

  it('läser inte "Hushåll" som restavfall när det är ett flerfackskärl', () => {
    expect(mapWasteType('Hushåll', '', 'Kärl, 370 L fyrfack. Kärl 1')).toEqual({ fractions: ['karl'], label: 'Fyrfackskärl 1' })
    expect(mapWasteType('Hushåll', '', 'Kärl, 370 L fyrfack')).toEqual({ fractions: ['karl'], label: 'Fyrfackskärl' })
  })

  it('känner igen kärl som visas med källans egen text', () => {
    expect(isKnownBin('Trädgårdsavfall')).toBe(true)
    expect(isKnownBin('Batterier')).toBe(true)
    expect(isKnownBin('Grovavfall')).toBe(false)
  })

  it('hoppar över slam', () => {
    expect(mapWasteType('Slam')).toBeNull()
  })
})
