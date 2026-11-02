import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address, Schedule } from '@/domain/types'
import { loadSaved, loadStoredSchedule, removeSaved, renameSaved, storeSchedule, upsertSaved, type SavedAddress, type StoredSchedule } from './storage'

const hemma: SavedAddress = {
  sourceId: 'avesta',
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

describe('äldre sparade adresser', () => {
  it('läser adresser sparade med det gamla fältet municipalityId', () => {
    localStorage.clear()
    localStorage.setItem(
      'sopor.saved.v1',
      JSON.stringify([{ municipalityId: 'avesta', addressId: 'a', name: 'Hemma', street: 'S 1', locality: 'A', savedAt: '' }]),
    )
    expect(loadSaved()).toEqual([{ sourceId: 'avesta', addressId: 'a', name: 'Hemma', street: 'S 1', locality: 'A', savedAt: '' }])
  })
})

describe('sparade scheman', () => {
  const address: Address = { id: 'krylbo-storgatan-12b', street: 'Storgatan 12 B', locality: 'Krylbo', sourceId: 'avesta', kommun: 'Avesta kommun' }
  const schedule: Schedule = { bins: [], events: [{ date: '2026-11-11', fractions: ['rest'] }], updatedAt: '2026-11-02' }
  const entry: StoredSchedule = { address, schedule, fetchedAt: '2026-11-02' }

  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('sparar schemat för en sparad adress', () => {
    upsertSaved(hemma)
    storeSchedule(entry)
    expect(loadStoredSchedule('avesta', 'krylbo-storgatan-12b')).toEqual(entry)
  })

  it('sparar inte schemat för adresser som inte är sparade', () => {
    storeSchedule(entry)
    expect(loadStoredSchedule('avesta', 'krylbo-storgatan-12b')).toBeUndefined()
  })

  it('glömmer schemat när adressen tas bort', () => {
    upsertSaved(hemma)
    storeSchedule(entry)
    removeSaved('avesta', 'krylbo-storgatan-12b')
    expect(loadStoredSchedule('avesta', 'krylbo-storgatan-12b')).toBeUndefined()
  })

  it('glömmer alla scheman när alla adresser glöms', async () => {
    const { clearSaved } = await import('./storage')
    upsertSaved(hemma)
    storeSchedule(entry)
    clearSaved()
    expect(loadStoredSchedule('avesta', 'krylbo-storgatan-12b')).toBeUndefined()
  })

  it('tål trasig och otillgänglig lagring', () => {
    localStorage.setItem('sopor.schedules.v1', '{trasig')
    expect(loadStoredSchedule('avesta', 'krylbo-storgatan-12b')).toBeUndefined()
    localStorage.setItem('sopor.schedules.v1', JSON.stringify({ 'avesta/krylbo-storgatan-12b': { schedule: 1 } }))
    expect(loadStoredSchedule('avesta', 'krylbo-storgatan-12b')).toBeUndefined()
    upsertSaved(hemma)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    expect(() => storeSchedule(entry)).not.toThrow()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(loadStoredSchedule('avesta', 'krylbo-storgatan-12b')).toBeUndefined()
  })
})
