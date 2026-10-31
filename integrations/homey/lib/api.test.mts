import { describe, expect, it, vi } from 'vitest'
import { createClient, SoporError } from './api.mjs'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('API-klienten', () => {
  it('söker med q och skickar egen User-Agent', async () => {
    const fetch = vi.fn(async () => json(200, { apiVersion: '1', addresses: [], failed: [] }))
    const client = createClient({ fetch, userAgent: 'Sopor-Homey/0.1.0' })
    await client.search('storgatan 2')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://sopor.hardyson.se/api/v1/sok?q=storgatan+2')
    expect(new Headers(init.headers).get('User-Agent')).toBe('Sopor-Homey/0.1.0')
  })

  it('söker inom en källa med kalla', async () => {
    const fetch = vi.fn(async () => json(200, { apiVersion: '1', addresses: [], failed: [] }))
    await createClient({ fetch, userAgent: 'x' }).search('storgatan 2', 'uppsala')
    expect(fetch.mock.calls[0][0]).toBe('https://sopor.hardyson.se/api/v1/sok?q=storgatan+2&kalla=uppsala')
  })

  it('hämtar källorna', async () => {
    const fetch = vi.fn(async () => json(200, { apiVersion: '1', sources: [], fractions: {} }))
    await createClient({ fetch, userAgent: 'x' }).sources()
    expect(fetch.mock.calls[0][0]).toBe('https://sopor.hardyson.se/api/v1/kallor')
  })

  it('ger API:ts felkod vid felsvar', async () => {
    const fetch = vi.fn(async () => json(404, { apiVersion: '1', error: { code: 'not_found', message: 'Adressen finns inte hos källan' } }))
    const client = createClient({ fetch, userAgent: 'x' })
    const error = await client.schedule('https://sopor.hardyson.se/api/v1/adress/a/b').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SoporError)
    expect(error).toMatchObject({ status: 404, code: 'not_found', message: 'Adressen finns inte hos källan' })
  })

  it('klarar felsvar som inte är JSON', async () => {
    const fetch = vi.fn(async () => new Response('Bad Gateway', { status: 502 }))
    const error = await createClient({ fetch, userAgent: 'x' }).schedule('https://sopor.hardyson.se/x').catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 502, code: 'source_unavailable' })
  })

  it('gör nätfel till status 0', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const error = await createClient({ fetch, userAgent: 'x' }).search('storgatan 2').catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 0, code: 'network' })
  })
})
