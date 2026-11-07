import { afterEach, describe, expect, it, vi } from 'vitest'
import { siteJson } from './site'

describe('siteJson', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hämtar sajtens filer en gång under funktionens livstid', async () => {
    const f = vi.fn(async () => Response.json({ a: 1 }))
    vi.stubGlobal('fetch', f)
    expect(await siteJson('https://a.test', '/data/en.json')).toEqual({ a: 1 })
    expect(await siteJson('https://a.test', '/data/en.json')).toEqual({ a: 1 })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('sparar inte ett fel', async () => {
    const f = vi.fn(async () => new Response('', { status: 500 }))
    vi.stubGlobal('fetch', f)
    await expect(siteJson('https://a.test', '/data/fel.json')).rejects.toThrow()
    await expect(siteJson('https://a.test', '/data/fel.json')).rejects.toThrow()
    expect(f).toHaveBeenCalledTimes(2)
  })
})
