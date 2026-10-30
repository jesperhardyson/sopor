import { describe, expect, it } from 'vitest'
import type { Municipality } from '@/municipalities'
import {
  buildMunicipality,
  DataError,
  parseAddressesCsv,
  parseSchedulesFile,
  type AddressRow,
  type SchedulesFile,
} from './static-format'

const avesta: Municipality = {
  id: 'avesta',
  name: 'Avesta kommun',
  shortName: 'Avesta',
  operator: { name: 'AVA', url: 'https://x' },
  provider: { type: 'static' },
}

const schedulesJson = (over: Record<string, unknown> = {}) => ({
  year: 2026,
  source: 'test',
  validFrom: '2026-01-01',
  validTo: '2027-01-10',
  updatedAt: '2026-10-29',
  schedules: {
    'onsdag-jamn': { name: 'Trakt 4', events: [{ date: '2026-11-11', fractions: ['rest', 'mat'] }] },
  },
  ...over,
})

describe('parseAddressesCsv', () => {
  it('läser BOM, kommentarer och citerade fält', () => {
    const csv = '﻿# FAKE\nid,street,locality,schedule\r\n"krylbo-a-1","Storgatan 1, uppg. B",Krylbo,onsdag-jamn\n'
    expect(parseAddressesCsv(csv, 'a.csv')).toEqual([
      { id: 'krylbo-a-1', street: 'Storgatan 1, uppg. B', locality: 'Krylbo', schedule: 'onsdag-jamn' },
    ])
  })

  it('stoppar vid saknad kolumn och nämner filen', () => {
    expect(() => parseAddressesCsv('id,street,schedule\nx,y,z\n', 'data/a.csv')).toThrow(DataError)
    expect(() => parseAddressesCsv('id,street,schedule\nx,y,z\n', 'data/a.csv')).toThrow(/data\/a\.csv.*locality/)
  })
})

describe('parseSchedulesFile', () => {
  it('godkänner en giltig fil', () => {
    expect(parseSchedulesFile(schedulesJson(), 's.json').schedules['onsdag-jamn'].name).toBe('Trakt 4')
  })

  it('stoppar vid okänd fraktion och nämner schemat', () => {
    const bad = schedulesJson({ schedules: { trakt9: { name: 'x', events: [{ date: '2026-01-01', fractions: ['kompost'] }] } } })
    expect(() => parseSchedulesFile(bad, 's.json')).toThrow(/trakt9.*kompost/)
  })

  it('stoppar vid ogiltigt datum', () => {
    const bad = schedulesJson({ schedules: { t: { name: 'x', events: [{ date: '2026-02-30', fractions: ['rest'] }] } } })
    expect(() => parseSchedulesFile(bad, 's.json')).toThrow(DataError)
  })
})

describe('buildMunicipality', () => {
  const y2026: SchedulesFile = parseSchedulesFile(schedulesJson(), '2026.json')
  const y2027: SchedulesFile = parseSchedulesFile(
    schedulesJson({
      year: 2027,
      validFrom: '2027-01-01',
      validTo: '2028-01-10',
      updatedAt: '2026-12-15',
      schedules: { 'onsdag-udda': { name: 'Trakt 5', events: [{ date: '2027-01-13', fractions: ['mat'] }] } },
    }),
    '2027.json',
  )
  const row = (over: Partial<AddressRow>): AddressRow => ({
    id: 'krylbo-storgatan-12b',
    street: 'Storgatan 12 B',
    locality: 'Krylbo',
    schedule: 'onsdag-jamn',
    ...over,
  })

  it('stoppar när en adress pekar på ett schema som saknas', () => {
    expect(() =>
      buildMunicipality([{ year: 2026, schedules: y2026, addresses: [row({ schedule: 'finns-inte' })] }], avesta),
    ).toThrow(/finns-inte/)
  })

  it('stoppar vid dubblett av adress-id', () => {
    expect(() => buildMunicipality([{ year: 2026, schedules: y2026, addresses: [row({}), row({})] }], avesta)).toThrow(
      /dubblett/i,
    )
  })

  it('slår ihop år per adress och tar namn från det senaste året', () => {
    const out = buildMunicipality(
      [
        { year: 2026, schedules: y2026, addresses: [row({ street: 'Storgatn 12 B' }), row({ id: 'fors-gammal-1', street: 'Gammal 1', locality: 'Fors' })] },
        { year: 2027, schedules: y2027, addresses: [row({ schedule: 'onsdag-udda' })] },
      ],
      avesta,
    )
    expect(out.index.municipalityId).toBe('avesta')
    expect(out.index.updatedAt).toBe('2026-12-15')
    expect(out.index.addresses).toContainEqual(['krylbo-storgatan-12b', 'Storgatan 12 B', 'Krylbo', ['2026-onsdag-jamn', '2027-onsdag-udda']])
    // finns bara i det äldre året: får ändå index-post och .ics
    expect(out.index.addresses).toContainEqual(['fors-gammal-1', 'Gammal 1', 'Fors', ['2026-onsdag-jamn']])
    expect(out.ics.map((i) => i.addressId).sort()).toEqual(['fors-gammal-1', 'krylbo-storgatan-12b'])
    expect(out.scheduleFiles.map((s) => s.id).sort()).toEqual(['2026-onsdag-jamn', '2027-onsdag-udda'])
    expect(out.scheduleFiles.find((s) => s.id === '2027-onsdag-udda')).toMatchObject({
      validFrom: '2027-01-01',
      validTo: '2028-01-10',
      updatedAt: '2026-12-15',
    })
  })

  it('bygger .ics med händelser från alla år', () => {
    const out = buildMunicipality(
      [
        { year: 2026, schedules: y2026, addresses: [row({})] },
        { year: 2027, schedules: y2027, addresses: [row({ schedule: 'onsdag-udda' })] },
      ],
      avesta,
    )
    const ics = out.ics.find((i) => i.addressId === 'krylbo-storgatan-12b')!.content
    expect(ics).toContain('DTSTART;VALUE=DATE:20261111')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270113')
  })
})
