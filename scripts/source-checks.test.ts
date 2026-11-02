import { describe, expect, it, vi } from 'vitest'
import type { Source } from '../src/sources/index.js'
import { checkEdpSource, checkStaticSource } from './source-checks'

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
const html = () => new Response('<html>Logga in</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })

const source: Source = {
  id: 'test',
  name: 'Testkommun',
  url: 'https://test.example.se',
  kommuner: [{ code: '9999', name: 'Testkommun' }],
  config: { system: 'edp', baseUrl: 'https://edp.example.se/FutureWeb' },
}
const today = '2026-11-02'
const probe = 'Storgatan 1, Test'
const rest = { WasteType: 'Restavfall', NextWastePickup: '2026-11-10', WastePickupsPerYear: 26, WastePickupFrequency: 'Varannan vecka' }

/** Svarar på sökningen och schemat med det som anges. Ett Response skickas som det är. */
function fakeEdp(search: unknown, schedule: unknown = { RhServices: [rest] }) {
  return vi.fn(async (input: string | URL | Request) => {
    const body = new URL(String(input)).pathname.endsWith('/SearchAdress') ? search : schedule
    if (body instanceof Error) throw body
    return body instanceof Response ? body : json(body)
  }) as unknown as typeof fetch
}
const found = { Succeeded: true, Buildings: ['Storgatan 1, Test (1)'] }
const check = (fetchFn: typeof fetch) => checkEdpSource(source, probe, today, fetchFn)

describe('checkEdpSource', () => {
  it('fungerar när sökningen ger adresser och schemat har tömningar framåt', async () => {
    expect(await check(fakeEdp(found))).toMatchObject({
      sourceId: 'test',
      name: 'Testkommun',
      state: 'fungerar',
      baseUrl: 'https://edp.example.se/FutureWeb',
      probe,
      unknownWasteTypes: [],
    })
  })

  it('svarar inte vid nätverksfel', async () => {
    const r = await check(fakeEdp(new TypeError('fetch failed')))
    expect(r.state).toBe('svarar-inte')
    expect(r.error).toContain('Ingen kontakt med edp.example.se')
    expect(r.unknownWasteTypes).toBeUndefined()
  })

  it('svarar inte vid 502 på sökningen', async () => {
    expect((await check(fakeEdp(new Response('', { status: 502 })))).state).toBe('svarar-inte')
  })

  it('svarar inte vid 503 på schemat, fast sökningen fungerar', async () => {
    const r = await check(fakeEdp(found, new Response('', { status: 503 })))
    expect(r.state).toBe('svarar-inte')
    expect(r.unknownWasteTypes).toBeUndefined()
  })

  it.each([403, 408, 429])('svarar inte när källan blockerar eller begränsar anrop (%i)', async (status) => {
    expect((await check(fakeEdp(new Response('', { status })))).state).toBe('svarar-inte')
  })

  it('har nytt format när en inloggningssida kommer i stället för JSON', async () => {
    const r = await check(fakeEdp(html()))
    expect(r.state).toBe('nytt-format')
    expect(r.error).toContain('svarade inte med JSON')
  })

  it('har nytt format vid 404, när sökvägen inte finns längre', async () => {
    expect((await check(fakeEdp(new Response('Not found', { status: 404 })))).state).toBe('nytt-format')
  })

  it('har nytt format när svaret saknar Buildings', async () => {
    expect((await check(fakeEdp({ Succeeded: true })))).toMatchObject({ state: 'nytt-format' })
  })

  it('har nytt format när ingen adress går att tolka', async () => {
    expect((await check(fakeEdp({ Succeeded: true, Buildings: ['skräp'] })))).toMatchObject({ state: 'nytt-format' })
  })

  it('har nytt format när schemat saknar RhServices', async () => {
    expect((await check(fakeEdp(found, { Något: [] })))).toMatchObject({ state: 'nytt-format' })
  })

  it('är tom när sökningen svarar utan adresser', async () => {
    expect((await check(fakeEdp({ Succeeded: true, Buildings: [] })))).toMatchObject({ state: 'tom' })
  })

  it('har inga tömningar när ingen ligger inom 60 dagar', async () => {
    const later = { ...rest, NextWastePickup: '2027-03-01', WastePickupsPerYear: 0 }
    expect((await check(fakeEdp(found, { RhServices: [later] })))).toMatchObject({ state: 'inga-tomningar' })
  })

  it('listar okända avfallstyper men fungerar ändå', async () => {
    const garden = { ...rest, WasteType: 'Trädgårdsavfall' }
    expect(await check(fakeEdp(found, { RhServices: [rest, garden] }))).toMatchObject({
      state: 'fungerar',
      unknownWasteTypes: ['Trädgårdsavfall'],
    })
  })
})

describe('checkStaticSource', () => {
  const staticSource: Source = { ...source, config: { system: 'static' } }

  it('säger till när schemat tar slut inom 60 dagar', () => {
    expect(checkStaticSource(staticSource, ['2026-12-31'], today)).toMatchObject({ state: 'schemat-tar-slut' })
  })

  it('fungerar när schemat räcker längre, och räknar det senaste året', () => {
    expect(checkStaticSource(staticSource, ['2026-12-31', '2027-01-10'], today)).toMatchObject({ state: 'fungerar' })
  })

  it('säger till när det inte finns någon datafil', () => {
    expect(checkStaticSource(staticSource, [], today)).toMatchObject({ state: 'schemat-tar-slut' })
  })
})
