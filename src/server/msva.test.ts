import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId } from './edp.js'
import { msvaFind, msvaSchedule, msvaSearch } from './msva.js'

const fixture = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '__fixtures__', 'msva-adress.json'), 'utf8'))
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
const respond = (body: unknown) => vi.fn(async () => json(body)) as unknown as typeof fetch & ReturnType<typeof vi.fn>
const params = (fetchFn: ReturnType<typeof vi.fn>) => new URL(String(fetchFn.mock.calls[0][0])).searchParams

const facility = (address: Record<string, string>, additionalInformation = '', schedules = [{ nextPickupDate: '2026-11-18', wasteType: 'WASTE' }]) => ({
  additionalInformation,
  address: { city: 'Sundsvall', houseNumber: '18', postalCode: '85461', street: 'Västra Radiogatan', ...address },
  facilityCategory: 'VILLA',
  schedules,
})

describe('msvaSearch', () => {
  it('läser det sparade svaret och låser adress-id:t', async () => {
    const [found] = await msvaSearch('Västra Radiogatan 18', respond(fixture))
    expect(found.building).toEqual({ raw: 'Västra Radiogatan 18', street: 'Västra Radiogatan 18', locality: 'Sundsvall', buildingId: '85461' })
    expect(edpAddressId(found.building)).toBe('västra-radiogatan-18_sundsvall-85461')
  })

  it('delar upp gata och nummer, eftersom källan kräver exakt gata', async () => {
    const fetchFn = respond([])
    await msvaSearch('Västra Radiogatan 18', fetchFn)
    expect(params(fetchFn).get('street')).toBe('Västra Radiogatan')
    expect(params(fetchFn).get('houseNumber')).toBe('18')
  })

  it('söker på bara gatan när numret saknas', async () => {
    const fetchFn = respond([])
    await msvaSearch('Västra Radiogatan', fetchFn)
    expect(params(fetchFn).get('street')).toBe('Västra Radiogatan')
    expect(params(fetchFn).has('houseNumber')).toBe(false)
  })

  it('tar med bokstaven i gatan och filtrerar på den', async () => {
    const fetchFn = respond([facility({}, 'A'), facility({}, 'B')])
    const found = await msvaSearch('Västra Radiogatan 18 b', fetchFn)
    expect(params(fetchFn).get('houseNumber')).toBe('18')
    expect(found.map((f) => f.building.street)).toEqual(['Västra Radiogatan 18 B'])
    expect(edpAddressId(found[0].building)).toBe('västra-radiogatan-18-b_sundsvall-85461')
  })

  it.each([[{}], ['text'], [[{ address: {} }]], [[{ ...facility({}), schedules: 'nej' }]], [[facility({ postalCode: 'okänt' })]]])('kastar SourceError vid okänd form: %j', async (body) => {
    await expect(msvaSearch('Västra Radiogatan 18', respond(body))).rejects.toMatchObject({ name: 'SourceError' })
  })

  it('kastar SourceError vid ett datum den inte kan läsa', async () => {
    const body = [facility({}, '', [{ nextPickupDate: 'snart', wasteType: 'WASTE' }])]
    await expect(msvaSearch('Västra Radiogatan 18', respond(body))).rejects.toMatchObject({ name: 'SourceError' })
  })
})

describe('msvaFind', () => {
  it('frågar på postnummer och husnummer, så att skiljetecken i gatan inte spelar någon roll', async () => {
    const fetchFn = respond([facility({ street: 'S:t Olofsgatan' }), facility({ street: 'Östermovägen' })])
    const found = await msvaFind('st-olofsgatan-18_sundsvall-85461', fetchFn)
    expect(found?.building.street).toBe('S:t Olofsgatan 18')
    expect(params(fetchFn).get('postalCode')).toBe('85461')
    expect(params(fetchFn).get('houseNumber')).toBe('18')
    expect(params(fetchFn).has('street')).toBe(false)
  })

  it('tar husnumret före bokstaven', async () => {
    const fetchFn = respond([facility({}, 'A')])
    expect((await msvaFind('västra-radiogatan-18-a_sundsvall-85461', fetchFn))?.building.street).toBe('Västra Radiogatan 18 A')
    expect(params(fetchFn).get('houseNumber')).toBe('18')
  })

  it('ger null utan träff, och utan att fråga när id:t inte går att läsa', async () => {
    expect(await msvaFind('västra-radiogatan-18_sundsvall-85461', respond([]))).toBeNull()
    const fetchFn = respond([])
    expect(await msvaFind('skräp', fetchFn)).toBeNull()
    expect(await msvaFind('västra-radiogatan-18_sundsvall-abc', fetchFn)).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('msvaSchedule', () => {
  const pickups = (rows: [string, string][]) => rows.map(([type, date]) => ({ type, date }))

  it('översätter typerna och slår ihop dagar', () => {
    const { events } = msvaSchedule(
      pickups([
        ['WASTE', '2026-11-18'],
        ['WASTE', '2026-11-18'],
        ['FOOD', '2026-11-18'],
        ['PAPER', '2026-12-02'],
        ['PLASTIC', '2026-12-16'],
      ]),
      '2026-11-06',
    )
    expect(events).toEqual([
      { date: '2026-11-18', fractions: ['rest', 'mat'], estimated: false },
      { date: '2026-12-02', fractions: ['papper'], estimated: false },
      { date: '2026-12-16', fractions: ['plast'], estimated: false },
    ])
  })

  it('visar en okänd typ med källans text i stället för att falla', () => {
    expect(msvaSchedule(pickups([['BULKY', '2026-11-18']]), '2026-11-06').events[0]).toMatchObject({ fractions: ['karl'], labels: { karl: 'BULKY' } })
  })

  it('hoppar över passerade datum', () => {
    expect(msvaSchedule(pickups([['WASTE', '2026-11-05']]), '2026-11-06').events).toEqual([])
  })
})
