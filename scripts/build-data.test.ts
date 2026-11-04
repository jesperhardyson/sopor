import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isoWeek, weekdayIndex } from '@/domain/dates'
import { buildMunicipality } from '@/data/static-format'
import { ALL_SOURCES } from '@/sources'
import { readKommunPages, readYears } from './build-data'

describe('Avestas riktiga data för 2026', () => {
  const years = readYears(path.resolve(import.meta.dirname, '../data/avesta'))
  const out = buildMunicipality(years, ALL_SOURCES.find((s) => s.id === 'avesta')!)
  const areas = years[0].areas!.areas
  const events = (id: string) => out.scheduleFiles.find((s) => s.id === `2026-${id}`)!.events
  const fractionsOn = (id: string, date: string) => events(id).find((e) => e.date === date)?.fractions

  it('har tio områden utan adresser', () => {
    expect(areas.map((a) => a.id)).toEqual(Array.from({ length: 10 }, (_, i) => `trakt-${i + 1}`))
    expect(years[0].addresses).toEqual([])
    expect(out.index.addresses).toHaveLength(10)
  })

  it('har rätt dag och namn för trakt 7', () => {
    const trakt7 = areas.find((a) => a.id === 'trakt-7')!
    expect(trakt7).toMatchObject({ day: 'Tisdag, jämn vecka', name: 'Avesta tätort, Östanfors m.fl.' })
    expect(trakt7.otherDays).toHaveLength(1)
    expect(areas.filter((a) => a.id !== 'trakt-7').every((a) => a.otherDays.length === 0)).toBe(true)
  })

  it('har trakt 7:s datum och fraktioner', () => {
    const rest = events('trakt-7').filter((e) => e.date >= '2026-10-13')
    expect(rest.map((e) => [e.date, e.fractions])).toEqual([
      ['2026-10-13', ['mat', 'rest']],
      ['2026-10-27', ['mat', 'papper']],
      ['2026-11-10', ['mat', 'plast']],
      ['2026-11-24', ['mat', 'rest']],
      ['2026-12-08', ['mat', 'papper']],
      ['2026-12-22', ['mat', 'plast']],
    ])
  })

  it('har stickproven från PDF:en', () => {
    expect(fractionsOn('trakt-1', '2026-11-02')).toEqual(['mat', 'plast'])
    expect(fractionsOn('trakt-8', '2026-10-14')).toEqual(['mat'])
    expect(fractionsOn('trakt-10', '2026-10-30')).toEqual(['mat', 'plast'])
  })

  it('har varje datum på områdets veckodag och i rätt jämn eller udda vecka', () => {
    const weekdays: Record<string, number> = { Måndag: 1, Tisdag: 2, Onsdag: 3, Torsdag: 4, Fredag: 5 }
    for (const area of areas) {
      const [dayName, parity] = area.day.split(', ')
      expect(events(area.schedule).length).toBeGreaterThanOrEqual(8)
      for (const { date } of events(area.schedule)) {
        const where = `${area.id} ${date}`
        expect([where, weekdayIndex(date)]).toEqual([where, weekdays[dayName]])
        expect([where, isoWeek(date).week % 2 === 0 ? 'jämn vecka' : 'udda vecka']).toEqual([where, parity])
        expect(date >= '2026-09-01').toBe(true)
      }
    }
  })

  it('har alla områdets gator bland dess platser', () => {
    for (const area of areas) for (const street of area.streets) expect(area.places).toContain(street)
  })
})

describe('readYears med omraden.json', () => {
  it('läser omraden.json i stället för addresses.csv', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sopor-omraden-'))
    const year = path.join(dir, '2026')
    fs.mkdirSync(year)
    const schedules = path.resolve(import.meta.dirname, '../data/avesta/2026/schedules.json')
    fs.copyFileSync(schedules, path.join(year, 'schedules.json'))
    const schedule = Object.keys(JSON.parse(fs.readFileSync(schedules, 'utf8')).schedules)[0]
    const area = { id: 'omrade-1', name: 'Område 1', day: 'Tisdag', label: 'O1', schedule, places: [], streets: [], searchTerms: [], otherDays: [] }
    fs.writeFileSync(path.join(year, 'omraden.json'), JSON.stringify({ explanation: 'e', help: 'h', areas: [area] }))
    try {
      const years = readYears(dir)
      expect(years[0].addresses).toEqual([])
      expect(years[0].areas?.areas[0].id).toBe('omrade-1')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('kommunsidornas data', () => {
  it('har alla kommuner och räknar bara källor som syns på sajten', () => {
    const pages = readKommunPages()
    expect(pages).toHaveLength(290)
    expect(pages.find((p) => p.code === '2084')?.covered).toBe(false)
    expect(pages.find((p) => p.code === '0380')?.covered).toBe(true)
  })
})
