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

  it('lämnar alla träffar, så att sökrutan kan välja vilka som visas utan att listan hoppar', async () => {
    const boras: Address = { id: 'storgatan-1_boras', street: 'Storgatan 1', locality: 'Borås', sourceId: 'boras', kommun: 'Borås kommun' }
    stubFetch({ addresses: [...Array.from({ length: 11 }, (_, i) => up(`Storgatan ${i + 1}`)), boras], failed: [] })
    const { searchAll } = await import('./registry')
    const result = await searchAll('Storgatan')
    expect(result.addresses).toHaveLength(13)
    expect(result.addresses.map((x) => x.kommun)).toEqual(expect.arrayContaining(['Avesta kommun', 'Borås kommun']))
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
    const asked = sokCalls(f).map((u) => new URL(u, 'http://x').searchParams.get('sources'))
    expect(asked.sort()).toEqual([...live].sort())
    expect(result.failed).toEqual(['uppsala'])
  })

  it('frågar ingen källa för en okänd gata utan husnummer medan man skriver', async () => {
    const f = stubFetch({ addresses: [], failed: [] })
    const { searchAll } = await import('./registry')
    expect((await searchAll('Okändgatan')).addresses.filter((x) => x.sourceId !== 'avesta')).toEqual([])
    expect(sokCalls(f)).toHaveLength(0)
  })

  it('frågar alla live-källor för en okänd gata när man trycker Enter', async () => {
    const f = stubFetch({ addresses: [], failed: [] })
    const { searchAll } = await import('./registry')
    await searchAll('Okändgatan', undefined, undefined, { submitted: true })
    expect(sokCalls(f)).toHaveLength(SOURCES.filter((x) => x.config.system !== 'static').length)
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

  it('frågar varje källa för sig, så att Vercels cache gäller per källa och fråga', async () => {
    const f = vi.fn(async (url: string) => {
      if (url === '/data/gator/st.json') return Response.json({ storgatan: ['boras', 'uppsala'] })
      if (url.startsWith('/api/sok')) return Response.json({ addresses: [], failed: [] })
      return url === '/data/orter.json' ? Response.json({}) : new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', f)
    const { searchAll } = await import('./registry')
    await searchAll('Storgatan')
    expect(sokCalls(f).sort()).toEqual(['/api/sok?q=storgatan&sources=boras', '/api/sok?q=storgatan&sources=uppsala'])
  })

  it('lämnar varje källas träffar när de kommer, utan att vänta på den långsammaste', async () => {
    const boras: Address = { id: 'storgatan-1_boras', street: 'Storgatan 1', locality: 'Borås', sourceId: 'boras', kommun: 'Borås kommun' }
    let releaseBoras: () => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/data/gator/st.json') return Response.json({ storgatan: ['boras', 'uppsala'] })
        if (url === '/data/orter.json') return Response.json({})
        if (url.endsWith('sources=uppsala')) return Response.json({ addresses: [up('Storgatan 2')], failed: [] })
        if (url.endsWith('sources=boras')) {
          await new Promise<void>((r) => (releaseBoras = r))
          return Response.json({ addresses: [boras], failed: [] })
        }
        return new Response('', { status: 404 })
      }),
    )
    const { searchAll } = await import('./registry')
    const partials: string[][] = []
    const done = searchAll('Storgatan', undefined, (r) => partials.push(r.addresses.map((x) => x.sourceId)))
    await vi.waitFor(() => expect(partials).toContainEqual(expect.arrayContaining(['uppsala'])))
    expect(partials.flat()).not.toContain('boras')
    releaseBoras()
    expect((await done).addresses.map((x) => x.sourceId)).toEqual(expect.arrayContaining(['uppsala', 'boras']))
  })

  it('samlar källornas svar en kort stund innan listan visas, så att den inte hoppar', async () => {
    const boras: Address = { id: 'storgatan-1_boras', street: 'Storgatan 1', locality: 'Borås', sourceId: 'boras', kommun: 'Borås kommun' }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/data/gator/st.json') return Response.json({ storgatan: ['boras', 'uppsala'] })
        if (url === '/data/orter.json') return Response.json({})
        if (url.endsWith('sources=uppsala')) return Response.json({ addresses: [up('Storgatan 2')], failed: [] })
        if (url.endsWith('sources=boras')) {
          await new Promise((r) => setTimeout(r, 100))
          return Response.json({ addresses: [boras], failed: [] })
        }
        return new Response('', { status: 404 })
      }),
    )
    const { searchAll } = await import('./registry')
    const partials: string[][] = []
    const result = await searchAll('Storgatan', undefined, (r) => partials.push(r.addresses.map((x) => x.sourceId)))
    expect(partials.some((p) => p.includes('uppsala') && !p.includes('boras'))).toBe(false)
    expect(result.addresses.map((x) => x.sourceId)).toEqual(expect.arrayContaining(['uppsala', 'boras']))
  })

  it('söker på gatan och filtrerar på orten när man skriver den efter', async () => {
    const lund: Address = { id: 'storgatan-2_lund-1', street: 'Storgatan 2', locality: 'Lund', sourceId: 'uppsala', kommun: 'Lunds kommun' }
    const f = stubFetch({ addresses: [up('Storgatan 2'), lund], failed: [] })
    const { searchAll } = await import('./registry')
    const result = await searchAll('Storgatan 2 Lund')
    expect(new URL(sokCalls(f)[0], 'http://x').searchParams.get('q')).toBe('storgatan 2')
    expect(result.addresses.filter((x) => x.sourceId === 'uppsala').map((x) => x.locality)).toEqual(['Lund'])
  })

  it('använder svaret för gatan när man lägger till orten', async () => {
    const f = stubFetch({ addresses: [up('Storgatan 2')], failed: [] })
    const { searchAll } = await import('./registry')
    await searchAll('Storgatan 2')
    await searchAll('Storgatan 2, Upps')
    expect(sokCalls(f)).toHaveLength(1)
  })

  it('frågar också med orten när svaret för gatan var avkortat', async () => {
    const others = Array.from({ length: 10 }, (_, i) => ({ ...up(`Storgatan 1${i}`), locality: 'Storvreta' }))
    const grillby: Address = { ...up('Storgatan 1'), id: 'storgatan-1_grillby-1', locality: 'Grillby' }
    const f = vi.fn(async (url: string) => {
      if (url === '/data/gator/st.json') return Response.json({ storgatan: ['uppsala'] })
      if (url === '/data/orter.json') return Response.json({})
      const q = url.startsWith('/api/sok') ? new URL(url, 'http://x').searchParams.get('q') : null
      if (q === 'storgatan 1') return Response.json({ addresses: others, failed: [] })
      if (q === 'storgatan 1, grillby') return Response.json({ addresses: [grillby], failed: [] })
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', f)
    const { searchAll } = await import('./registry')
    const result = await searchAll('Storgatan 1 Grillby')
    expect(result.addresses.map((x) => x.locality)).toEqual(['Grillby'])
    expect(sokCalls(f).map((u) => new URL(u, 'http://x').searchParams.get('q'))).toEqual(['storgatan 1', 'storgatan 1, grillby'])
  })

  it('frågar inte med orten när svaret för gatan var komplett', async () => {
    const f = stubFetch({ addresses: [up('Storgatan 2')], failed: [] })
    const { searchAll } = await import('./registry')
    await searchAll('Storgatan 2 Grillby')
    expect(sokCalls(f)).toHaveLength(1)
  })

  it('räknar bara en källa som misslyckad när just den inte svarar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/data/gator/st.json') return Response.json({ storgatan: ['boras', 'uppsala'] })
        if (url === '/data/orter.json') return Response.json({})
        if (url.endsWith('sources=boras')) return new Response('', { status: 502 })
        if (url.startsWith('/api/sok')) return Response.json({ addresses: [up('Storgatan 2')], failed: [] })
        return new Response('', { status: 404 })
      }),
    )
    const { searchAll } = await import('./registry')
    const result = await searchAll('Storgatan')
    expect(result.failed).toEqual(['boras'])
    expect(result.addresses.map((x) => x.street)).toContain('Storgatan 2')
  })

  it('hämtar gatuindexet redan vid två tecken, men frågar ingen källa', async () => {
    const f = stubFetch({ addresses: [], failed: [] })
    const { searchAll } = await import('./registry')
    await searchAll('St')
    expect(f.mock.calls.map(([u]) => u)).toContain('/data/gator/st.json')
    expect(sokCalls(f)).toHaveLength(0)
  })
})
