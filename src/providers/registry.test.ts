import '@/test/show-hidden-sources'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Address } from '@/domain/types'
import type { Source } from '@/sources'
import { getSource, SOURCES } from '@/sources'
import { mergeResults, providerFor } from './registry'

const a = (id: string, sourceId: string): Address => ({ id, street: id, locality: 'x', sourceId, kommun: 'x' })

describe('kommunregistret', () => {
  it('har Avesta med statisk provider', () => {
    expect(getSource('avesta')?.config).toEqual({ system: 'static' })
    expect(getSource('hedemora')).toBeUndefined()
    expect(SOURCES.map((m) => m.id)).toContain('avesta')
  })
})

describe('providerFor', () => {
  it('ger en provider för statiska kommuner', () => {
    expect(providerFor(getSource('avesta')!).icsUrl('x')).toBe('/ics/avesta/x.ics')
  })

  it('ger live-källor en provider som går via Sopors API', () => {
    const edp: Source = { ...getSource('avesta')!, id: 'testkalla', config: { system: 'edp', baseUrl: 'https://x' } }
    expect(providerFor(edp).icsUrl('a_b-1')).toBe('/ics/testkalla/a_b-1.ics')
  })
})

describe('mergeResults', () => {
  it('slår ihop flera kommuners träffar och hoppar över de som misslyckades', () => {
    const merged = mergeResults(
      [
        { status: 'fulfilled', value: [a('1', 'avesta')] },
        { status: 'rejected', reason: new Error('nere') },
        { status: 'fulfilled', value: [a('2', 'hedemora')] },
      ],
      8,
    )
    expect(merged.map((x) => x.id)).toEqual(['1', '2'])
  })

  it('kastar om alla kommuner misslyckades', () => {
    expect(() => mergeResults([{ status: 'rejected', reason: new Error('nere') }], 8)).toThrow('nere')
  })
})

describe('searchAll', () => {
  const avestaIndex = {
    municipalityId: 'avesta',
    updatedAt: '2026-10-29',
    addresses: [['avesta-storgatan-12', 'Storgatan 12', 'Avesta', ['2026-a']]],
  }

  function stubFetch(sokResponse: unknown) {
    const f = vi.fn(async (url: string) => {
      if (url === '/data/avesta/addresses.json') return Response.json(avestaIndex)
      if (url === '/data/gator/st.json') return Response.json({ storgatan: ['avesta', 'uppsala'] })
      if (url === '/data/orter.json') return Response.json({})
      if (url.startsWith('/api/sok')) return Response.json(sokResponse)
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', f)
    return f
  }

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.resetModules() // tömmer sökcachen mellan testerna
    await import('@/test/show-hidden-sources') // det nya källregistret ska också visa Avesta
  })

  const up = (street: string): Address => ({ id: `${street}-1`, street, locality: 'Uppsala', sourceId: 'uppsala', kommun: 'Uppsala kommun' })
  const sokCalls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('/api/sok'))

  it('söker lokalt i statiska källor och via /api/sok i de källor gatuindexet pekar ut', async () => {
    const uppsala = { id: 'storgatan-2_uppsala-1', street: 'Storgatan 2', locality: 'Uppsala', sourceId: 'uppsala', kommun: 'Uppsala kommun' }
    const f = stubFetch({ addresses: [uppsala], failed: [] })
    const { searchAll } = await import('./registry')
    const result = await searchAll('Storgatan')
    expect(result.addresses.map((x) => x.id)).toEqual(['avesta-storgatan-12', 'storgatan-2_uppsala-1'])
    expect(result.failed).toEqual([])
    expect(f.mock.calls.map(([u]) => u)).toContain('/api/sok?q=storgatan&sources=uppsala')
  })

  it('skickar frågan med gemener och enkla mellanslag, så att Vercels cache träffar oftare', async () => {
    const f = stubFetch({ addresses: [], failed: [] })
    const { searchAll } = await import('./registry')
    await searchAll('  Storgatan   2 ')
    expect(new URL(sokCalls(f)[0], 'http://x').searchParams.get('q')).toBe('storgatan 2')
  })

  it('frågar inte servern igen för samma sökning', async () => {
    const f = stubFetch({ addresses: [up('Storgatan 2')], failed: [] })
    const { searchAll } = await import('./registry')
    await searchAll('Storgatan 2')
    const again = await searchAll('storgatan  2')
    expect(again.addresses.map((x) => x.street)).toContain('Storgatan 2')
    expect(sokCalls(f)).toHaveLength(1)
  })

  it('filtrerar ett komplett svar lokalt när man skriver vidare', async () => {
    const f = stubFetch({ addresses: [up('Storgatan 2'), up('Storgatan 21'), up('Storgatan 3')], failed: [] })
    const { searchAll } = await import('./registry')
    await searchAll('Storgatan')
    const longer = await searchAll('Storgatan 2')
    expect(longer.addresses.filter((x) => x.sourceId === 'uppsala').map((x) => x.street)).toEqual(['Storgatan 2', 'Storgatan 21'])
    expect(sokCalls(f)).toHaveLength(1)
  })

  it('frågar igen när källan gav tio träffar, eftersom svaret kan vara avkortat', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => up(`Storgatan ${i + 1}`))
    const f = stubFetch({ addresses: ten, failed: [] })
    const { searchAll } = await import('./registry')
    await searchAll('Storgatan')
    await searchAll('Storgatan 2')
    expect(sokCalls(f)).toHaveLength(2)
  })

  it('sparar inte svaret från en källa som inte svarade', async () => {
    const f = stubFetch({ addresses: [], failed: ['uppsala'] })
    const { searchAll } = await import('./registry')
    await searchAll('Storgatan')
    await searchAll('Storgatan')
    expect(sokCalls(f)).toHaveLength(2)
  })

  it('skickar inget anrop om sökningen avbryts medan den väntar', async () => {
    const f = stubFetch({ addresses: [], failed: [] })
    const { searchAll } = await import('./registry')
    const controller = new AbortController()
    const done = searchAll('Storgatan', controller.signal)
    setTimeout(() => controller.abort(), 20)
    await expect(done).rejects.toThrow()
    expect(sokCalls(f)).toHaveLength(0)
  })

  it('frågar alla live-källor när gatan saknas i indexet', async () => {
    const f = stubFetch({ addresses: [], failed: ['uppsala'] })
    const { searchAll } = await import('./registry')
    const result = await searchAll('Okändgatan 3')
    const live = SOURCES.filter((x) => x.config.system !== 'static').map((x) => x.id)
    const call = f.mock.calls.map(([u]) => String(u)).find((u) => u.startsWith('/api/sok'))!
    expect(new URL(call, 'http://x').searchParams.get('sources')?.split(',')).toEqual(live)
    expect(result.failed).toEqual(['uppsala'])
  })

  it('lämnar de lokala träffarna direkt, innan live-källorna svarat', async () => {
    let releaseLive: () => void = () => {}
    const f = vi.fn(async (url: string) => {
      if (url === '/data/avesta/addresses.json') return Response.json(avestaIndex)
      if (url === '/data/gator/st.json') return Response.json({ storgatan: ['avesta', 'uppsala'] })
      if (url === '/data/orter.json') return Response.json({})
      if (url.startsWith('/api/sok')) {
        await new Promise<void>((r) => (releaseLive = r))
        return Response.json({ addresses: [], failed: [] })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', f)
    const { searchAll } = await import('./registry')
    const partials: string[][] = []
    const done = searchAll('Storgatan', undefined, (r) => partials.push(r.addresses.map((x) => x.id)))
    await vi.waitFor(() => expect(partials).toEqual([['avesta-storgatan-12']]))
    await vi.waitFor(() => expect(sokCalls(f)).toHaveLength(1))
    releaseLive()
    await done
  })
})

