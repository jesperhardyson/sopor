import { describe, expect, it, vi } from 'vitest'
import { SOURCES, type Source } from '../src/sources/index.js'
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
  const live = SOURCES.filter((s) => s.config.system === 'edp').map((s) => s.id)

  it.each(live)('finns för %s. Lägg till en i PROBES i scripts/monitor-sources.ts', (id) => {
    expect(PROBES[id]).toBeTruthy()
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
      retryDelayMs: 0,
      probes: { flaky: 'Storgatan 1', stable: 'Storgatan 1' },
    })

    expect(results.map((r) => [r.sourceId, r.state])).toEqual([
      ['flaky', 'fungerar'],
      ['stable', 'fungerar'],
    ])
    expect(calls.filter((h) => h === 'stable.example.se')).toHaveLength(2)
    expect(calls.filter((h) => h === 'flaky.example.se')).toHaveLength(3)
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
    ]
    expect(formatTable(results)).toBe(
      [
        '| Källa | Läge | Fel | Okända avfallstyper |',
        '|---|---|---|---|',
        '| Uppsala Vatten | fungerar |  | Trädgårdsavfall |',
        '| Lidköpings kommun | svarar-inte | futureweb.lidkoping.se svarade 502 |  |',
      ].join('\n'),
    )
  })
})
