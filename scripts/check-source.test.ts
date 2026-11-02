import { describe, expect, it, vi } from 'vitest'
import { candidateBaseUrls, checkSource, classifyWasteTypes, formatReport } from './check-source'

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
const html = () => new Response('<html>Logga in</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })

/** Svarar bara på den angivna sökvägen. Allt annat ger 404, som en riktig IIS. */
function fakeEdp(basePath: string, buildings: string[], services: unknown[] = []) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (!url.pathname.startsWith(`${basePath}/SimpleWastePickup/`)) return new Response('Not found', { status: 404 })
    if (url.pathname.endsWith('/SearchAdress')) return json({ Succeeded: true, Buildings: buildings })
    return json({ RhServices: services })
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('candidateBaseUrls', () => {
  it('provar de vanliga sökvägarna på värden', () => {
    expect(candidateBaseUrls('futureweb.example.se')).toEqual([
      'https://futureweb.example.se/FutureWeb',
      'https://futureweb.example.se/FutureWebBasic',
      'https://futureweb.example.se/EDPFutureWeb',
      'https://futureweb.example.se/EDP/FutureWebBasic',
    ])
  })

  it('provar varianterna med ort när en ort anges', () => {
    expect(candidateBaseUrls('minasidor.example.se', 'Varberg')).toEqual(
      expect.arrayContaining([
        'https://minasidor.example.se/Varberg/FutureWeb',
        'https://minasidor.example.se/Varberg/EDPFutureWeb',
        'https://minasidor.example.se/FutureWebVarberg',
        'https://minasidor.example.se/FutureWebVarbergBasic',
      ]),
    )
  })

  it('tar en hel adress med sökväg som den är', () => {
    expect(candidateBaseUrls('https://minasidor.example.se/FutureWebFalken/')).toEqual(['https://minasidor.example.se/FutureWebFalken'])
    expect(candidateBaseUrls('https://futureweb.example.se/')).toHaveLength(4)
  })
})

describe('classifyWasteTypes', () => {
  it('skiljer på kända, okända och överhoppade avfallstyper', () => {
    const rows = classifyWasteTypes([
      { WasteType: 'Restavfall', WastePickupFrequency: 'Varannan vecka' },
      { WasteType: 'Fyrfack 1', WastePickupFrequency: '' },
      { WasteType: 'Kärl 2', WastePickupFrequency: '', Description: 'Kärl 2, RE PL GF GO. 370L' },
      { WasteType: 'Trädgårdsavfall', WastePickupFrequency: '' },
      { WasteType: 'Slam', WastePickupFrequency: '' },
    ])
    expect(rows.map((r) => [r.wasteType, r.status, r.fractions])).toEqual([
      ['Restavfall', 'känd', ['rest']],
      ['Fyrfack 1', 'känd', ['karl']],
      ['Kärl 2', 'känd', ['rest', 'plast', 'glas']],
      ['Trädgårdsavfall', 'okänd', ['karl']],
      ['Slam', 'hoppas över', []],
    ])
  })
})

describe('checkSource', () => {
  const services = [
    { WasteType: 'Matavfall', WastePickupFrequency: 'Måndag varannan vecka', NextWastePickup: '2026-11-09', WastePickupsPerYear: 26 },
    { WasteType: 'Trädgårdsavfall', WastePickupFrequency: '', NextWastePickup: '2026-11-12', WastePickupsPerYear: 8 },
  ]

  it('hittar sökvägen som har data, hämtar schemat för första adressen och slutar sedan', async () => {
    const fetchFn = fakeEdp('/EDPFutureWeb', ['Storgatan 1, Byn (123)', 'Storgatan 1 B, Byn (124)'], services)
    const report = await checkSource('edp.example.se', 'Storgatan 1', { fetchFn })

    expect(report.baseUrl).toBe('https://edp.example.se/EDPFutureWeb')
    expect(report.addresses.map((a) => a.raw)).toEqual(['Storgatan 1, Byn (123)', 'Storgatan 1 B, Byn (124)'])
    expect(report.schedule?.address).toBe('Storgatan 1, Byn (123)')
    expect(report.schedule?.wasteTypes.map((w) => w.status)).toEqual(['känd', 'okänd'])
    expect(report.schedule?.events).toBeGreaterThan(0)
    // Tre sökvägar provades innan den rätta, plus ett anrop för schemat.
    expect(fetchFn).toHaveBeenCalledTimes(4)
    for (const [, init] of fetchFn.mock.calls) expect(new Headers(init?.headers).get('User-Agent')).toBe('Sopor/1.0 (+https://sopor.hardyson.se)')
  })

  it('säger att tjänsten svarar men är tom när ingen sökväg ger adresser', async () => {
    const report = await checkSource('tom.example.se', 'Storgatan 1', { fetchFn: fakeEdp('/FutureWeb', []) })
    expect(report.baseUrl).toBeUndefined()
    expect(report.emptyBaseUrls).toEqual(['https://tom.example.se/FutureWeb'])
    expect(formatReport(report)).toMatch(/svarar men gav inga adresser/)
  })

  it('rapporterar varje försök när ingen sökväg svarar med JSON', async () => {
    const fetchFn = vi.fn(async () => html()) as unknown as typeof fetch
    const report = await checkSource('ingen.example.se', 'Storgatan 1', { fetchFn })
    expect(report.tried).toHaveLength(4)
    expect(report.tried.every((t) => t.error?.includes('JSON'))).toBe(true)
    expect(formatReport(report)).toMatch(/Ingen EDP-tjänst/)
  })

  it('skriver baseUrl, adresser, fraktioner, okända avfallstyper och svarstid', async () => {
    const fetchFn = fakeEdp('/FutureWeb', ['Storgatan 1, Byn (123)'], services)
    const text = formatReport(await checkSource('edp.example.se', 'Storgatan 1', { fetchFn }))
    expect(text).toContain("baseUrl: 'https://edp.example.se/FutureWeb'")
    expect(text).toContain('Storgatan 1, Byn (123)')
    expect(text).toMatch(/Matavfall\s+→ mat/)
    expect(text).toMatch(/Okända avfallstyper.*Trädgårdsavfall/s)
    expect(text).toMatch(/\d+ ms/)
  })

  it('säger när baseUrl redan finns i registret', async () => {
    const fetchFn = fakeEdp('/Uppsala/FutureWeb', ['Storgatan 2, Uppsala (4004688)'], services)
    const report = await checkSource('futureweb.uppsalavatten.se', 'Storgatan 2', { ort: 'Uppsala', fetchFn })
    expect(report.existingSource).toBe('uppsala')
    expect(formatReport(report)).toContain("finns redan i registret som 'uppsala'")
  })
})
