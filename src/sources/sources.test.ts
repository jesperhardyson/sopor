import { describe, expect, it } from 'vitest'
import { ALL_SOURCES, getSource, kommunForLocality, SOURCES, sourceLabel, supportedKommuner, type Source } from './index'

describe('källregistret', () => {
  it('har unika och URL-säkra id', () => {
    const ids = ALL_SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('har Avesta som dold statisk källa med testdata', () => {
    const avesta = ALL_SOURCES.find((s) => s.id === 'avesta')!
    expect(avesta.config).toEqual({ system: 'static' })
    expect(avesta.kommuner).toEqual([{ code: '2084', name: 'Avesta kommun' }])
    expect(avesta).toMatchObject({ testData: true, hidden: true })
  })

  it('visar inte dolda källor', () => {
    expect(SOURCES.some((s) => s.hidden)).toBe(false)
    expect(getSource('avesta')).toBeUndefined()
    expect(supportedKommuner().map((k) => k.name)).not.toContain('Avesta kommun')
  })

  it('listar kommunerna som stöds, sorterade och utan dubbletter', () => {
    const names = supportedKommuner().map((k) => k.name)
    expect(names).toEqual([...new Set(names)].sort((a, b) => a.localeCompare(b, 'sv')))
    expect(names).toContain('Uppsala kommun')
  })

  it('namnger en källa efter kommunerna, inte efter bolaget', () => {
    expect(sourceLabel(getSource('uppsala')!)).toBe('Uppsala kommun')
    expect(sourceLabel(getSource('herrljunga-vargarda')!)).toBe('Herrljunga kommun och Vårgårda kommun')
  })
})

describe('kommunForLocality', () => {
  const sydost: Source = {
    id: 'sydost',
    name: 'Sydost AB',
    url: 'https://x',
    kommuner: [{ code: '0880', name: 'Kalmar kommun' }, { code: '0840', name: 'Mörbylånga kommun' }],
    config: { system: 'edp', baseUrl: 'https://x' },
  }
  const places = { kalmar: 'Kalmar kommun', 'kalmar smedby': 'Kalmar kommun', färjestaden: 'Mörbylånga kommun' }

  it('slår upp orten oavsett skiftläge och skiljetecken', () => {
    expect(kommunForLocality(sydost, 'KALMAR', places)).toBe('Kalmar kommun')
    expect(kommunForLocality(sydost, 'Kalmar-Smedby', places)).toBe('Kalmar kommun')
    expect(kommunForLocality(sydost, 'Färjestaden', places)).toBe('Mörbylånga kommun')
  })

  it('visar orten, inte källans namn, när orten saknas i tabellen', () => {
    expect(kommunForLocality(sydost, 'Vetlanda', places)).toBe('Vetlanda')
    expect(kommunForLocality(sydost, 'Vetlanda')).toBe('Vetlanda')
  })

  it('ger kommunen direkt för källor med en kommun', () => {
    expect(kommunForLocality({ ...sydost, kommuner: [sydost.kommuner[0]] }, 'Var som helst')).toBe('Kalmar kommun')
  })

  it('slår upp orten när källan har en kommun men även grannkommuner', () => {
    const source = { ...sydost, kommuner: [sydost.kommuner[0]], grannkommuner: [{ code: '0685', name: 'Vetlanda kommun' }] }
    expect(kommunForLocality(source, 'Korsberga', { korsberga: 'Vetlanda kommun' })).toBe('Vetlanda kommun')
  })
})
