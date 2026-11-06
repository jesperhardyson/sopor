import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { handleV1Address, v1 } from './v1.js'

const fixture = readFileSync(path.resolve(import.meta.dirname, '__fixtures__', 'msva-adress.json'), 'utf8')
const json = (body: string) => new Response(body, { headers: { 'Content-Type': 'application/json' } })

const msva: Source = {
  id: 'msva',
  name: 'Mittsverige Vatten & Avfall',
  url: 'https://www.msva.se',
  kommuner: [{ code: '2281', name: 'Sundsvalls kommun' }],
  config: { system: 'msva' },
}
const ID = 'västra-radiogatan-18_sundsvall-85461'

const fake = (body = fixture) => vi.fn(async () => json(body)) as unknown as typeof fetch & ReturnType<typeof vi.fn>
const opts = (fetchFn: typeof fetch = fake()) => ({ fetchFn, sources: [msva], timeoutMs: 50, now: new Date('2026-11-06T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=msva&id=${encodeURIComponent(id)}`)

describe('MSVA i sajtens API', () => {
  it('söker utan orten och behåller adressen när orten stämmer', async () => {
    const fetchFn = fake()
    const res = await (await handleSearch(url('/api/sok?q=Västra Radiogatan 18, Sundsvall&sources=msva'), opts(fetchFn))).json()
    expect(res.failed).toEqual([])
    expect(res.addresses).toEqual([{ id: ID, street: 'Västra Radiogatan 18', locality: 'Sundsvall', sourceId: 'msva', kommun: 'Sundsvalls kommun' }])
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('street')).toBe('Västra Radiogatan')
  })

  it('filtrerar bort adressen när orten inte stämmer', async () => {
    const res = await (await handleSearch(url('/api/sok?q=Västra Radiogatan 18, Matfors&sources=msva'), opts())).json()
    expect(res.addresses).toEqual([])
  })

  it('hämtar schemat ur ett enda anrop', async () => {
    const fetchFn = fake()
    const res = await handleSchedule(schema(ID), opts(fetchFn))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ id: ID, street: 'Västra Radiogatan 18', locality: 'Sundsvall', kommun: 'Sundsvalls kommun' })
    expect(body.schedule.events.length).toBeGreaterThan(0)
    expect(body.schedule.events.every((e: { estimated: boolean }) => e.estimated === false)).toBe(true)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('ger kalenderprenumerationen 502, aldrig uppmaningskalendern, när adressen inte hittas', async () => {
    const res = await handleIcs(url(`/api/ics?source=msva&file=${encodeURIComponent(ID)}.ics`), opts(fake('[]')))
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('-saknas@')
  })

  it('ger 502 när tjänsten svarar med okänd form', async () => {
    expect((await handleSchedule(schema(ID), opts(fake('{"x":1}')))).status).toBe(502)
  })

  it('ger schemat i API v1', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=msva&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
  })
})
