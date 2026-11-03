import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId, type EdpBuilding } from './edp'
import { SourceError } from './http'
import { vasydSchedule, vasydSearch, vasydStep, VASYD_URL } from './vasyd'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')

function fakeFetch(body: string) {
  return vi.fn(async () => new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>
}
const unknown = new SourceError('vasyd.se svarade med ett okänt format')
const limhamn: EdpBuilding = { raw: 'Limhamnsvägen 50, Malmö', street: 'Limhamnsvägen 50', locality: 'Malmö', buildingId: '104904' }
const schedule = (items: unknown[]) => JSON.stringify({ items, meta: { success: true, message: null } })

describe('vasydStep', () => {
  it.each([
    ['Onsdag varje vecka', 7],
    ['Tisdag udda vecka', 14],
    ['Torsdag jämn vecka ', 14],
    ['Tisdag var 4:e vecka startvecka 1', 28],
    ['Torsdag var 4:e vecka', 28],
  ])('%s', (text, days) => {
    expect(vasydStep(text)).toBe(days)
  })

  // Hellre bara källans datum än gissade tömningar.
  it.each(['Onsdag jämn vecka trädgård', 'Varannan onsdag', 'varje vecka'])('känner inte igen %s', (text) => {
    expect(vasydStep(text)).toBeNull()
  })
})

describe('vasydSearch', () => {
  it('ger byggnader som EDP, med ett låst adress-id', async () => {
    const fetchFn = fakeFetch(fixture('vasyd-adresser.json'))
    const found = await vasydSearch('Storgatan 1', fetchFn)
    expect(found[0]).toEqual({ raw: 'Storgatan 1, Malmö', street: 'Storgatan 1', locality: 'Malmö', buildingId: '125040' })
    expect(edpAddressId(found[0])).toBe('storgatan-1_malmö-125040')
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${VASYD_URL}/buildingaddresssearch`)
    expect(init.method).toBe('POST')
    expect(String(init.body)).toBe('query=Storgatan+1')
  })

  it.each([
    ['{"items":[],"meta":{"success":false,"message":"fel"}}'],
    ['{"meta":{"success":true}}'],
    ['{"items":[{"street":"Storgatan 1, Malmö"}],"meta":{"success":true}}'],
    ['{"items":[{"street":"bara gata","id":"1"}],"meta":{"success":true}}'],
  ])('kastar för okänd form: %s', async (body) => {
    await expect(vasydSearch('Storgatan 1', fakeFetch(body))).rejects.toThrow(unknown)
  })
})

describe('vasydSchedule', () => {
  it('läser schemat och räknar fram kommande datum', async () => {
    const fetchFn = fakeFetch(fixture('vasyd-schema.json'))
    const s = await vasydSchedule(limhamn, fetchFn)
    expect(s.events.find((e) => e.date === '2026-11-04')).toMatchObject({ fractions: ['rest', 'mat'], estimated: false })
    expect(s.events.find((e) => e.date === '2026-11-11')).toMatchObject({ estimated: true })
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${VASYD_URL}/wastepickupbyaddress`)
    expect(new URLSearchParams(String(init.body))).toEqual(new URLSearchParams({ query: '104904', street: 'Limhamnsvägen 50, Malmö' }))
  })

  it('visar fyrfackskärlen och bara källans datum för trädgårdsavfallet', async () => {
    const s = await vasydSchedule({ ...limhamn, buildingId: '131502' }, fakeFetch(fixture('vasyd-schema-fyrfack.json')))
    expect(s.events.find((e) => e.date === '2026-11-03')?.labels?.karl).toBe('Fyrfackskärl 1, Fyrfackskärl 2')
    const garden = s.events.filter((e) => e.labels?.karl?.includes('Trädgårdsavfall'))
    expect(garden.map((e) => e.date)).toEqual(['2026-11-11'])
  })

  it('kortar ett datum med klockslag', async () => {
    const body = schedule([{ wasteType: 'Restavfall', wastePickupFrequency: 'Onsdag varje vecka', nextWastePickup: '2026-11-04T00:00:00' }])
    expect((await vasydSchedule(limhamn, fakeFetch(body))).events[0].date).toBe('2026-11-04')
  })

  it('ger ett tomt schema när källan inte har några tömningar', async () => {
    expect((await vasydSchedule(limhamn, fakeFetch(schedule([])))).events).toEqual([])
  })

  it.each([
    [schedule([{ wasteType: 'Restavfall', wastePickupFrequency: 'Onsdag varje vecka', nextWastePickup: '4 nov' }])],
    [schedule([{ wastePickupFrequency: 'Onsdag varje vecka', nextWastePickup: '2026-11-04' }])],
    ['{"items":[],"meta":{"success":false}}'],
    ['[]'],
  ])('kastar för okänd form: %s', async (body) => {
    await expect(vasydSchedule(limhamn, fakeFetch(body))).rejects.toThrow(unknown)
  })
})
