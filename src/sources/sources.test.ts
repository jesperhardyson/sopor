import { describe, expect, it } from 'vitest'
import { ALL_SOURCES, getSource, SOURCES, sourceLabel, supportedKommuner } from './index'

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
