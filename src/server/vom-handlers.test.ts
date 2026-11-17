import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_SOURCES } from '../sources/index.js'
import { handleIcs, handleSchedule, handleSearch } from './handlers.js'
import { handleV1Address, v1 } from './v1.js'
import { clearVomCache, vomAddressId } from './vom.js'

const fixture = readFileSync(path.resolve(import.meta.dirname, '__fixtures__', 'vom-adresser.json'), 'utf8')
const fake = () => vi.fn(async () => new Response(fixture, { headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
const source = ALL_SOURCES.find((s) => s.id === 'vom-harjedalen')!
const opts = () => ({ fetchFn: fake(), sources: [source], timeoutMs: 50, now: new Date('2026-11-17T10:00:00Z') })
const url = (p: string) => new URL(`https://preview.test${p}`)
const ID = vomAddressId('algatan 1', 'sveg')

beforeEach(() => clearVomCache())

describe('VoM i sajtens API', () => {
  it('söker och ger adressen med kommunen', async () => {
    const res = await (await handleSearch(url('/api/sok?q=Algatan 1, Sveg&sources=vom-harjedalen'), opts())).json()
    expect(res.failed).toEqual([])
    expect(res.addresses).toContainEqual({ id: ID, street: 'Algatan 1', locality: 'Sveg', sourceId: 'vom-harjedalen', kommun: 'Härjedalens kommun' })
  })

  it('filtrerar på orten', async () => {
    const res = await (await handleSearch(url('/api/sok?q=Algatan 1, Hede&sources=vom-harjedalen'), opts())).json()
    expect(res.addresses).toEqual([])
  })

  it('hämtar schemat med beräknade datum för rest och mat', async () => {
    const res = await handleSchedule(url(`/api/schema?source=vom-harjedalen&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.address).toMatchObject({ id: ID, street: 'Algatan 1', locality: 'Sveg', kommun: 'Härjedalens kommun' })
    expect(body.schedule.events[0]).toEqual({ date: '2026-11-30', fractions: ['rest', 'mat'], estimated: true })
  })

  it('ger 502 för ett id som inte finns i listan, så att kalenderprenumerationen behåller sina datum', async () => {
    const missing = encodeURIComponent(vomAddressId('algatan 99', 'sveg'))
    expect((await handleSchedule(url(`/api/schema?source=vom-harjedalen&id=${missing}`), opts())).status).toBe(502)
    expect((await handleIcs(url(`/api/ics?source=vom-harjedalen&file=${missing}.ics`), opts())).status).toBe(502)
  })

  it('filtrerar på orten innan träffarna begränsas till 50', async () => {
    const rows = [...Array.from({ length: 60 }, (_, i) => ({ hamtstalle: `storgatan ${i + 1}`, ort: 'sveg', tbfurenhkorlistarad_strtomningsfrekvenskod: 'h211' })), { hamtstalle: 'storgatan 1', ort: 'funäsdalen', tbfurenhkorlistarad_strtomningsfrekvenskod: 'h211' }]
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ allAddresses: rows }), { headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
    const o = { ...opts(), fetchFn }
    expect((await (await handleSearch(url('/api/sok?q=Storgatan, Funäsdalen&sources=vom-harjedalen'), o)).json()).addresses.map((a: { locality: string }) => a.locality)).toEqual(['Funäsdalen'])
    expect((await (await handleSearch(url('/api/sok?q=Storgatan&sources=vom-harjedalen'), o)).json()).addresses).toHaveLength(50)
  })

  it('ger ett tomt schema för en okänd kod', async () => {
    const res = await handleSchedule(url(`/api/schema?source=vom-harjedalen&id=${encodeURIComponent(vomAddressId('industrivägen 1', 'funäsdalen'))}`), opts())
    expect((await res.json()).schedule.events).toEqual([])
  })

  it('ger kalenderfilen med stabila UID', async () => {
    const res = await handleIcs(url(`/api/ics?source=vom-harjedalen&file=${encodeURIComponent(ID)}.ics`), opts())
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(`UID:${ID}-2026-11-30@sopor.hardyson.se`)
  })

  it('ger schemat i API v1', async () => {
    const res = await v1(handleV1Address)(new Request(`https://preview.test/api/v1/adress?source=vom-harjedalen&id=${encodeURIComponent(ID)}`), opts())
    expect(res.status).toBe(200)
  })
})

describe('VoM i registret', () => {
  it('har en källa per kommun med kommunens lista', () => {
    const vom = ALL_SOURCES.filter((s) => s.config.system === 'vom')
    expect(vom.map((s) => [s.id, s.kommuner.map((k) => k.code)])).toEqual([
      ['vom-harjedalen', ['2361']],
      ['vom-berg', ['2326']],
      ['vom-bracke', ['2305']],
    ])
    expect(new Set(vom.map((s) => s.config.system === 'vom' && s.config.resource)).size).toBe(3)
    expect(vom.every((s) => s.emptyScheduleNote && s.contact?.email === 'kundservice@vattenmiljoresurs.se')).toBe(true)
  })
})
