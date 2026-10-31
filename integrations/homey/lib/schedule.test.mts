import { describe, expect, it } from 'vitest'
import type { SoporSchedule } from './api.mjs'
import { changeText, collectedOn, withoutFractions, daysToNext, fractionChoices, scheduleChanges, tomorrowText, fractionIds, fractionName, fractionsOn, nextDate, nextText, summary } from './schedule.mjs'

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

  it('sammanfattar vad som hämtas i morgon', () => {
    expect(tomorrowText(schedule, today)).toBe('Plast & metall')
    expect(tomorrowText(schedule, '2026-11-01')).toBe('Inget')
  })

  it('räknar dagar till nästa hämtning', () => {
    expect(daysToNext(schedule, today)).toBe(1)
    expect(daysToNext(schedule, '2026-11-05')).toBeNull()
  })

  it('klarar godtyckligt antal dagar framåt', () => {
    expect(collectedOn(schedule, today, 4, 'rest')).toBe(true)
    expect(collectedOn(schedule, today, 5, null)).toBe(false)
  })
})

describe('ändringar i schemat', () => {
  const event = (date: string, fractions: string[], reason?: string) => ({
    date, fractions, estimated: false, deviation: reason ? { originalDate: null, reason } : null, warning: null,
  })
  const withEvents = (events: SoporSchedule['events']): SoporSchedule => ({ ...schedule, events })

  it('hittar en flyttad hämtning med källans orsak', () => {
    const before = withEvents([event('2026-11-04', ['plast']), event('2026-11-06', ['rest'])])
    const after = withEvents([event('2026-11-05', ['plast'], 'Allhelgonahelgen'), event('2026-11-06', ['rest'])])
    expect(scheduleChanges(before, after, today)).toEqual([{ fraction: 'plast', from: '2026-11-04', to: '2026-11-05', reason: 'Allhelgonahelgen' }])
  })

  it('hittar en hämtning som försvunnit eller tillkommit', () => {
    const before = withEvents([event('2026-11-04', ['plast'])])
    const after = withEvents([event('2026-11-04', ['glas'])])
    expect(scheduleChanges(before, after, today)).toEqual([
      { fraction: 'plast', from: '2026-11-04', to: null, reason: null },
      { fraction: 'glas', from: null, to: '2026-11-04', reason: null },
    ])
  })

  it('räknar inte en passerad hämtning som en ändring', () => {
    const before = withEvents([event('2026-10-30', ['rest']), event('2026-11-06', ['rest'])])
    const after = withEvents([event('2026-11-06', ['rest'])])
    expect(scheduleChanges(before, after, today)).toEqual([])
  })

  it('beskriver ändringen i en mening', () => {
    expect(changeText(schedule, { fraction: 'plast', from: '2026-11-04', to: '2026-11-05', reason: null })).toBe('Plastförpackningar flyttas från ons 4 nov till tors 5 nov')
    expect(changeText(schedule, { fraction: 'plast', from: '2026-11-04', to: null, reason: null })).toBe('Plastförpackningar hämtas inte ons 4 nov')
    expect(changeText(schedule, { fraction: 'glas', from: null, to: '2026-11-04', reason: null })).toBe('glas hämtas ons 4 nov')
  })
})

describe('dolda fraktioner', () => {
  it('tar bort fraktionerna ur händelser och register, och tomma händelser helt', () => {
    const visible = withoutFractions(schedule, ['rest'])
    expect(visible.events.map((e) => [e.date, e.fractions])).toEqual([
      ['2026-11-01', ['plast', 'metall']],
      ['2026-11-04', ['kompost']],
    ])
    expect(Object.keys(visible.fractions)).toEqual(['plast', 'metall'])
  })

  it('lämnar schemat orört utan dolda fraktioner', () => {
    expect(withoutFractions(schedule, [])).toBe(schedule)
  })
})
