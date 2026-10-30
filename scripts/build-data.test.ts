import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildMunicipality } from '@/data/static-format'
import { getSource } from '@/sources'
import { readYears } from './build-data'

describe('seed-datan för Avesta', () => {
  const years = readYears(path.resolve(import.meta.dirname, '../data/avesta'))
  const out = buildMunicipality(years, getSource('avesta')!)

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
