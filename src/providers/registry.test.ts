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

describe('searchInKommun', () => {
  const uppsala = { code: '0380', name: 'Uppsala kommun' }
  const heby = { code: '0331', name: 'Heby kommun' }
  const adress = (sourceId: string, street: string, locality: string, kommun: string): Address => ({
    id: `${street}_${locality}`,
    street,
    locality,
    sourceId,
    kommun,
  })
  const inUppsala = adress('uppsala', 'Storgatan 2', 'Uppsala', 'Uppsala kommun')
  const inStockholm = adress('stockholm', 'Storgatan 2', 'Stockholm', 'Stockholms kommun')

  /** /api/sok svarar per källa, som i produktion: varje källa har sina adresser. */
  function stubSources(bySource: Record<string, Address[]>, places: Record<string, Record<string, string>> = {}) {
    const f = vi.fn(async (url: string) => {
      if (url === '/data/avesta/addresses.json') {
        return Response.json({ municipalityId: 'avesta', updatedAt: '2026-10-29', addresses: [['avesta-storgatan-12', 'Storgatan 12', 'Avesta', ['2026-a']]] })
      }
      if (url === '/data/gator/st.json') return Response.json({ storgatan: ['stockholm', 'uppsala', 'vafab'] })
      if (url === '/data/orter.json') return Response.json(places)
      if (url.startsWith('/api/sok')) {
        const params = new URL(url, 'http://x').searchParams
        const q = params.get('q') ?? ''
        const hits = (bySource[params.get('sources') ?? ''] ?? []).filter((a) => `${a.street}, ${a.locality}`.toLowerCase().startsWith(q))
        return Response.json({ addresses: hits, failed: [] })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', f)
    return f
  }
  const asked = (f: ReturnType<typeof vi.fn>) =>
    f.mock.calls
      .map(([u]) => new URL(String(u), 'http://x'))
      .filter((u) => u.pathname === '/api/sok')
      .map((u) => u.searchParams.get('sources'))

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.resetModules()
    await import('@/test/show-hidden-sources')
  })

  it('frågar bara kommunens källor, även när gatan finns i andra kommuner', async () => {
    const f = stubSources({ uppsala: [inUppsala], stockholm: [inStockholm] })
    const { searchInKommun } = await import('./registry')
    const { addresses } = await searchInKommun(uppsala).search('Storgatan 2')
    expect(addresses.map((a) => a.sourceId)).toEqual(['uppsala'])
    expect(new Set(asked(f))).toEqual(new Set(['uppsala']))
  })

  it('går inte till en annan kommun när man trycker Enter', async () => {
    const f = stubSources({ uppsala: [], stockholm: [inStockholm] })
    const { searchInKommun } = await import('./registry')
    const { addresses } = await searchInKommun(uppsala).search('Okändgatan', undefined, undefined, { submitted: true })
    expect(addresses).toEqual([])
    expect(new Set(asked(f))).toEqual(new Set(['uppsala']))
  })

  it('tar inte med statiska källor i andra kommuner', async () => {
    stubSources({ uppsala: [] })
    const { searchInKommun } = await import('./registry')
    const { addresses } = await searchInKommun(uppsala).search('Storgatan 12')
    expect(addresses).toEqual([])
  })

  it('tar bort adresser i källans andra kommuner', async () => {
    const vasteras = adress('vafab', 'Storgatan 2', 'Västerås', 'Västerås kommun')
    const hebyAdress = adress('vafab', 'Storgatan 21', 'Heby', 'Heby kommun')
    stubSources({ vafab: [vasteras, hebyAdress] }, { vafab: { 'västerås': 'Västerås kommun', heby: 'Heby kommun' } })
    const { searchInKommun } = await import('./registry')
    const { addresses } = await searchInKommun(heby).search('Storgatan 2')
    expect(addresses.map((a) => a.locality)).toEqual(['Heby'])
    expect(addresses[0].kommun).toBe('Heby kommun')
  })

  it('behåller en adress vars ort inte går att slå upp: den kan ligga i kommunen', async () => {
    stubSources({ vafab: [adress('vafab', 'Storgatan 2', 'Okänd by', 'Okänd by')] }, { vafab: {} })
    const { searchInKommun } = await import('./registry')
    const { addresses } = await searchInKommun(heby).search('Storgatan 2')
    expect(addresses.map((a) => a.locality)).toEqual(['Okänd by'])
  })

  it('frågar också med kommunens huvudort när svaret är avkortat, så att kommunens adress inte trängs ut', async () => {
    const andra = Array.from({ length: 10 }, (_, i) => adress('vafab', `Storgatan 2${i}`, 'Västerås', 'Västerås kommun'))
    const f = stubSources(
      { vafab: [...andra, adress('vafab', 'Storgatan 2', 'Heby', 'Heby kommun')] },
      { vafab: { 'västerås': 'Västerås kommun', heby: 'Heby kommun' } },
    )
    // Som källorna: högst tio träffar per fråga.
    const inner = f.getMockImplementation()!
    f.mockImplementation(async (url: string) => {
      const res = await inner(url)
      if (!url.startsWith('/api/sok')) return res
      const body = (await res.json()) as { addresses: Address[]; failed: string[] }
      return Response.json({ ...body, addresses: body.addresses.slice(0, 10) })
    })
    const { searchInKommun } = await import('./registry')
    const { addresses } = await searchInKommun(heby).search('Storgatan 2')
    expect(addresses.map((a) => a.locality)).toEqual(['Heby'])
  })

  it('ger förslag bara från kommunens källor', async () => {
    stubSources({})
    const { searchInKommun } = await import('./registry')
    expect(await searchInKommun(uppsala).suggest('Storgtan 12')).toEqual([])
    const avesta = await searchInKommun({ code: '2084', name: 'Avesta kommun' }).suggest('Storgtan 12')
    expect(avesta.map((a) => a.sourceId)).toEqual(['avesta'])
  })

  it('lämnar sökningen utan kommun orörd: den frågar alla källor gatan finns hos', async () => {
    const f = stubSources({ uppsala: [inUppsala], stockholm: [inStockholm] })
    const { searchAll } = await import('./registry')
    const { addresses } = await searchAll('Storgatan 2')
    expect(new Set(addresses.map((a) => a.sourceId))).toEqual(new Set(['uppsala', 'stockholm']))
    expect(new Set(asked(f))).toEqual(new Set(['stockholm', 'uppsala', 'vafab']))
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
    expect(sokCalls(f)).toHaveLength(4) // ett nytt försök per sökning
  })

  it('frågar en källa som inte svarade en gång till, eftersom den ofta bara var sömnig', async () => {
    let attempts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/data/gator/st.json') return Response.json({ storgatan: ['uppsala'] })
        if (url === '/data/orter.json') return Response.json({})
        if (url.startsWith('/api/sok')) {
          attempts++
          return Response.json(attempts === 1 ? { addresses: [], failed: ['uppsala'] } : { addresses: [up('Storgatan 2')], failed: [] })
        }
        return new Response('', { status: 404 })
      }),
    )
    const { searchAll } = await import('./registry')
    const result = await searchAll('Storgatan')
    expect(attempts).toBe(2)
    expect(result.failed).toEqual([])
    expect(result.addresses.map((x) => x.street)).toContain('Storgatan 2')
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
    expect([...new Set(asked)].sort()).toEqual([...live].sort())
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

describe('missingKommuner', () => {
  const sverige = {
    kommuner: { '2083': 'Hedemora kommun', '0380': 'Uppsala kommun', '0882': 'Oskarshamns kommun' },
    orter: { hedemora: ['2083'], uppsala: ['0380'], oskarshamn: ['0882'] },
  }

  function stubFetch(ok = true) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/data/sverige.json') return ok ? Response.json(sverige) : new Response('', { status: 500 })
        if (url === '/data/gator/st.json') return Response.json({ storgatan: ['avesta', 'uppsala'] })
        return new Response('', { status: 404 })
      }),
    )
  }

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.resetModules()
    await import('@/test/show-hidden-sources')
  })

  async function missing(query: string) {
    const { missingKommuner } = await import('./registry')
    return missingKommuner(query)
  }

  it('ger kommunen när orten ligger i en kommun som Sopor inte har', async () => {
    stubFetch()
    expect(await missing('Storgatan 12, Hedemora')).toEqual(['Hedemora kommun'])
    expect(await missing('Storgatan 12 hedemora')).toEqual(['Hedemora kommun'])
  })

  it('ger inget för kommuner som Sopor har, helt eller delvis', async () => {
    stubFetch()
    expect(await missing('Storgatan 12 Uppsala')).toEqual([])
    expect(await missing('Storgatan 12 Oskarshamn')).toEqual([])
  })

  it('ger inget utan ort eller med en okänd ort', async () => {
    stubFetch()
    expect(await missing('Storgatan 12')).toEqual([])
    expect(await missing('Storgatan 12 Hedemor')).toEqual([])
  })

  it('frågar inga källor när orten ligger i en kommun som Sopor inte har', async () => {
    stubFetch()
    const { searchAll } = await import('./registry')
    const result = await searchAll('Storgatan 12, Hedemora', undefined, undefined, { submitted: true })
    expect(result.addresses.filter((a) => a.sourceId !== 'avesta')).toEqual([])
    const calls = vi.mocked(fetch).mock.calls.map(([u]) => String(u))
    expect(calls.filter((u) => u.startsWith('/api/sok'))).toEqual([])
  })

  it('ger inget när ortfilen inte går att hämta', async () => {
    stubFetch(false)
    expect(await missing('Storgatan 12, Hedemora')).toEqual([])
  })
})

describe('kommunStatus', () => {
  const sverige = {
    kommuner: { '2083': 'Hedemora kommun', '0380': 'Uppsala kommun', '0882': 'Oskarshamns kommun' },
    orter: { hedemora: ['2083'], uppsala: ['0380'], storvreta: ['0380'], oskarshamn: ['0882'], bergby: ['0380', '2083'] },
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function status(place: string, ok = true) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/data/orter.json') return Response.json({ uppsala: { 'gamla uppsala': 'Uppsala kommun', bergby: 'Uppsala kommun' } })
        return ok ? Response.json(sverige) : new Response('', { status: 500 })
      }),
    )
    const { kommunStatus } = await import('./registry')
    return kommunStatus(place)
  }

  it('säger om kommunen finns, också när man skriver en ort i den', async () => {
    expect(await status('Uppsala')).toEqual([{ name: 'Uppsala kommun', covered: true }])
    expect(await status(' storvreta ')).toEqual([{ name: 'Uppsala kommun', covered: true }])
    expect(await status('Hedemora')).toEqual([{ name: 'Hedemora kommun', covered: false }])
  })

  it('känner igen stadsdelar från källornas egna orter', async () => {
    expect(await status('Gamla Uppsala')).toEqual([{ name: 'Uppsala kommun', covered: true }])
  })

  it('räknar inte kommuner där en källa bara har en del adresser', async () => {
    expect(await status('Oskarshamn')).toEqual([{ name: 'Oskarshamns kommun', covered: false }])
  })

  it('ger en rad per kommun för orter i flera kommuner', async () => {
    expect(await status('Bergby')).toEqual([
      { name: 'Uppsala kommun', covered: true },
      { name: 'Hedemora kommun', covered: false },
    ])
  })

  it('ger en tom lista för okända orter', async () => {
    expect(await status('Xyzby')).toEqual([])
  })

  it('ger null när ortfilen inte går att hämta', async () => {
    expect(await status('Uppsala', false)).toBeNull()
  })
})

describe('placeSuggestions', () => {
  const sverige = {
    kommuner: { '2084': 'Avesta kommun', '0380': 'Uppsala kommun', '0180': 'Stockholms kommun' },
    orter: { avesta: ['2084'], avestaby: ['2084'], uppsala: ['0380'], stockholm: ['0180'], stockholms: ['0180'] },
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function suggest(prefix: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/data/orter.json' ? Response.json({ uppsala: { 'uppsala näs': 'Uppsala kommun' } }) : Response.json(sverige),
      ),
    )
    const { placeSuggestions } = await import('./registry')
    return placeSuggestions(prefix)
  }

  it('föreslår orter som börjar som det man skrivit, kortast först', async () => {
    expect((await suggest('aves')).map((s) => s.place)).toEqual(['Avesta', 'Avestaby'])
  })

  it('tar med källornas orter och säger vilken kommun de ligger i', async () => {
    expect(await suggest('Uppsala n')).toEqual([{ place: 'Uppsala Näs', kommuner: [{ name: 'Uppsala kommun', covered: true }] }])
  })

  it('visar inte genitivformen av en kommun som ett eget förslag', async () => {
    expect((await suggest('stockh')).map((s) => s.place)).toEqual(['Stockholm'])
  })

  it('föreslår inget för en enda bokstav', async () => {
    expect(await suggest('a')).toEqual([])
  })
})
