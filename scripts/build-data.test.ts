import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildMunicipality } from '@/data/static-format'
import { ALL_SOURCES } from '@/sources'
import { readKommunPages, readYears } from './build-data'

describe('seed-datan för Avesta', () => {
  const years = readYears(path.resolve(import.meta.dirname, '../data/avesta'))
  const out = buildMunicipality(years, ALL_SOURCES.find((s) => s.id === 'avesta')!)

  it('ger 11 adresser, 4 scheman och en .ics per adress', () => {
    expect(out.index.addresses).toHaveLength(11)
    expect(out.scheduleFiles).toHaveLength(4)
    expect(out.ics).toHaveLength(11)
  })

  it('har exempelvillans flyttade tömning', () => {
    const villa = out.index.addresses.find(([id]) => id === 'krylbo-storgatan-12b')!
    const schedule = out.scheduleFiles.find((s) => s.id === villa[3][0])!
    expect(schedule.events.find((e) => e.date === '2027-01-07')?.deviation).toEqual({
      originalDate: '2027-01-06',
      reason: 'trettondedag jul',
    })
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
