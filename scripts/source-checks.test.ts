import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SVOA_URL } from '../src/server/svoa.js'
import type { Source } from '../src/sources/index.js'
import { checkEdpSource, checkSvoaSource, checkStaticSource, checkViaSite, unreachableFromHere } from './source-checks'

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
    const bulky = { ...rest, WasteType: 'Grovavfall' }
    expect(await check(fakeEdp(found, { RhServices: [rest, bulky] }))).toMatchObject({
      state: 'fungerar',
      unknownWasteTypes: ['Grovavfall'],
    })
  })
})

describe('unreachableFromHere', () => {
  const base = { sourceId: 'test', name: 'Testkommun' }

  it('gäller källor som inte svarar och svar som inte är JSON, som en brandväggs spärrsida', () => {
    expect(unreachableFromHere({ ...base, state: 'svarar-inte', error: 'Ingen kontakt med edp.example.se: timeout' })).toBe(true)
    expect(unreachableFromHere({ ...base, state: 'nytt-format', error: 'edp.example.se svarade inte med JSON' })).toBe(true)
  })

  it('gäller inte svar som kom fram men är fel', () => {
    expect(unreachableFromHere({ ...base, state: 'nytt-format', error: 'edp.example.se svarade 404' })).toBe(false)
    expect(unreachableFromHere({ ...base, state: 'nytt-format', error: 'Svaret saknar Buildings' })).toBe(false)
    expect(unreachableFromHere({ ...base, state: 'tom' })).toBe(false)
    expect(unreachableFromHere({ ...base, state: 'fungerar' })).toBe(false)
  })
})

describe('checkViaSite', () => {
  const site = 'https://sopor.example.se'
  const addressUrl = `${site}/api/v1/adress/test/storgatan-1_test-1`
  const hit = { apiVersion: '1', addresses: [{ id: 'storgatan-1_test-1', url: addressUrl }], failed: [] }
  const schedule = (dates: string[]) => ({ apiVersion: '1', today, events: dates.map((date) => ({ date, fractions: ['rest'] })) })

  /** Svarar på sajtens sökning och adressida. Ett Response skickas som det är. */
  function fakeSite(search: unknown, address: unknown = schedule(['2026-11-10'])) {
    return vi.fn(async (input: string | URL | Request) => {
      const body = new URL(String(input)).pathname === '/api/v1/sok' ? search : address
      return body instanceof Response ? body : json(body)
    }) as unknown as typeof fetch
  }
  const viaSite = (fetchFn: typeof fetch) => checkViaSite(source, probe, today, fetchFn, site)

  it('fungerar när sajten hittar adressen och schemat har tömningar framåt', async () => {
    expect(await viaSite(fakeSite(hit))).toMatchObject({ sourceId: 'test', state: 'fungerar', via: 'sajten' })
  })

  it('frågar bara den här källan och går förbi CDN-cachen', async () => {
    const fetchFn = fakeSite(hit)
    await viaSite(fetchFn)
    const [search, address] = vi.mocked(fetchFn).mock.calls.map(([input]) => new URL(String(input)))
    expect(search.searchParams.get('q')).toBe(probe)
    expect(search.searchParams.get('kalla')).toBe('test')
    expect(search.searchParams.get('kontroll')).toBeTruthy()
    expect(`${address.origin}${address.pathname}`).toBe(addressUrl)
    expect(address.searchParams.get('kontroll')).toBeTruthy()
  })

  it('vet inget om avfallstyperna, eftersom sajten inte visar källans råa svar', async () => {
    expect((await viaSite(fakeSite(hit))).unknownWasteTypes).toBeUndefined()
  })

  it('svarar inte när sajten säger att källan inte svarade på sökningen', async () => {
    const r = await viaSite(fakeSite({ ...hit, addresses: [], failed: ['test'] }))
    expect(r).toMatchObject({ state: 'svarar-inte', error: 'Sajten fick inget svar från källan' })
  })

  it('svarar inte när sajten inte får något schema', async () => {
    const r = await viaSite(fakeSite(hit, new Response('{}', { status: 502 })))
    expect(r).toMatchObject({ state: 'svarar-inte', error: 'sopor.example.se svarade 502' })
  })

  it('är tom när sajten inte hittar adressen', async () => {
    expect((await viaSite(fakeSite({ ...hit, addresses: [] }))).state).toBe('tom')
  })

  it('har inga tömningar när ingen ligger inom 60 dagar', async () => {
    expect((await viaSite(fakeSite(hit, schedule(['2027-03-01'])))).state).toBe('inga-tomningar')
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

describe('checkSvoaSource', () => {
  const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '../src/server/__fixtures__', name), 'utf8')
  const stockholm: Source = { ...source, id: 'stockholm', name: 'Stockholm Vatten och Avfall', config: { system: 'svoa' } }
  const probe = 'Hjortronvägen 3, Bromma, 168 59'
  const svoa = (addresses: unknown, schedule: unknown = fixture('svoa-schema.json')) =>
    vi.fn(async (input: string | URL | Request) => {
      const body = new URL(String(input)).pathname.endsWith('/AutoCompleteMe') ? addresses : schedule
      if (body instanceof Error) throw body
      return body instanceof Response ? body : new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof fetch
  const checkSvoa = (fetchFn: typeof fetch) => checkSvoaSource(stockholm, probe, today, fetchFn)

  it('fungerar med de sparade svaren', async () => {
    expect(await checkSvoa(svoa(fixture('svoa-adresser.json')))).toMatchObject({
      sourceId: 'stockholm',
      state: 'fungerar',
      baseUrl: SVOA_URL,
      probe,
      unknownWasteTypes: [],
    })
  })

  it('svarar inte vid timeout', async () => {
    expect((await checkSvoa(svoa(new TypeError('fetch failed')))).state).toBe('svarar-inte')
  })

  it('har nytt format när svaret har okänd form', async () => {
    expect((await checkSvoa(svoa({ x: 1 }))).state).toBe('nytt-format')
    expect((await checkSvoa(svoa(fixture('svoa-adresser.json'), { x: 1 }))).state).toBe('nytt-format')
  })

  it('är tom när adressökningen inte hittar något', async () => {
    expect((await checkSvoa(svoa([]))).state).toBe('tom')
  })

  it('har nytt format när kontrolladressen inte längre matchar, som uppslaget kräver', async () => {
    const changed = [{ value: 'Hjortronvägen 3A, Bromma, 168 59', data: '168 59' }]
    const r = await checkSvoa(svoa(changed))
    expect(r.state).toBe('nytt-format')
    expect(r.error).toContain('Hjortronvägen 3, Bromma, 168 59')
  })

  it('har inga tömningar när kontrolladressen saknar villatjänst', async () => {
    expect((await checkSvoa(svoa(fixture('svoa-adresser.json'), []))).state).toBe('inga-tomningar')
  })

  it('rapporterar okända grupper och frekvenser', async () => {
    const schedule = [
      { group: 'Kärl 1 - restavfall och matavfall', fetchFrequency: 'Var 14:e dag', executionDate: '2026-11-04' },
      { group: 'Kärl 9 - farligt avfall', fetchFrequency: 'Varannan vecka', executionDate: '2026-11-05' },
    ]
    expect((await checkSvoa(svoa(fixture('svoa-adresser.json'), schedule))).unknownWasteTypes).toEqual([
      'Kärl 9 - farligt avfall',
      'Frekvens: Var 14:e dag',
    ])
  })
})
