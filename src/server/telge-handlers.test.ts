import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { handleV1Address, v1 } from './v1.js'

const fixture = readFileSync(path.resolve(import.meta.dirname, '__fixtures__', 'telge-schema.json'), 'utf8')
const json = (body: string) => new Response(body, { headers: { 'Content-Type': 'application/json' } })

const telge: Source = {
  id: 'telge',
  name: 'Telge Återvinning',
  url: 'https://www.telge.se',
  kommuner: [{ code: '0181', name: 'Södertälje kommun' }],
  config: { system: 'telge' },
}
const ID = 'bergsgatan-22_södertälje-4xhjqo'

/** Telge svarar med det sparade schemat; förslagen är en enda adress. */
const fake = ({ forslag = '["BERGSGATAN 22, SÖDERTÄLJE"]', schema = fixture } = {}) =>
  vi.fn(async (input: string | URL | Request) => json(String(input).includes('/autocomplete/') ? forslag : schema)) as unknown as typeof fetch & ReturnType<typeof vi.fn>
const opts = (fetchFn: typeof fetch = fake()) => ({ fetchFn, sources: [telge], timeoutMs: 50, now: new Date('2026-11-06T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const schema = (id: string) => url(`/api/schema?source=telge&id=${encodeURIComponent(id)}`)

describe('Telge i sajtens API', () => {
  it('söker utan orten och behåller adressen när orten stämmer', async () => {
    const fetchFn = fake()
    const res = await (await handleSearch(url('/api/sok?q=Bergsgatan 22, Södertälje&sources=telge'), opts(fetchFn))).json()
    expect(res.failed).toEqual([])
    expect(res.addresses).toEqual([{ id: ID, street: 'Bergsgatan 22', locality: 'Södertälje', sourceId: 'telge', kommun: 'Södertälje kommun' }])
    expect(decodeURIComponent(String(fetchFn.mock.calls[0][0]))).toMatch(/\/autocomplete\/BERGSGATAN 22$/)
  })

  it('hämtar riktiga datum ett år framåt', async () => {
    const res = await handleSchedule(schema(ID), opts())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ id: ID, street: 'Bergsgatan 22', locality: 'Södertälje', kommun: 'Södertälje kommun' })
    expect(body.schedule.events[0].date).toBe('2026-11-10')
    expect(body.schedule.events.at(-1).date > '2027-10-01').toBe(true)
    expect(body.schedule.events.every((e: { estimated: boolean }) => e.estimated === false)).toBe(true)
  })

  it('ger ett tomt schema för en adress utan kärl, inte ett fel', async () => {
    const res = await handleSchedule(schema(ID), opts(fake({ schema: '[]' })))
    expect(res.status).toBe(200)
    expect((await res.json()).schedule.events).toEqual([])
  })

  it('ger kalenderprenumerationen 502, aldrig uppmaningskalendern, när adressen inte hittas', async () => {
    const res = await handleIcs(url(`/api/ics?source=telge&file=${encodeURIComponent(ID)}.ics`), opts(fake({ forslag: '[]' })))
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('-saknas@')
  })

  it('ger 502 när tjänsten svarar med okänd form', async () => {
    expect((await handleSchedule(schema(ID), opts(fake({ schema: '{"x":1}' })))).status).toBe(502)
  })

  it('ger schemat i API v1', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=telge&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
  })
})
