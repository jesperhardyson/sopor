import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { edpAddressId, idHash } from './edp'
import { SourceError } from './http'
import { srvKey } from './srv'
import { UDDEVALLA_URL, uddevallaDetails, uddevallaFind, uddevallaPickups, uddevallaSchedule, uddevallaSearch, uddevallaWasteType } from './uddevalla'

const fixture = (name: string) => readFileSync(path.resolve(import.meta.dirname, '__fixtures__', name), 'utf8')
const unknown = new SourceError('app.uddevallaenergi.se svarade med ett okänt format')
const json = (body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

const row = (plant_number: string, address = 'Kungsgatan 10, Uddevalla') => ({ plant_number, address, zip_city: address.split(', ')[1] })
const pickup = (type: string, pickup_date: unknown = '2026-11-05', extra = {}) => ({ type, address: 'Kungsgatan 10 ', pickup_date, has_deviating_date: false, message: '', week_type: 'Ordinarie', ...extra })

/** Sökningen svarar med `adresser` och tömningarna per plant_number, som app.uddevallaenergi.se. */
function fakeUddevalla({ adresser = fixture('uddevalla-adresser.json') as unknown, tomningar = {} as Record<string, unknown> } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/address-flat')) return json(adresser)
    return json(tomningar[url.searchParams.get('plant_number') ?? ''] ?? fixture('uddevalla-tomningar.json'))
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('idHash', () => {
  it('är samma hash som SRV:s och får aldrig ändras (regel 3)', () => {
    expect(idHash('100001')).toBe('s9pbrr')
    expect(srvKey('100001')).toBe('s9pbrr')
  })
})

describe('uddevallaSearch', () => {
  it('söker med sajtens identifierare, utan orten och det som följer numret', async () => {
    const fetchFn = fakeUddevalla()
    await uddevallaSearch('Södra Drottninggatan 15 -17, Uddevalla', fetchFn)
    await uddevallaSearch('Södra Drottninggatan 1A', fetchFn)
    expect(String(fetchFn.mock.calls[0][0])).toBe(`${UDDEVALLA_URL}/v2/address-flat?address=S%C3%B6dra+Drottninggatan+15`)
    expect(new URL(String(fetchFn.mock.calls[1][0])).searchParams.get('address')).toBe('Södra Drottninggatan 1')
    expect(new Headers(fetchFn.mock.calls[0][1]?.headers).get('X-App-Identifier')).toBe('www.uddevallaenergi.se')
  })

  it('ger gata, ort och en hash, utan bokstavsrubriker', async () => {
    const found = await uddevallaSearch('Kungsgatan', fakeUddevalla())
    expect(found[3].building).toMatchObject({ street: 'Kungsgatan 10', locality: 'Uddevalla', buildingId: idHash('FAKE0004+/=') })
    expect(found[3].plantNumber).toBe('FAKE0004+/=')
    expect(JSON.stringify(found.map((a) => a.building))).not.toContain('FAKE')
  })

  it('låser adress-id:t (regel 3)', async () => {
    const found = await uddevallaSearch('Kungsgatan', fakeUddevalla())
    expect(edpAddressId(found[3].building)).toBe(`kungsgatan-10_uddevalla-${idHash('FAKE0004+/=')}`)
  })

  it.each([
    ['ingen lista', { x: 1 }],
    ['plant_number saknas', [{ address: 'Kungsgatan 10, Uddevalla' }]],
    ['tom adress', [{ plant_number: 'a', address: ' ' }]],
  ])('kastar vid okänd form: %s', async (_, adresser) => {
    await expect(uddevallaSearch('x', fakeUddevalla({ adresser }))).rejects.toEqual(unknown)
  })
})

describe('uddevallaFind', () => {
  const ID = `kungsgatan-10_uddevalla-${idHash('A')}`

  it('hittar träffen på samma adress vars hash står i id:t', async () => {
    const fetchFn = fakeUddevalla({ adresser: [row('B'), row('A'), row('C', 'Kungsgatan 101, Uddevalla')] })
    const found = await uddevallaFind(ID, fetchFn)
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('address')).toBe('kungsgatan 10')
    expect(found?.plantNumber).toBe('A')
  })

  it('tål ett nytt plant_number när det är den enda träffen på adressen, och behåller id:t', async () => {
    const found = await uddevallaFind(ID, fakeUddevalla({ adresser: [row('NY')] }))
    expect(found?.plantNumber).toBe('NY')
    expect(edpAddressId(found!.building)).toBe(ID)
  })

  it('gissar inte när flera träffar finns på adressen, och ger null för ett oläsbart id', async () => {
    expect(await uddevallaFind(ID, fakeUddevalla({ adresser: [row('B'), row('C')] }))).toBeNull()
    expect(await uddevallaFind('x', fakeUddevalla())).toBeNull()
  })
})

describe('uddevallaWasteType', () => {
  it('tar bort volymen och läser fraktionen', () => {
    expect(uddevallaWasteType('370 l kärl 1')).toEqual({ fractions: ['karl'], label: 'Fyrfackskärl 1' })
    expect(uddevallaWasteType('370 l kärl 2')).toEqual({ fractions: ['karl'], label: 'Fyrfackskärl 2' })
    expect(uddevallaWasteType('140 l Matkärl')).toEqual({ fractions: ['mat'] })
    expect(uddevallaWasteType('660 l Restavfall')).toEqual({ fractions: ['rest'] })
    expect(uddevallaWasteType('10 m3 Container')).toEqual({ fractions: ['karl'], label: '10 m3 Container' })
  })
})

describe('uddevallaSchedule', () => {
  it('ger nästa tömning per kärl, sammanslagen per dag', async () => {
    const schedule = uddevallaSchedule(await uddevallaPickups('A', fakeUddevalla()), '2026-11-04')
    expect(schedule.events).toEqual([{ date: '2026-11-04', fractions: ['rest', 'mat'], estimated: false }])
  })

  it('läser fyrfackskärlen', async () => {
    const tomningar = { A: fixture('uddevalla-tomningar-fyrfack.json') }
    const schedule = uddevallaSchedule(await uddevallaPickups('A', fakeUddevalla({ tomningar })), '2026-11-04')
    expect(schedule.events).toEqual([
      { date: '2026-11-06', fractions: ['karl'], estimated: false, labels: { karl: 'Fyrfackskärl 1' } },
      { date: '2026-11-27', fractions: ['karl'], estimated: false, labels: { karl: 'Fyrfackskärl 2' } },
    ])
  })

  it('tar bort passerade datum, hoppar över rader utan datum och varnar för flyttade tömningar', async () => {
    const tomningar = {
      A: [pickup('140 l Matkärl', '2026-11-03'), pickup('660 l Restavfall', null), pickup('660 l Restavfall', '2026-11-05', { has_deviating_date: true })],
    }
    const schedule = uddevallaSchedule(await uddevallaPickups('A', fakeUddevalla({ tomningar })), '2026-11-04')
    expect(schedule.events).toEqual([{ date: '2026-11-05', fractions: ['rest'], estimated: false, warning: 'Flyttad tömning enligt Uddevalla Energi.' }])
  })

  it.each([
    ['ingen lista', { x: 1 }],
    ['type saknas', [{ pickup_date: '2026-11-05' }]],
    ['datum i fel format', [pickup('660 l Restavfall', '5 nov')]],
  ])('kastar vid okänd form: %s', async (_, svar) => {
    await expect(uddevallaPickups('A', fakeUddevalla({ tomningar: { A: svar } }))).rejects.toEqual(unknown)
  })
})

describe('uddevallaDetails', () => {
  const details = async (tomningar: Record<string, unknown>) => {
    const fetchFn = fakeUddevalla({ adresser: [row('A'), row('B'), row('C', 'Kungsgatan 11, Uddevalla')], tomningar })
    return (await uddevallaDetails(await uddevallaSearch('Kungsgatan', fetchFn), '2026-11-04', fetchFn)).map(([b, d]) => [b.street, d ?? null])
  }

  it('skiljer flera träffar på samma adress åt med kärlen, utan volym', async () => {
    expect(await details({ A: [pickup('660 l Restavfall'), pickup('140 l Matkärl')], B: [pickup('370 l kärl 1')] })).toEqual([
      ['Kungsgatan 10', 'Matkärl, Restavfall'],
      ['Kungsgatan 10', 'Kärl 1'],
      ['Kungsgatan 11', null],
    ])
  })

  it('lägger till nästa tömning när kärlen är lika', async () => {
    const result = await details({ A: [pickup('660 l Restavfall', '2026-11-05')], B: [pickup('660 l Restavfall', '2026-11-09')] })
    expect(result.slice(0, 2)).toEqual([
      ['Kungsgatan 10', 'Restavfall, nästa Tor 5 nov'],
      ['Kungsgatan 10', 'Restavfall, nästa Mån 9 nov'],
    ])
  })

  it('visar samma schema en gång, utan särskiljare', async () => {
    expect(await details({ A: [pickup('660 l Restavfall')], B: [pickup('660 l Restavfall')] })).toEqual([
      ['Kungsgatan 10', null],
      ['Kungsgatan 11', null],
    ])
  })

  it('ger ingen särskiljare, i stället för ett fel, när kärlen inte går att hämta', async () => {
    const result = await details({ A: '{"x":1}', B: [pickup('660 l Restavfall')] })
    expect(result.slice(0, 2)).toEqual([
      ['Kungsgatan 10', null],
      ['Kungsgatan 10', 'Restavfall'],
    ])
  })
})
