import { describe, expect, it } from 'vitest'
import { buildPlaceLookup, kommunerForPlace, placeNames } from './sweden-places'

describe('placeNames', () => {
  it('delar upp småorter med flera namn', () => {
    expect(placeNames('Backa, Kamperöd, Berg och Skogen')).toEqual(['Backa', 'Kamperöd', 'Berg', 'Skogen'])
  })

  it('tar bort förklaringar inom parentes', () => {
    expect(placeNames('Kagghamra (norra delen)')).toEqual(['Kagghamra'])
  })

  it('lämnar vanliga namn som de är', () => {
    expect(placeNames('Stockholm')).toEqual(['Stockholm'])
  })
})

describe('kommunerForPlace', () => {
  const lookup = buildPlaceLookup({
    source: 'Wikidata (CC0)',
    updatedAt: '2026-11-02',
    kommuner: { '0180': 'Stockholms kommun', '0162': 'Danderyds kommun', '2083': 'Hedemora kommun', '0980': 'Region Gotland', '1490': 'Borås kommun' },
    orter: { Stockholm: ['0162', '0180'], Djursholm: ['0162'], Långshyttan: ['2083'], Kil: ['0162', '2083'] },
  })

  it('ger kommunen för en ort', () => {
    expect(kommunerForPlace(lookup, 'Långshyttan')).toEqual(['2083'])
  })

  it('bryr sig inte om skiftläge', () => {
    expect(kommunerForPlace(lookup, 'LÅNGSHYTTAN')).toEqual(['2083'])
  })

  it('väljer kommunen med samma namn när orten ligger i flera', () => {
    expect(kommunerForPlace(lookup, 'Stockholm')).toEqual(['0180'])
  })

  it('ger alla kommuner för en ort som ligger i flera utan namnlik kommun', () => {
    expect(kommunerForPlace(lookup, 'Kil')).toEqual(['0162', '2083'])
  })

  it('känner igen kommunnamn, med och utan genitiv', () => {
    expect(kommunerForPlace(lookup, 'Hedemora')).toEqual(['2083'])
    expect(kommunerForPlace(lookup, 'Danderyd')).toEqual(['0162'])
    expect(kommunerForPlace(lookup, 'Borås')).toEqual(['1490'])
    expect(kommunerForPlace(lookup, 'Gotland')).toEqual(['0980'])
  })

  it('ger en tom lista för okända orter och halvskrivna namn', () => {
    expect(kommunerForPlace(lookup, 'Stokholm')).toEqual([])
    expect(kommunerForPlace(lookup, 'Stockh')).toEqual([])
    expect(kommunerForPlace(lookup, '')).toEqual([])
  })
})
