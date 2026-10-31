import { describe, expect, it } from 'vitest'
import type { SoporSchedule } from './api.mjs'
import { collectedOn, fractionChoices, fractionIds, fractionName, fractionsOn, nextDate, nextText, summary } from './schedule.mjs'

const fraction = (name: string, short: string) => ({ name, short, color: '#000000', icon: 'trash-2' })

const schedule: SoporSchedule = {
  apiVersion: '1',
  today: '2026-10-30',
  address: { id: 'storgatan-2_uppsala-1', street: 'Storgatan 2', locality: 'Uppsala', kommun: 'Uppsala kommun', source: 'uppsala', detail: null },
  events: [
    { date: '2026-10-30', fractions: ['rest'], estimated: false, deviation: null, warning: null },
    { date: '2026-11-01', fractions: ['plast', 'metall'], estimated: false, deviation: null, warning: null },
    { date: '2026-11-04', fractions: ['rest', 'kompost'], estimated: true, deviation: null, warning: null },
  ],
  fractions: {
    rest: fraction('Restavfall', 'Rest'),
    plast: fraction('Plastförpackningar', 'Plast'),
    metall: fraction('Metall', 'Metall'),
  },
  links: { ics: 'https://sopor.hardyson.se/ics/x.ics', web: 'https://sopor.hardyson.se/x' },
}

// Svaret hämtades i går. "I dag" är nu den 31 oktober.
const today = '2026-10-31'

describe('schemat', () => {
  it('räknar från dagens datum, inte svarets', () => {
    expect(collectedOn(schedule, today, 1, 'plast')).toBe(true)
    expect(collectedOn(schedule, today, 0, 'rest')).toBe(false)
    expect(nextDate(schedule, today, 'rest')).toBe('2026-11-04')
  })

  it('klarar "någon fraktion"', () => {
    expect(collectedOn(schedule, today, 1, null)).toBe(true)
    expect(collectedOn(schedule, today, 2, null)).toBe(false)
  })

  it('listar fraktionerna en viss dag', () => {
    expect(fractionsOn(schedule, today, 1)).toEqual(['plast', 'metall'])
    expect(fractionsOn(schedule, today, 0)).toEqual([])
  })

  it('tar med fraktioner som bara finns i events', () => {
    expect(fractionIds(schedule)).toEqual(['rest', 'plast', 'metall', 'kompost'])
  })

  it('visar okända fraktions-id som de är', () => {
    expect(fractionName(schedule, 'plast')).toBe('Plastförpackningar')
    expect(fractionName(schedule, 'kompost')).toBe('kompost')
  })

  it('sammanfattar nästa hämtning som API:t gör', () => {
    expect(summary(schedule, today)).toBe('Plast & metall – i morgon')
    expect(summary(schedule, '2026-11-05')).toBe('Inga kommande hämtningar')
  })

  it('börjar texten för nästa hämtning med den relativa dagen', () => {
    expect(nextText(schedule, today, 'plast')).toMatch(/^i morgon/)
    expect(nextText(schedule, today, 'rest')).toMatch(/^om 4 dagar/)
    expect(nextText(schedule, '2026-11-05', 'rest')).toBe('Inga kommande hämtningar')
  })

  it('ger val till autocomplete, filtrerade på det användaren skriver', () => {
    expect(fractionChoices(schedule, '', 'Någon fraktion').map((c) => c.id)).toEqual(['*', 'rest', 'plast', 'metall', 'kompost'])
    expect(fractionChoices(schedule, 'pla', 'Någon fraktion')).toEqual([{ id: 'plast', name: 'Plastförpackningar' }])
    expect(fractionChoices(schedule, 'NÅG', 'Någon fraktion')).toEqual([{ id: '*', name: 'Någon fraktion' }])
  })
})
