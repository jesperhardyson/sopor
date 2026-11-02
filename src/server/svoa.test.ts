import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SourceError } from './http'
import {
  parseSvoaAddress,
  queryFromSvoaId,
  sameSvoaAddress,
  svoaAddressId,
  svoaFractions,
  svoaSchedule,
  svoaSearch,
  svoaStep,
  type SvoaAddress,
} from './svoa'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')

function fakeFetch(body: string, contentType = 'application/json; charset=utf-8') {
  return vi.fn(async () => new Response(body, { headers: { 'Content-Type': contentType } })) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>
}

const address = (raw: string) => parseSvoaAddress(raw) as SvoaAddress
const ID = 'hjortronvägen-3_bromma-16859'

describe('adresser och id', () => {
  it('delar upp SVOA:s adress i gata, ort och postnummer', () => {
    expect(parseSvoaAddress('Hjortronvägen 3, Bromma, 168 59')).toEqual({
      raw: 'Hjortronvägen 3, Bromma, 168 59',
      street: 'Hjortronvägen 3',
      locality: 'Bromma',
      postcode: '168 59',
    })
    expect(parseSvoaAddress('Hjortronvägen 3, Bromma')).toBeNull()
  })

  // Id:t hänger kalenderprenumerationer på och får aldrig ändra format.
  it('ger ett låst id', () => {
    expect(svoaAddressId(address('Hjortronvägen 3, Bromma, 168 59'))).toBe(ID)
  })

  it('klarar husnummer med bokstav', () => {
    const a = address('Hjortronvägen 3 A, Bromma, 168 59')
    expect(svoaAddressId(a)).toBe('hjortronvägen-3-a_bromma-16859')
    expect(sameSvoaAddress(svoaAddressId(a), a)).toBe(true)
  })

  it('går tillbaka från id till söksträng och postnummer', () => {
    expect(queryFromSvoaId(ID)).toEqual({ query: 'hjortronvägen 3', postcode: '16859' })
    expect(queryFromSvoaId('skräp')).toBeNull()
  })

  it('jämför gata och postnummer exakt, men inte orten', () => {
    expect(sameSvoaAddress(ID, address('Hjortronvägen 3 A, Bromma, 168 59'))).toBe(false)
    expect(sameSvoaAddress(ID, address('Hjortronvägen 30, Bromma, 168 59'))).toBe(false)
    expect(sameSvoaAddress(ID, address('Hjortronvägen 3, BROMMA, 168 59'))).toBe(true)
    expect(sameSvoaAddress(ID, address('Hjortronvägen 3, Bromma, 168 60'))).toBe(false)
  })
})

describe('svoaFractions', () => {
  it.each([
    ['Kärl 1 - restavfall och matavfall', { fractions: ['rest', 'mat'] }],
    ['Kärl 2 - papper och plast', { fractions: ['papper', 'plast'] }],
    ['Kärl 3 - glas och metall', { fractions: ['glas', 'metall'] }],
    ['Restavfall', { fractions: ['rest'] }],
    ['Matavfall', { fractions: ['mat'] }],
    ['Trädgårdsavfall, villa', { fractions: ['karl'], label: 'Trädgårdsavfall' }],
    ['Kärl 9 - farligt avfall', { fractions: ['karl'], label: 'Kärl 9 - farligt avfall' }],
  ])('%s', (group, expected) => {
    expect(svoaFractions(group)).toEqual(expected)
  })
})

describe('svoaStep', () => {
  it.each([
    ['Varje vecka', { stepDays: 7 }],
    ['Varannan vecka', { stepDays: 14 }],
    ['Var 3:e vecka', { stepDays: 21 }],
    ['Var 4:e vecka', { stepDays: 28 }],
    ['Varannan vecka (april-nov)', { stepDays: 14, inMonths: [4, 5, 6, 7, 8, 9, 10, 11] }],
  ])('%s', (text, expected) => {
    expect(svoaStep(text)).toEqual(expected)
  })

  it('känner inte igen andra texter', () => {
    expect(svoaStep('Var 14:e dag')).toBeNull()
  })

  it('läser säsongen även med tankstreck', () => {
    expect(svoaStep('Varannan vecka (april–nov)')).toEqual({ stepDays: 14, inMonths: [4, 5, 6, 7, 8, 9, 10, 11] })
  })

  // Hellre bara källans datum än trädgårdsavfall hela vintern.
  it.each(['Varannan vecka april-nov', 'Var 4:e vecka (v 14-46)', 'Varannan vecka (sommar)'])('gissar inte på en säsong den inte förstår: %s', (text) => {
    expect(svoaStep(text)).toBeNull()
  })
})

describe('svoaSearch', () => {
  it('ger adresserna ur adressökningen', async () => {
    const found = await svoaSearch('Hjortronvägen', fakeFetch(fixture('svoa-adresser.json')))
    expect(found.map((a) => a.raw)).toContain('Hjortronvägen 3, Bromma, 168 59')
  })

  it.each([['{"value":"x"}'], ['[{"data":"168 59"}]'], ['[{"value":"bara en gata"}]']])('kastar för okänd form: %s', async (body) => {
    await expect(svoaSearch('Hjortronvägen', fakeFetch(body))).rejects.toThrow(
      new SourceError('stockholmvattenochavfall.se svarade med ett okänt format'),
    )
  })
})

describe('svoaSchedule', () => {
  const raw = 'Hjortronvägen 3, Bromma, 168 59'

  it('läser schemat och räknar fram kommande datum', async () => {
    const s = await svoaSchedule(raw, fakeFetch(fixture('svoa-schema.json')))
    expect(s.events.find((e) => e.date === '2026-11-04')).toEqual({ date: '2026-11-04', fractions: ['rest', 'mat'], estimated: false })
    expect(s.events.find((e) => e.date === '2026-11-11')).toMatchObject({ fractions: ['karl'], labels: { karl: 'Trädgårdsavfall' } })
    expect(s.events.find((e) => e.date === '2026-11-18')).toMatchObject({ fractions: ['rest', 'mat'], estimated: true })
    expect(s.events.map((e) => e.date)).toEqual([...s.events.map((e) => e.date)].sort())
  })

  it('läser också det äldre formatet', async () => {
    const s = await svoaSchedule(raw, fakeFetch(fixture('svoa-schema-gammal.json')))
    expect(s.events.find((e) => e.date === '2026-11-04')).toEqual({ date: '2026-11-04', fractions: ['rest', 'mat'], estimated: false })
    expect(s.events.find((e) => e.date === '2026-11-12')).toMatchObject({ fractions: ['papper', 'plast'], estimated: false })
  })

  it('ger ett tomt schema för adresser utan villatjänst', async () => {
    expect((await svoaSchedule(raw, fakeFetch('[]'))).events).toEqual([])
  })

  it.each([
    ['{"något":1}'],
    ['[{"group":"Kärl 1 - restavfall","fetchFrequency":"Varannan vecka","executionDate":"4 nov"}]'],
    ['[{"group":"X"}]'],
  ])('kastar för okänd form eller datum: %s', async (body) => {
    await expect(svoaSchedule(raw, fakeFetch(body))).rejects.toThrow(SourceError)
  })

  it('ger bara källans datum för en okänd frekvens', async () => {
    const body = JSON.stringify([{ group: 'Restavfall', fetchFrequency: 'Var 14:e dag', executionDate: '2026-11-04' }])
    expect((await svoaSchedule(raw, fakeFetch(body))).events.map((e) => e.date)).toEqual(['2026-11-04'])
  })
})
