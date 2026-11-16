import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { idHash } from './edp.js'
import { fetchHtml, SourceError } from './http.js'
import { MIVA_APP, mivaAddressId, mivaSearch, mivaState } from './miva.js'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const html = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
const respond = (...bodies: string[]) => {
  const fn = vi.fn()
  for (const body of bodies) fn.mockResolvedValueOnce(html(body))
  return fn as unknown as typeof fetch & ReturnType<typeof vi.fn>
}
const called = (fetchFn: ReturnType<typeof vi.fn>, i = 0) => new URL(String(fetchFn.mock.calls[i][0]))
const page = (state: unknown) => `<script>AppRegistry.registerInitialState('${MIVA_APP}',${JSON.stringify(state)});</script>`

describe('mivaState', () => {
  it('läser appens tillstånd ur sidan', () => {
    const state = mivaState(fixture('miva-sok.html'))
    expect(state.route).toBe('/')
    expect(state.hits).toHaveLength(6)
  })

  it('kastar SourceError när tillståndet saknas', () => {
    expect(() => mivaState('<html></html>')).toThrow(SourceError)
  })

  it('kastar SourceError när tillståndet varken har träffar eller turer', () => {
    expect(() => mivaState(page({ route: '/' }))).toThrow(SourceError)
  })
})

describe('mivaAddressId', () => {
  it('låser formatet: adress och ort, och en hash av adressen och orten med versaler', () => {
    expect(mivaAddressId('Nygatan 2', 'ÖRNSKÖLDSVIK')).toBe(`nygatan-2_örnsköldsvik-${idHash('Nygatan 2, ÖRNSKÖLDSVIK')}`)
  })

  it('ger samma id oavsett versaler i orten', () => {
    expect(mivaAddressId('Nygatan 2', 'Örnsköldsvik')).toBe(mivaAddressId('Nygatan 2', 'ÖRNSKÖLDSVIK'))
  })
})

describe('mivaSearch', () => {
  it('frågar utan orten och ger en adress per adress och ort', async () => {
    const fetchFn = respond(fixture('miva-sok.html'))
    const found = await mivaSearch('Nygatan, Örnsköldsvik', fetchFn)
    expect(called(fetchFn).searchParams.get('q')).toBe('Nygatan')
    expect(called(fetchFn).searchParams.get(`sv.${MIVA_APP}.route`)).toBe('/')
    expect(found.map((a) => [a.address, a.city])).toEqual([
      ['Nygatan 1', 'BREDBYN'],
      ['Nygatan 2', 'ÖRNSKÖLDSVIK'],
      ['Nygatan 3', 'BREDBYN'],
      ['Nygatan 3', 'ÖRNSKÖLDSVIK'],
      ['Nygatan 10', 'BREDBYN'],
    ])
    expect(found[1].building).toMatchObject({ street: 'Nygatan 2', locality: 'Örnsköldsvik' })
    expect(found[3].frequencies).toEqual(['1 gång per vecka'])
  })

  it('tar inte med adresser vars schema inte går att hämta', async () => {
    const found = await mivaSearch('Nygatan', respond(fixture('miva-sok.html')))
    expect(found.some((a) => a.address.includes('/'))).toBe(false)
  })

  it('lämnar inga andra fält från källan efter sig', async () => {
    const found = await mivaSearch('Nygatan', respond(fixture('miva-sok.html')))
    for (const a of found) expect(Object.keys(a).sort()).toEqual(['address', 'building', 'city', 'frequencies'])
    expect(JSON.stringify(found)).not.toMatch(/CustomerId|PickupName|PickupEmail/)
  })

  it('ger adressen när sökningen går direkt till schemat', async () => {
    const found = await mivaSearch('Nygatan 10', respond(fixture('miva-sok-en.html')))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ address: 'Nygatan 10', city: 'Bredbyn', frequencies: [] })
  })

  it('kastar SourceError för en träff utan adress', async () => {
    await expect(mivaSearch('Nygatan', respond(page({ route: '/', hits: [{ PickupCity: 'BREDBYN' }] })))).rejects.toThrow(SourceError)
  })
})

describe('fetchHtml', () => {
  it('kastar SourceError när svaret inte är HTML', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
    await expect(fetchHtml('https://miva.se/x', { fetchFn })).rejects.toThrow(SourceError)
  })
})
