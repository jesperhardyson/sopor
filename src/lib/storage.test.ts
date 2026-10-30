import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSaved, removeSaved, renameSaved, upsertSaved, type SavedAddress } from './storage'

const hemma: SavedAddress = {
  municipalityId: 'avesta',
  addressId: 'krylbo-storgatan-12b',
  name: 'Hemma',
  street: 'Storgatan 12 B',
  locality: 'Krylbo',
  savedAt: '2026-10-30T08:00:00.000Z',
}

describe('sparade adresser', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('är tom från början', () => {
    expect(loadSaved()).toEqual([])
  })

  it('sparar, byter namn och tar bort', () => {
    upsertSaved(hemma)
    expect(loadSaved()).toEqual([hemma])
    expect(renameSaved('avesta', 'krylbo-storgatan-12b', 'Stugan')[0].name).toBe('Stugan')
    expect(removeSaved('avesta', 'krylbo-storgatan-12b')).toEqual([])
    expect(loadSaved()).toEqual([])
  })

  it('ersätter i stället för att dubblera samma adress', () => {
    upsertSaved(hemma)
    upsertSaved({ ...hemma, name: 'Jobbet' })
    expect(loadSaved()).toEqual([{ ...hemma, name: 'Jobbet' }])
  })

  it('ger tom lista när lagringen kastar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(loadSaved()).toEqual([])
  })

  it('kraschar inte när det inte går att skriva', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    expect(upsertSaved(hemma)).toEqual([hemma])
  })

  it('ger tom lista vid trasig JSON eller fel form', () => {
    localStorage.setItem('sopor.saved.v1', '{trasig')
    expect(loadSaved()).toEqual([])
    localStorage.setItem('sopor.saved.v1', JSON.stringify({ inte: 'en lista' }))
    expect(loadSaved()).toEqual([])
    localStorage.setItem('sopor.saved.v1', JSON.stringify([hemma, { skräp: true }]))
    expect(loadSaved()).toEqual([hemma])
  })
})

describe('utan skrivbar lagring', () => {
  afterEach(() => vi.restoreAllMocks())

  it('kommer ihåg sparade adresser under sidvisningen', () => {
    localStorage.clear()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    upsertSaved(hemma)
    expect(loadSaved()).toEqual([hemma])
  })
})

describe('clearSaved', () => {
  it('glömmer alla sparade adresser', async () => {
    const { clearSaved } = await import('./storage')
    localStorage.clear()
    upsertSaved(hemma)
    expect(clearSaved()).toEqual([])
    expect(loadSaved()).toEqual([])
  })
})
