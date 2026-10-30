import { describe, expect, it, vi } from 'vitest'
import type { AddressIndexFile, ScheduleFile } from '@/data/static-format'
import type { Municipality } from '@/municipalities'
import { createStaticProvider } from './static'

const avesta: Municipality = {
  id: 'avesta',
  name: 'Avesta kommun',
  shortName: 'Avesta',
  operator: { name: 'AVA', url: 'https://x', scheduleUrl: 'https://x' },
  provider: { type: 'static' },
}

const index: AddressIndexFile = {
  municipalityId: 'avesta',
  updatedAt: '2026-10-29',
  addresses: [
    ['krylbo-storgatan-12b', 'Storgatan 12 B', 'Krylbo', ['2026-a', '2027-b']],
    ['avesta-storgatan-12', 'Storgatan 12', 'Avesta', ['2026-a']],
  ],
}

const files: Record<string, ScheduleFile> = {
  '2026-a': {
    id: '2026-a', validFrom: '2026-01-01', validTo: '2027-01-10', updatedAt: '2026-10-29', bins: [],
    events: [{ date: '2026-11-11', fractions: ['rest'] }, { date: '2027-01-07', fractions: ['mat'] }],
  },
  '2027-b': {
    id: '2027-b', validFrom: '2027-01-01', validTo: '2027-12-31', updatedAt: '2026-12-01', bins: [],
    events: [{ date: '2027-01-05', fractions: ['plast'] }],
  },
}

function fakeFetch(status = 200) {
  return vi.fn(async (url: string) => {
    const body = url === '/data/avesta/addresses.json' ? index : files[url.match(/schedules\/(.+)\.json$/)?.[1] ?? '']
    if (status !== 200 || !body) return new Response('fel', { status: status === 200 ? 404 : status })
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('createStaticProvider', () => {
  it('hämtar indexet en gång och söker i det', async () => {
    const f = fakeFetch()
    const p = createStaticProvider(avesta, f)
    expect((await p.searchAddresses('storg')).map((a) => a.id)).toHaveLength(2)
    await p.searchAddresses('krylbo')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('ger adresser med kommun-id', async () => {
    const p = createStaticProvider(avesta, fakeFetch())
    expect(await p.getAddress('krylbo-storgatan-12b')).toEqual({
      id: 'krylbo-storgatan-12b', street: 'Storgatan 12 B', locality: 'Krylbo', municipalityId: 'avesta',
    })
    expect(await p.getAddress('finns-inte')).toBeNull()
  })

  it('slår ihop alla år för adressens schema', async () => {
    const p = createStaticProvider(avesta, fakeFetch())
    const s = await p.getSchedule('krylbo-storgatan-12b')
    expect(s?.events.map((e) => e.date)).toEqual(['2026-11-11', '2027-01-05'])
  })

  it('ger null för okänd adress', async () => {
    expect(await createStaticProvider(avesta, fakeFetch()).getSchedule('finns-inte')).toBeNull()
  })

  it('kastar vid serverfel så att UI:t kan visa felläget', async () => {
    await expect(createStaticProvider(avesta, fakeFetch(500)).getSchedule('krylbo-storgatan-12b')).rejects.toThrow()
  })

  it('försöker igen efter ett fel i stället för att cacha felet', async () => {
    let fail = true
    const ok = fakeFetch()
    const f = vi.fn(async (url: string) => (fail ? new Response('', { status: 503 }) : ok(url))) as unknown as typeof fetch
    const p = createStaticProvider(avesta, f)
    await expect(p.searchAddresses('storg')).rejects.toThrow()
    fail = false
    expect(await p.searchAddresses('storg')).toHaveLength(2)
  })

  it('föreslår adresser vid felstavning', async () => {
    const p = createStaticProvider(avesta, fakeFetch())
    expect((await p.suggestAddresses('Storgtan 12'))[0].id).toBe('avesta-storgatan-12')
  })

  it('pekar på den statiska .ics-filen', () => {
    expect(createStaticProvider(avesta, fakeFetch()).icsUrl('x')).toBe('/ics/avesta/x.ics')
  })
})
