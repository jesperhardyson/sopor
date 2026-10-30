import { describe, expect, it } from 'vitest'
import { getSource, SOURCES, supportedKommuner } from './index'

describe('källregistret', () => {
  it('har unika och URL-säkra id', () => {
    const ids = SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('har Avesta som statisk källa med testdata', () => {
    const avesta = getSource('avesta')!
    expect(avesta.config).toEqual({ system: 'static' })
    expect(avesta.kommuner).toEqual([{ code: '2084', name: 'Avesta kommun' }])
    expect(avesta.testData).toBe(true)
  })

  it('listar kommunerna som stöds, sorterade och utan dubbletter', () => {
    const names = supportedKommuner().map((k) => k.name)
    expect(names).toEqual([...new Set(names)].sort((a, b) => a.localeCompare(b, 'sv')))
    expect(names).toContain('Avesta kommun')
  })
})
