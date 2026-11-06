import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId, idHash } from './edp.js'
import { telgeFind, telgePickups, telgeSchedule, telgeSearch } from './telge.js'

const fixture = (name: string) => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8'))
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
const respond = (body: unknown) => vi.fn(async () => json(body)) as unknown as typeof fetch & ReturnType<typeof vi.fn>
const called = (fetchFn: ReturnType<typeof vi.fn>) => decodeURIComponent(String(fetchFn.mock.calls[0][0]))

const ID = `bergsgatan-22_södertälje-${idHash('BERGSGATAN 22, SÖDERTÄLJE')}`

describe('telgeSearch', () => {
  it('läser det sparade svaret och låser adress-id:t', async () => {
    const found = await telgeSearch('Bergsgatan 2', respond(['BERGSGATAN 22, SÖDERTÄLJE']))
    expect(found).toEqual([{ raw: 'BERGSGATAN 22, SÖDERTÄLJE', street: 'Bergsgatan 22', locality: 'Södertälje', buildingId: idHash('BERGSGATAN 22, SÖDERTÄLJE') }])
    expect(edpAddressId(found[0])).toBe(ID)
    expect(idHash('BERGSGATAN 22, SÖDERTÄLJE')).toBe('4xhjqo')
  })

  it('läser alla förslag i det sparade svaret', async () => {
    const rows = fixture('telge-forslag.json') as string[]
    expect((await telgeSearch('Bergsgatan 2', respond(rows))).map((b) => b.raw)).toEqual(rows)
  })

  it('tar bort orten och skiljetecken, som källan svarar 500 på', async () => {
    const fetchFn = respond([])
    await telgeSearch('s:t Ragnhilds.gatan & 3, Södertälje', fetchFn)
    expect(called(fetchFn)).toMatch(/\/autocomplete\/S T RAGNHILDS GATAN 3$/)
  })

  it('frågar inte alls när inget sökbart finns kvar', async () => {
    const fetchFn = respond([])
    expect(await telgeSearch(':::', fetchFn)).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('visar inte förslag som uppslaget inte kan söka fram igen', async () => {
    const found = await telgeSearch('S', respond(['S:T ERIKS VÄG 3, SÖDERTÄLJE', 'STORGATAN 13 VÅRDCENTRAL JÄRNA, JÄRNA', 'BY-VÄGEN 1, HÖLÖ']))
    expect(found.map((b) => b.street)).toEqual(['Storgatan 13 Vårdcentral Järna', 'By-Vägen 1'])
  })

  it.each([[{}], ['text'], [[1]]])('kastar SourceError vid okänd form: %j', async (body) => {
    await expect(telgeSearch('Bergsgatan', respond(body))).rejects.toMatchObject({ name: 'SourceError' })
  })
})

describe('telgeFind', () => {
  it('söker på texten i id:t och väljer träffen med samma id', async () => {
    const fetchFn = respond(['BERGSGATAN 22, SÖDERTÄLJE', 'BERGSGATAN 22 A, SÖDERTÄLJE'])
    expect((await telgeFind(ID, fetchFn))?.raw).toBe('BERGSGATAN 22, SÖDERTÄLJE')
    expect(called(fetchFn)).toMatch(/\/autocomplete\/BERGSGATAN 22$/)
  })

  it('ger null utan träff', async () => {
    expect(await telgeFind(ID, respond([]))).toBeNull()
    expect(await telgeFind('skräp', respond([]))).toBeNull()
  })
})

describe('telgePickups och telgeSchedule', () => {
  const row = (typeOfWasteDescription: string, date = '2026-11-10T00:00:00', extra = {}) => ({ date, typeOfWasteDescription, typeOfWaste: 'X', title: 'Hämtning', vehicleDescription: 'Hemsortering 4-fack      ', ...extra })
  const schedule = async (rows: unknown[]) => telgeSchedule(await telgePickups('BERGSGATAN 22, SÖDERTÄLJE', respond(rows)), '2026-11-06').events

  it('frågar med källans text och läser det sparade schemat', async () => {
    const fetchFn = respond(fixture('telge-schema.json'))
    const pickups = await telgePickups('BERGSGATAN 22, SÖDERTÄLJE', fetchFn)
    expect(called(fetchFn)).toMatch(/\/schedule\/BERGSGATAN 22, SÖDERTÄLJE$/)
    const { events } = telgeSchedule(pickups, '2026-11-06')
    expect(events[0]).toEqual({ date: '2026-11-10', fractions: ['karl'], labels: { karl: 'Fyrfackskärl 1' }, estimated: false })
    expect(events.at(-1)!.date > '2027-10-01').toBe(true)
    expect(events.every((e) => e.estimated === false)).toBe(true)
  })

  it('läser numret på fyrfackskärlet ur titeln', async () => {
    const events = await schedule([row('Hemsortering', undefined, { typeOfWaste: 'HEMSORT', title: 'Hämtning av hemsortering (240 liters kärl 2)' })])
    expect(events[0].labels).toEqual({ karl: 'Fyrfackskärl 2' })
  })

  it('låter inte fordonets 4-fack smitta av sig på det delade kärlet', async () => {
    expect((await schedule([row('Mat & Restavfall')]))[0]).toMatchObject({ fractions: ['rest', 'mat'] })
  })

  it.each([
    ['BNI Pappersförp.', ['papper']],
    ['BNI Plastförp.', ['plast']],
    ['BNI Metallförp.', ['metall']],
    ['BNI Glas färgat', ['glas']],
    ['BNI Glas ofärgat', ['glas']],
    ['Returpapper', ['tidningar']],
    ['Restavfall', ['rest']],
    ['Matavfall', ['mat']],
  ])('%s blir %j', async (text, fractions) => {
    expect((await schedule([row(text)]))[0].fractions).toEqual(fractions)
  })

  it('visar trädgårdsavfall med källans text och hoppar över latrin och slam', async () => {
    const events = await schedule([row('Trädgårdsavfall'), row('Latrin', '2026-11-11T00:00:00'), row('Slam', '2026-11-12T00:00:00')])
    expect(events).toEqual([{ date: '2026-11-10', fractions: ['karl'], labels: { karl: 'Trädgårdsavfall' }, estimated: false }])
  })

  it('hoppar över passerade datum och godtar ett tomt schema', async () => {
    expect(await schedule([row('Restavfall', '2026-10-13T00:00:00')])).toEqual([])
    expect(await schedule([])).toEqual([])
  })

  it.each([[{}], [[{ date: 'snart', typeOfWasteDescription: 'Restavfall' }]], [[{ date: '2026-11-10T00:00:00' }]]])('kastar SourceError vid okänd form: %j', async (body) => {
    await expect(telgePickups('BERGSGATAN 22, SÖDERTÄLJE', respond(body))).rejects.toMatchObject({ name: 'SourceError' })
  })
})
