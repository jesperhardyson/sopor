import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DataError } from '@/data/static-format'
import { SOURCES, type Source } from '@/sources'
import { buildKommunPages, kommunSlug } from './kommun-pages'
import type { SwedenPlacesFile } from './sweden-places'
import lockedSlugs from './kommun-slugs.json'

const file = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../data/sverige/orter.json'), 'utf8')) as SwedenPlacesFile
const pages = buildKommunPages(file, SOURCES)
const page = (code: string) => pages.find((p) => p.code === code)!

const source = (over: Partial<Source>): Source => ({
  id: 'test',
  name: 'Testbolaget',
  url: 'https://example.se',
  kommuner: [{ code: '0380', name: 'Uppsala kommun' }],
  config: { system: 'static' },
  ...over,
})
const small: SwedenPlacesFile = {
  source: 'test',
  updatedAt: '2026-11-04',
  kommuner: { '0380': 'Uppsala kommun', '1480': 'Göteborgs kommun', '0980': 'Region Gotland' },
  orter: { Angered: ['1480'], Göteborg: ['1480'], Uppsala: ['0380'] },
}

describe('kommunSlug', () => {
  it.each([
    ['0380', 'Uppsala kommun', 'uppsala-kommun'],
    ['1480', 'Göteborgs kommun', 'goteborgs-kommun'],
    ['0980', 'Region Gotland', 'region-gotland'],
    ['0643', 'Habo kommun', 'habo-kommun'],
  ])('%s %s blir %s', (code, name, slug) => {
    expect(kommunSlug(code, name)).toBe(slug)
  })

  it('skiljer Håbo från Habo', () => {
    expect(kommunSlug('0305', 'Håbo kommun')).toBe('haabo-kommun')
  })
})

describe('buildKommunPages', () => {
  it('ger en sida för varje kommun, med unika sluggar', () => {
    expect(pages).toHaveLength(290)
    expect(new Set(pages.map((p) => p.slug)).size).toBe(290)
  })

  it('ändrar aldrig en publicerad slug', () => {
    expect(Object.fromEntries(pages.map((p) => [p.code, p.slug]))).toEqual(lockedSlugs)
  })

  it('sorterar på namn enligt svenska alfabetet', () => {
    const names = pages.map((p) => p.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'sv')))
  })

  it('visar källan och alla orter för en kommun som finns, med huvudorten först', () => {
    const uppsala = page('0380')
    expect(uppsala.covered).toBe(true)
    expect(uppsala.sources).toContainEqual({ name: 'Uppsala Vatten', url: 'https://www.uppsalavatten.se' })
    expect(uppsala.orter[0]).toBe('Uppsala')
    expect(uppsala.orter).toContain('Storvreta')
  })

  it('hittar huvudorten även när kommunens namn står i genitiv', () => {
    expect(buildKommunPages(small, []).find((p) => p.code === '1480')!.orter).toEqual(['Göteborg', 'Angered'])
  })

  it('delar upp sammansatta ortnamn och tar bort förklaringar och dubbletter', () => {
    const file = { ...small, orter: { 'Gunnilse (östra delen)': ['1480'], Gunnilse: ['1480'], 'Gundal och Högås': ['1480'], Göteborg: ['1480'] } }
    expect(buildKommunPages(file, []).find((p) => p.code === '1480')!.orter).toEqual(['Göteborg', 'Gundal', 'Gunnilse', 'Högås'])
  })

  it('tål en kommun utan orter', () => {
    expect(buildKommunPages(small, []).find((p) => p.code === '0980')!.orter).toEqual([])
  })

  it('räknar en kommun utan källa som saknad', () => {
    expect(page('1480')).toMatchObject({ covered: false, sources: [] })
  })

  it('visar inte dold testdata: Avesta räknas som saknad', () => {
    expect(page('2084')).toMatchObject({ covered: false, sources: [] })
  })

  it('räknar inte en grannkommun som täckt', () => {
    const pages = buildKommunPages(small, [source({ grannkommuner: [{ code: '1480', name: 'Göteborgs kommun' }] })])
    expect(pages.find((p) => p.code === '1480')!.covered).toBe(false)
  })

  it('listar alla källor för en kommun med flera', () => {
    const pages = buildKommunPages(small, [source({}), source({ id: 'annan', name: 'Annat bolag' })])
    expect(pages.find((p) => p.code === '0380')!.sources.map((s) => s.name)).toEqual(['Testbolaget', 'Annat bolag'])
  })

  it('stoppar en källa som heter kommuner, eftersom det ordet är en sökväg på sajten', () => {
    expect(() => buildKommunPages(small, [source({ id: 'kommuner' })])).toThrow(DataError)
  })

  it('stoppar en källkommun som saknas i kommunlistan', () => {
    expect(() => buildKommunPages(small, [source({ kommuner: [{ code: '9999', name: 'Okänd kommun' }] })])).toThrow(DataError)
  })

  it('stoppar två kommuner med samma slug', () => {
    const krock = { ...small, kommuner: { '0001': 'Samma kommun', '0002': 'Sämma kommun' } }
    expect(() => buildKommunPages(krock, [])).toThrow(DataError)
  })
})
