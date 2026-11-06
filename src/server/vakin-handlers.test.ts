import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ALL_SOURCES, type Source } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { handleV1Address, v1 } from './v1.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const json = (body: string) => new Response(body, { headers: { 'Content-Type': 'application/json' } })

const vakin: Source = {
  id: 'vakin',
  name: 'Vakin',
  url: 'https://www.vakin.se',
  kommuner: [
    { code: '2480', name: 'Umeå kommun' },
    { code: '2404', name: 'Vindelns kommun' },
    { code: '2401', name: 'Nordmalings kommun' },
  ],
  config: { system: 'vakin' },
}
const ID = 'laboratorvägen-7_umeå-90739'
const places = { vakin: { umeå: 'Umeå kommun', umea: 'Umeå kommun' } }

const fake = ({ adresser = fixture('vakin-adresser.json'), schema = fixture('vakin-schema.json') } = {}) =>
  vi.fn(async (input: string | URL | Request) => json(String(input).includes('/getAddresses') ? adresser : schema)) as unknown as typeof fetch & ReturnType<typeof vi.fn>
const opts = (fetchFn: typeof fetch = fake()) => ({ fetchFn, sources: [vakin], places, timeoutMs: 50, now: new Date('2026-11-06T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=vakin&id=${encodeURIComponent(id)}`)

describe('Vakin i sajtens API', () => {
  it('söker utan orten och behåller adressen när orten stämmer', async () => {
    const fetchFn = fake()
    const res = await (await handleSearch(url('/api/sok?q=Laboratorvägen 7, Umeå&sources=vakin'), opts(fetchFn))).json()
    expect(res.failed).toEqual([])
    expect(res.addresses).toEqual([{ id: ID, street: 'Laboratorvägen 7', locality: 'Umeå', sourceId: 'vakin', kommun: 'Umeå kommun' }])
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('pickupAddress')).toBe('Laboratorvägen 7')
  })

  it('filtrerar bort adressen när orten inte stämmer', async () => {
    const res = await (await handleSearch(url('/api/sok?q=Laboratorvägen 7, Vindeln&sources=vakin'), opts())).json()
    expect(res.addresses).toEqual([])
  })

  it('hämtar riktiga datum och kommunen', async () => {
    const res = await handleSchedule(schema(ID), opts())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ id: ID, street: 'Laboratorvägen 7', locality: 'Umeå', kommun: 'Umeå kommun' })
    expect(body.schedule.events[0]).toEqual({ date: '2026-11-12', fractions: ['rest', 'mat'], estimated: false })
  })

  it('ger ett tomt schema för en adress utan kärl, inte ett fel', async () => {
    const res = await handleSchedule(schema(ID), opts(fake({ schema: '[]' })))
    expect(res.status).toBe(200)
    expect((await res.json()).schedule.events).toEqual([])
  })

  it('ger kalenderprenumerationen 502, aldrig uppmaningskalendern, när adressen inte hittas', async () => {
    const res = await handleIcs(url(`/api/ics?source=vakin&file=${encodeURIComponent(ID)}.ics`), opts(fake({ adresser: '{"data":[]}' })))
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('-saknas@')
  })

  it('ger 502 när tjänsten svarar med okänd form', async () => {
    expect((await handleSchedule(schema(ID), opts(fake({ schema: '{"error":"x"}' })))).status).toBe(502)
  })

  it('ger schemat i API v1', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=vakin&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
  })
})

describe('Vakin i registret', () => {
  const source = ALL_SOURCES.find((s) => s.id === 'vakin')!

  it('pekar ut postorter som finns i flera av källans kommuner', () => {
    expect(source.postorter).toMatchObject({ Holmsund: '2480', Röbäck: '2480', Nyåker: '2401', Olofsfors: '2401' })
  })

  it('förklarar ett tomt schema', () => {
    expect(source.emptyScheduleNote?.text).toContain('flerbostadshus')
  })
})
