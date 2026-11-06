import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId } from './edp.js'
import { vakinFind, vakinPickups, vakinSchedule, vakinSearch } from './vakin.js'

const fixture = (name: string) => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8'))
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
const respond = (body: unknown) => vi.fn(async () => json(body)) as unknown as typeof fetch & ReturnType<typeof vi.fn>
const called = (fetchFn: ReturnType<typeof vi.fn>) => new URL(String(fetchFn.mock.calls[0][0]))

const row = (label: string, zipCode = '90739', city = 'UMEÅ') => ({ id: 1, label, value: { zipCode, address: label, city } })
const PARAMS = { zipCode: '90739', address: 'Laboratorvägen 7, Umeå', city: 'UMEÅ' }
const ID = 'laboratorvägen-7_umeå-90739'

describe('vakinSearch', () => {
  it('läser det sparade svaret och låser adress-id:t', async () => {
    const [found] = await vakinSearch('Laboratorvägen 7', respond(fixture('vakin-adresser.json')))
    expect(found.building).toEqual({ raw: 'Laboratorvägen 7, Umeå', street: 'Laboratorvägen 7', locality: 'Umeå', buildingId: '90739' })
    expect(found.params).toEqual(PARAMS)
    expect(edpAddressId(found.building)).toBe(ID)
  })

  it('tar bort orten och skiljetecken, som källan svarar 500 på', async () => {
    const fetchFn = respond({ data: [] })
    await vakinSearch('S:t Olofs.gatan & 3, Umeå', fetchFn)
    expect(called(fetchFn).searchParams.get('pickupAddress')).toBe('S t Olofs gatan 3')
  })

  it('frågar inte alls när inget sökbart finns kvar', async () => {
    const fetchFn = respond({ data: [] })
    expect(await vakinSearch(':::', fetchFn)).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('visar inte adresser som uppslaget och schemat inte klarar', async () => {
    const found = await vakinSearch('Cello', respond({ data: [row('Cellovägen/Sophus 3, Umeå'), row('Utåkersvägen 52 M.FL., Lögdeå'), row('Strömbäck-Reningsverk, Umeå')] }))
    expect(found.map((f) => f.building.street)).toEqual(['Strömbäck-Reningsverk'])
  })

  it('tar sista delen som ort när adressen har flera komman', async () => {
    const [found] = await vakinSearch('Strömbäck', respond({ data: [row('Strömbäck Kaj , FGK, Umeå')] }))
    expect(found.building).toMatchObject({ street: 'Strömbäck Kaj , FGK', locality: 'Umeå' })
  })

  it.each([[{}], [[]], [{ data: 'nej' }], [{ data: [{ label: 'Gatan 1, Umeå' }] }], [{ data: [row('Gatan 1, Umeå', 'okänt')] }]])('kastar SourceError vid okänd form: %j', async (body) => {
    await expect(vakinSearch('Gatan', respond(body))).rejects.toMatchObject({ name: 'SourceError' })
  })
})

describe('vakinFind', () => {
  it('söker på gatan i id:t och väljer träffen med samma id', async () => {
    const fetchFn = respond({ data: [row('Laboratorvägen 7, Umeå'), row('Laboratorvägen 7, Holmsund', '91331', 'HOLMSUND')] })
    expect((await vakinFind(ID, fetchFn))?.params).toEqual(PARAMS)
    expect(called(fetchFn).searchParams.get('pickupAddress')).toBe('laboratorvägen 7')
  })

  it('hittar adressen trots flera komman', async () => {
    const id = edpAddressId((await vakinSearch('Strömbäck', respond({ data: [row('Strömbäck Kaj , FGK, Umeå')] })))[0].building)
    expect((await vakinFind(id, respond({ data: [row('Strömbäck Kaj , FGK, Umeå')] })))?.building.street).toBe('Strömbäck Kaj , FGK')
  })

  it('ger null utan träff, och utan att fråga när id:t inte går att läsa', async () => {
    expect(await vakinFind(ID, respond({ data: [] }))).toBeNull()
    const fetchFn = respond({ data: [] })
    expect(await vakinFind('skräp', fetchFn)).toBeNull()
    expect(await vakinFind('laboratorvägen-7_umeå-abc', fetchFn)).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('vakinPickups och vakinSchedule', () => {
  const pickup = (executionDate: string, contentTypes: string[]) => ({ executionDate, contentTypes, flexServiceGroup: 'Tunna småhus', id: '1' })

  it('skickar källans värden oförändrade och frågar tolv månader framåt', async () => {
    const fetchFn = respond([])
    await vakinPickups(PARAMS, '2026-11-06', fetchFn)
    const { searchParams } = called(fetchFn)
    expect(JSON.parse(searchParams.get('addressParams')!)).toEqual(PARAMS)
    expect(searchParams.get('startDate')).toBe('2026-11-06')
    expect(searchParams.get('endDate')).toBe('2027-11-06')
  })

  it('läser det sparade schemat med riktiga datum', async () => {
    const pickups = await vakinPickups(PARAMS, '2026-11-06', respond(fixture('vakin-schema.json')))
    const { events } = vakinSchedule(pickups, '2026-11-06')
    expect(events[0]).toEqual({ date: '2026-11-12', fractions: ['rest', 'mat'], estimated: false })
    expect(events.at(-1)!.date > '2027-10-01').toBe(true)
  })

  it('slår ihop flera kärl samma dag och översätter förpackningarna', async () => {
    const pickups = await vakinPickups(PARAMS, '2026-11-06', respond([pickup('2026-11-12', ['Restavfall']), pickup('2026-11-12', ['Matavfall']), pickup('2026-11-19', ['Pappersförpackningar', 'Plastförpackningar'])]))
    expect(vakinSchedule(pickups, '2026-11-06').events).toEqual([
      { date: '2026-11-12', fractions: ['rest', 'mat'], estimated: false },
      { date: '2026-11-19', fractions: ['papper', 'plast'], estimated: false },
    ])
  })

  it('hoppar över fett och passerade datum, och godtar ett tomt schema', async () => {
    const pickups = await vakinPickups(PARAMS, '2026-11-06', respond([pickup('2026-11-12', ['Fett']), pickup('2026-11-05', ['Restavfall'])]))
    expect(vakinSchedule(pickups, '2026-11-06').events).toEqual([])
    expect(await vakinPickups(PARAMS, '2026-11-06', respond([]))).toEqual([])
  })

  it('visar en okänd typ med källans text i stället för att falla', async () => {
    const pickups = await vakinPickups(PARAMS, '2026-11-06', respond([pickup('2026-11-12', ['Grovsopor'])]))
    expect(vakinSchedule(pickups, '2026-11-06').events[0]).toMatchObject({ fractions: ['karl'], labels: { karl: 'Grovsopor' } })
  })

  it.each([[{}], [[{ executionDate: 'snart', contentTypes: [] }]], [[{ executionDate: '2026-11-12' }]], [[{ executionDate: '2026-11-12', contentTypes: [1] }]]])('kastar SourceError vid okänd form: %j', async (body) => {
    await expect(vakinPickups(PARAMS, '2026-11-06', respond(body))).rejects.toMatchObject({ name: 'SourceError' })
  })
})
