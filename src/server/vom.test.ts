import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceError } from './http.js'
import { clearVomCache, vomAddressId, vomCode, vomFind, vomSchedule, vomSearch } from './vom.js'

const RESOURCE = '4.19317d4219c47956faa53c9/12.19317d4219c47956faa53d3'
const fixture = readFileSync(path.resolve(import.meta.dirname, '__fixtures__', 'vom-adresser.json'), 'utf8')
const json = (body: string) => new Response(body, { headers: { 'Content-Type': 'application/json;charset=UTF-8' } })
const respond = (body = fixture) => vi.fn(async () => json(body)) as unknown as typeof fetch & ReturnType<typeof vi.fn>
const dates = (code: string, today = '2026-11-17') => vomSchedule(code, today).events.map((e) => e.date)

beforeEach(() => clearVomCache())

describe('koden', () => {
  it('läser frekvens, paritet och veckodag', () => {
    expect(vomCode('h211')).toEqual({ every: 2, parity: 'udda', weekday: 1 })
    expect(vomCode('h225')).toEqual({ every: 2, parity: 'jämn', weekday: 5 })
    expect(vomCode('h114')).toEqual({ every: 1, weekday: 4 })
    expect(vomCode('h117')).toEqual({ every: 1, weekday: 0 })
  })

  it('känner inte igen andra koder', () => {
    for (const code of ['h411', 'bud', '', 'h230', 'h218', 'H211']) expect(vomCode(code)).toBeNull()
  })
})

describe('adress-id', () => {
  it('låser formatet', () => {
    expect(vomAddressId('algatan 1', 'sveg')).toBe(vomAddressId('Algatan 1', ' Sveg '))
    expect(vomAddressId('algatan 1', 'sveg')).toMatch(/^algatan-1_sveg-[0-9a-z]+$/)
  })
})

describe('sökningen', () => {
  it('hämtar kommunens lista med Sopors anrop', async () => {
    const fetchFn = respond()
    await vomSearch(RESOURCE, 'Algatan', fetchFn)
    expect(String(fetchFn.mock.calls[0][0])).toBe(`https://www.vattenmiljoresurs.se/appresource/${RESOURCE}/allAddresses`)
  })

  it('hittar adresser som börjar med gatan, med versaler', async () => {
    const found = await vomSearch(RESOURCE, 'algatan 1', respond())
    expect(found.map((a) => `${a.building.street}, ${a.building.locality}`)).toEqual(['Algatan 1', 'Algatan 11', 'Algatan 13', 'Algatan 15'].map((s) => `${s}, Sveg`))
    expect(found[0].building.buildingId).toBeTruthy()
    expect(found[0].code).toBe('h211')
  })

  it('tar bort orten ur sökningen', async () => {
    expect(await vomSearch(RESOURCE, 'Algatan 1, Sveg', respond())).toHaveLength(4)
  })

  it('skriver bokstäver efter numret med versaler och trimmar orten', async () => {
    expect((await vomSearch(RESOURCE, 'Sonfjällsgatan 12 a', respond())).map((a) => a.building.street)).toEqual(['Sonfjällsgatan 12 A', 'Sonfjällsgatan 12 A-E'])
    expect((await vomSearch(RESOURCE, 'Björnrike', respond()))[0].building.locality).toBe('Vemdalen')
  })

  it('visar inte adresser med tecken som inte kan ligga i ett id, men väl "samt"', async () => {
    expect((await vomSearch(RESOURCE, 'bakom hotellet', respond())).length).toBe(0)
    expect((await vomSearch(RESOURCE, 'bastugatan', respond())).map((a) => a.building.street)).toEqual(['Bastugatan 1 samt 1b'])
  })

  it('ger en dubblett en gång', async () => {
    expect(await vomSearch(RESOURCE, 'glissjöberg', respond())).toHaveLength(1)
  })

  it('ger inget för en tom sökning', async () => {
    const fetchFn = respond()
    expect(await vomSearch(RESOURCE, ' , ', fetchFn)).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('kastar SourceError när listan har ett annat format', async () => {
    await expect(vomSearch(RESOURCE, 'algatan', respond('{"adresser":[]}'))).rejects.toThrow(SourceError)
    await expect(vomSearch(RESOURCE, 'algatan', respond('{"allAddresses":[{"ort":"sveg"}]}'))).rejects.toThrow(SourceError)
  })

  it('hämtar listan en gång och sparar den i minnet', async () => {
    const fetchFn = respond()
    await vomSearch(RESOURCE, 'algatan', fetchFn)
    await vomSearch(RESOURCE, 'hede', fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe('uppslaget', () => {
  it('hittar adressen för ett id', async () => {
    const found = await vomFind(RESOURCE, vomAddressId('sonfjällsgatan 12 a-e', 'hede'), respond())
    expect(found).toMatchObject({ code: 'h225', building: { street: 'Sonfjällsgatan 12 A-E', locality: 'Hede' } })
  })

  it('ger null för ett id utan träff', async () => {
    expect(await vomFind(RESOURCE, vomAddressId('algatan 99', 'sveg'), respond())).toBeNull()
  })
})

describe('schemat', () => {
  it('räknar fram udda veckor med vecka 53 och vecka 1 i följd', () => {
    expect(dates('h211').slice(0, 5)).toEqual(['2026-11-30', '2026-12-14', '2026-12-28', '2027-01-04', '2027-01-18'])
  })

  it('räknar fram jämna veckor', () => {
    expect(dates('h225').slice(0, 3)).toEqual(['2026-11-27', '2026-12-11', '2026-12-25'])
  })

  it('räknar fram varje vecka, med i dag om det är tömningsdag', () => {
    expect(dates('h112').slice(0, 3)).toEqual(['2026-11-17', '2026-11-24', '2026-12-01'])
  })

  it('räknar tolv månader framåt', () => {
    expect(dates('h211').at(-1)! >= '2027-11-01').toBe(true)
    expect(dates('h211').at(-1)! < '2027-11-30').toBe(true)
  })

  it('märker alla datum som beräknade, med rest och mat', () => {
    const events = vomSchedule('h225', '2026-11-17').events
    expect(events.every((e) => e.estimated && e.fractions.join() === 'rest,mat')).toBe(true)
    expect(events.find((e) => e.date === '2026-12-25')?.warning).toContain('juldagen')
  })

  it('ger inget schema för en okänd kod', () => {
    expect(vomSchedule('h411', '2026-11-17').events).toEqual([])
    expect(vomSchedule('bud', '2026-11-17').events).toEqual([])
  })
})
