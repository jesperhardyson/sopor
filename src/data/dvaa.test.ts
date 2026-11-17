import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { addDays, weekdayIndex } from '@/domain/dates'

// Dala Vatten och Avfalls scheman per trakt (docs/specs/2026-11-17-dala-vatten-och-avfall.md). Källan
// har skrivfel, så varje datum kontrolleras mot traktens veckodag och fraktionens steg.
const read = (file: string) => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../..', file), 'utf8'))
const KOMMUNER = { gagnef: 10, leksand: 10, rattvik: 8, vansbro: 7 }
const WEEKDAY: Record<string, number> = { mandag: 1, tisdag: 2, onsdag: 3, torsdag: 4, fredag: 5 }
const STEP: Record<string, number> = { mat: 14, rest: 42, plast: 42, papper: 42 }

type Events = { date: string; fractions: string[] }[]

describe.each(Object.entries(KOMMUNER))('Dala Vatten och Avfall i %s', (kommun, count) => {
  const schedules: Record<string, { events: Events }> = read(`data/dvaa-${kommun}/2026/schedules.json`).schedules
  const areas: { id: string; schedule: string; label: string; searchTerms: string[] }[] = read(`data/dvaa-${kommun}/2026/omraden.json`).areas

  it('har ett område per trakt, med id efter dag och vecka', () => {
    expect(areas).toHaveLength(count)
    for (const a of areas) {
      expect(a.id).toMatch(/^(jamn|udda)-(mandag|tisdag|onsdag|torsdag|fredag)$/)
      expect(a.schedule).toBe(a.id)
      expect(a.searchTerms).toContain(`trakt ${a.label.replace('Område ', '')}`)
      expect(schedules[a.id]).toBeDefined()
    }
  })

  it.each(Object.keys(STEP))('har %s på traktens veckodag med rätt steg', (fraction) => {
    for (const [id, { events }] of Object.entries(schedules)) {
      const dates = events.filter((e) => e.fractions.includes(fraction)).map((e) => e.date)
      expect(dates.length, `${id} ${fraction}`).toBeGreaterThan(6)
      for (const date of dates) expect(weekdayIndex(date), `${id} ${date}`).toBe(WEEKDAY[id.split('-')[1]])
      dates.slice(1).forEach((date, i) => expect(date, `${id} ${fraction} efter ${dates[i]}`).toBe(addDays(dates[i], STEP[fraction])))
    }
  })
})

describe('Dala Vatten och Avfalls sökord', () => {
  const terms = (kommun: string, id: string) => read(`data/dvaa-${kommun}/2026/omraden.json`).areas.find((a: { id: string }) => a.id === id).searchTerms

  it('låter en exakt ort inte dölja ett område där den är en del av namnet', () => {
    expect(terms('leksand', 'jamn-mandag')).toEqual(expect.arrayContaining(['Heden', 'Tällberg']))
    expect(terms('rattvik', 'jamn-onsdag')).toContain('Boda')
    expect(terms('gagnef', 'udda-mandag')).toContain('Tjärna')
  })
})

describe('Dala Vatten och Avfalls rättningar', () => {
  const dates = (kommun: string, id: string, fraction: string) =>
    (read(`data/dvaa-${kommun}/2026/schedules.json`).schedules[id].events as Events).filter((e) => e.fractions.includes(fraction)).map((e) => e.date)

  it('läser 1 januari sist i listan som nästa år', () => {
    expect(dates('gagnef', 'udda-fredag', 'mat').at(-1)).toBe('2027-01-01')
    expect(dates('leksand', 'udda-fredag', 'plast').at(-1)).toBe('2027-01-01')
  })

  it('rättar källans skrivfel som specen räknar upp', () => {
    expect(dates('gagnef', 'udda-fredag', 'rest')).toContain('2026-04-10')
    expect(dates('gagnef', 'udda-fredag', 'plast')).toEqual(expect.arrayContaining(['2026-11-20', '2027-01-01']))
    expect(dates('gagnef', 'udda-fredag', 'plast')).not.toContain('2026-12-01')
    expect(dates('gagnef', 'jamn-torsdag', 'mat')[0]).toBe('2026-01-08')
    expect(dates('leksand', 'udda-tisdag', 'rest')).toContain('2026-02-24')
    expect(dates('leksand', 'udda-onsdag', 'rest')).toContain('2026-05-06')
    expect(dates('vansbro', 'jamn-tisdag', 'papper')).toContain('2026-02-17')
  })
})
