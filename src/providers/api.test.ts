import { describe, expect, it, vi } from 'vitest'
import type { Source } from '@/sources'
import { createApiProvider } from './api'

const vafab: Source = {
  id: 'vafab',
  name: 'Vafab Miljö',
  url: 'https://x',
  kommuner: [
    { code: '1980', name: 'Västerås kommun' },
    { code: '0381', name: 'Enköpings kommun' },
  ],
  config: { system: 'edp', baseUrl: 'https://x' },
}

const address = { id: 'storgatan-1_grillby-909273', street: 'Storgatan 1', locality: 'Grillby', sourceId: 'vafab', kommun: 'Vafab Miljö' }
const schedule = { bins: [], updatedAt: '2026-10-30', events: [{ date: '2026-11-04', fractions: ['rest'] }] }

function fakeFetch(status = 200) {
  return vi.fn(async (url: string) => {
    if (url === '/data/orter.json') return Response.json({ vafab: { grillby: 'Enköpings kommun' } })
    if (url.startsWith('/api/schema')) {
      return status === 200 ? Response.json({ address, schedule }) : Response.json({ error: 'x' }, { status })
    }
    return new Response('', { status: 404 })
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('createApiProvider', () => {
  it('hämtar adress och schema i samma anrop och sätter kommun från orten', async () => {
    const f = fakeFetch()
    const p = createApiProvider(vafab, f)
    expect(await p.getAddress(address.id)).toEqual({ ...address, kommun: 'Enköpings kommun' })
    expect((await p.getSchedule(address.id))?.events).toHaveLength(1)
    expect(f.mock.calls.filter(([u]) => String(u).startsWith('/api/schema'))).toHaveLength(1)
    expect(f.mock.calls[0][0]).toBe('/api/schema?source=vafab&id=storgatan-1_grillby-909273')
  })

  it('ger null när adressen inte finns hos källan', async () => {
    const p = createApiProvider(vafab, fakeFetch(404))
    expect(await p.getAddress(address.id)).toBeNull()
    expect(await p.getSchedule(address.id)).toBeNull()
  })

  it('kastar när källan inte svarar, så att UI:t kan visa felläget', async () => {
    await expect(createApiProvider(vafab, fakeFetch(502)).getSchedule(address.id)).rejects.toThrow()
  })

  it('pekar kalenderfilen på /ics med kodat id', () => {
    expect(createApiProvider(vafab, fakeFetch()).icsUrl('älvvägen-3_örebro-1')).toBe('/ics/vafab/%C3%A4lvv%C3%A4gen-3_%C3%B6rebro-1.ics')
  })
})
