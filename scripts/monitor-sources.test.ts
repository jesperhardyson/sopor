import { describe, expect, it, vi } from 'vitest'
import { isLive, SOURCES, type Source } from '../src/sources/index.js'
import { formatTable, PROBES, runChecks } from './monitor-sources'
import type { SourceResult } from './source-checks'

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })

const edp = (id: string): Source => ({
  id,
  name: `Källa ${id}`,
  url: 'https://example.se',
  kommuner: [{ code: '9999', name: 'Testkommun' }],
  config: { system: 'edp', baseUrl: `https://${id}.example.se/FutureWeb` },
})
const rest = { WasteType: 'Restavfall', NextWastePickup: '2026-11-10', WastePickupsPerYear: 26, WastePickupFrequency: 'Varannan vecka' }

describe('kontrolladresserna', () => {
  const live = SOURCES.filter(isLive).map((s) => s.id)

  it.each(live)('finns för %s. Lägg till en i PROBES i scripts/monitor-sources.ts', (id) => {
    expect(PROBES[id]).toBeTruthy()
  })

  it('har VA Syds kontrolladress', () => {
    expect(PROBES.vasyd).toBe('Limhamnsvägen 50, Malmö')
  })

  it('har NSR:s, SRV:s, Appbolagets, Uddevallas och Roslagsvattens kontrolladresser som adress-id', () => {
    expect(PROBES.nsr).toBe('rosenvägen-3_helsingborg-71d627516ce56271010a40fdb5d01eed')
    expect(PROBES.srv).toBe('kommunalvägen-28_huddinge-iokpga')
    expect(PROBES.kristianstad).toBe('västra-storgatan-1_kristianstad-1ec2efb9115c4c52927474398e9f427f')
    expect(PROBES.hassleholm).toBe('storgatan-1_vinslöv-4fcea8031a2649a1b66fb41a631ed823')
    expect(PROBES.uddevalla).toBe('kungsgatan-10_uddevalla-ebui9d')
    expect(PROBES.osteraker).toBe('hackstavägen-22_åkersberga-1bqsdr9')
    expect(PROBES.ekero).toBe('tappströmsvägen-2_ekerö-ouhkuq')
    expect(PROBES.vaxholm).toBe('eriksövägen-27_vaxholm-1wkxke4')
  })

  it('har Stockholms kontrolladress', () => {
    expect(PROBES.stockholm).toBe('Hjortronvägen 3, Bromma, 168 59')
  })

  it('finns bara för källor som finns', () => {
    expect(Object.keys(PROBES).filter((id) => !live.includes(id))).toEqual([])
  })
})

describe('runChecks', () => {
  it('provar igen en gång, och bara för källor som inte svarade', async () => {
    const calls: string[] = []
    let flaky = 0
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      calls.push(url.host)
      if (url.host === 'flaky.example.se' && url.pathname.endsWith('/SearchAdress') && flaky++ === 0) {
        throw new TypeError('fetch failed')
      }
      return url.pathname.endsWith('/SearchAdress') ? json({ Buildings: ['Storgatan 1, Test (1)'] }) : json({ RhServices: [rest] })
    }) as unknown as typeof fetch

    const results = await runChecks([edp('flaky'), edp('stable')], '2026-11-02', {
      fetchFn,
      retryDelaysMs: [0],
      probes: { flaky: 'Storgatan 1', stable: 'Storgatan 1' },
    })

    expect(results.map((r) => [r.sourceId, r.state])).toEqual([
      ['flaky', 'fungerar'],
      ['stable', 'fungerar'],
    ])
    expect(calls.filter((h) => h === 'stable.example.se')).toHaveLength(2)
    expect(calls.filter((h) => h === 'flaky.example.se')).toHaveLength(3)
  })

  it('provar i flera omgångar, och slutar när källan svarar', async () => {
    let failures = 2
    const hosts: string[] = []
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      hosts.push(url.host)
      if (url.pathname.endsWith('/SearchAdress') && failures-- > 0) return new Response('', { status: 500 })
      return url.pathname.endsWith('/SearchAdress') ? json({ Buildings: ['Storgatan 1, Test (1)'] }) : json({ RhServices: [rest] })
    }) as unknown as typeof fetch

    const [r] = await runChecks([edp('seg')], '2026-11-02', { fetchFn, retryDelaysMs: [0, 0, 0], probes: { seg: 'Storgatan 1' } })

    expect(r.state).toBe('fungerar')
    expect(hosts.filter((h) => h === 'seg.example.se')).toHaveLength(4)
  })

  it('räknas som svarar inte först när alla omgångar har prövats', async () => {
    const hosts: string[] = []
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      hosts.push(new URL(String(input)).host)
      return new Response('', { status: 500 })
    }) as unknown as typeof fetch

    const [r] = await runChecks([edp('nere')], '2026-11-02', { fetchFn, retryDelaysMs: [0, 0, 0], probes: { nere: 'Storgatan 1' } })

    expect(r.state).toBe('svarar-inte')
    expect(hosts.filter((h) => h === 'nere.example.se')).toHaveLength(4)
  })

  /** Källan "spärrad" når bara sajten; sajten själv svarar som anges. */
  function blockedFromGitHub(site: { failed?: string[]; edp?: 'html' } = {}) {
    const hosts: string[] = []
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      hosts.push(url.host)
      if (url.host === 'sopor.hardyson.se') {
        return url.pathname === '/api/v1/sok'
          ? json({ addresses: site.failed ? [] : [{ id: 'a-1', url: 'https://sopor.hardyson.se/api/v1/adress/sparrad/a-1' }], failed: site.failed ?? [] })
          : json({ events: [{ date: '2026-11-10', fractions: ['rest'] }] })
      }
      if (url.host === 'sparrad.example.se') {
        if (site.edp === 'html') return new Response('<html>Request Rejected</html>', { headers: { 'Content-Type': 'text/html' } })
        throw new TypeError('fetch failed')
      }
      return url.pathname.endsWith('/SearchAdress') ? json({ Buildings: ['Storgatan 1, Test (1)'] }) : json({ RhServices: [rest] })
    }) as unknown as typeof fetch
    return { fetchFn, hosts }
  }
  const probes = { sparrad: 'Storgatan 1', stable: 'Storgatan 1' }

  it('frågar sajten när en källa inte svarar härifrån, och då blir det inget ärende', async () => {
    const { fetchFn, hosts } = blockedFromGitHub()
    const results = await runChecks([edp('sparrad'), edp('stable')], '2026-11-02', { fetchFn, retryDelaysMs: [0], probes })
    expect(results[0]).toMatchObject({ sourceId: 'sparrad', state: 'fungerar', via: 'sajten' })
    expect(results[0].error).toContain('Ingen kontakt med sparrad.example.se')
    // Inget nytt försök behövs när sajten har svarat.
    expect(hosts.filter((h) => h === 'sparrad.example.se')).toHaveLength(1)
    expect(hosts.filter((h) => h === 'sopor.hardyson.se')).toHaveLength(2)
  })

  it('frågar sajten när en brandvägg svarar med en HTML-sida', async () => {
    const { fetchFn } = blockedFromGitHub({ edp: 'html' })
    const [r] = await runChecks([edp('sparrad')], '2026-11-02', { fetchFn, retryDelaysMs: [0], probes })
    expect(r).toMatchObject({ state: 'fungerar', via: 'sajten' })
  })

  it('räknar källan som avbruten när den inte svarar via sajten heller, med båda felen', async () => {
    const { fetchFn } = blockedFromGitHub({ failed: ['sparrad'] })
    const [r] = await runChecks([edp('sparrad')], '2026-11-02', { fetchFn, retryDelaysMs: [0], probes })
    expect(r.state).toBe('svarar-inte')
    expect(r.via).toBeUndefined()
    expect(r.error).toContain('Ingen kontakt med sparrad.example.se')
    expect(r.error).toContain('Via sajten: Sajten fick inget svar från källan')
  })

  it('frågar inte sajten när källan svarade men med fel innehåll', async () => {
    const hosts: string[] = []
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      hosts.push(new URL(String(input)).host)
      return new Response('Not found', { status: 404 })
    }) as unknown as typeof fetch
    const [r] = await runChecks([edp('stable')], '2026-11-02', { fetchFn, retryDelaysMs: [0], probes })
    expect(r.state).toBe('nytt-format')
    expect(hosts).not.toContain('sopor.hardyson.se')
  })

  it('läser statiska källors datafiler och gör inga anrop', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    const results = await runChecks([{ ...edp('fil'), config: { system: 'static' } }], '2026-11-02', {
      fetchFn,
      readValidTo: () => ['2027-01-10'],
    })
    expect(results[0].state).toBe('fungerar')
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('formatTable', () => {
  it('ger en rad per källa', () => {
    const results: SourceResult[] = [
      { sourceId: 'a', name: 'Uppsala Vatten', state: 'fungerar', unknownWasteTypes: ['Trädgårdsavfall'] },
      { sourceId: 'b', name: 'Lidköpings kommun', state: 'svarar-inte', error: 'futureweb.lidkoping.se svarade 502' },
      { sourceId: 'c', name: 'Bodens kommun', state: 'fungerar', via: 'sajten', error: 'Ingen kontakt med edpmobile.boden.se' },
    ]
    expect(formatTable(results)).toBe(
      [
        '| Källa | Läge | Fel | Okända avfallstyper |',
        '|---|---|---|---|',
        '| Uppsala Vatten | fungerar |  | Trädgårdsavfall |',
        '| Lidköpings kommun | svarar-inte | futureweb.lidkoping.se svarade 502 |  |',
        '| Bodens kommun | fungerar via sajten | Ingen kontakt med edpmobile.boden.se |  |',
      ].join('\n'),
    )
  })
})
