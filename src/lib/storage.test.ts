import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address, Schedule } from '@/domain/types'
import { clearSaved, forgetChoice, loadChoice, loadSaved, loadStoredSchedule, moveChoices, rememberChoice, removeSaved, renameSaved, replaceSaved, storeSchedule, upsertSaved, type SavedAddress, type StoredSchedule } from './storage'

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

describe('eget val av område', () => {
  const choice = { sourceId: 'avesta', street: 'Kungsgatan 12', areaId: 'trakt-7', label: 'Trakt 7', day: 'Tisdag, jämn vecka' }
  beforeEach(() => localStorage.clear())

  it('kommer ihåg valet oavsett versaler och kan glömma det', () => {
    rememberChoice(choice)
    expect(loadChoice('avesta', 'KUNGSGATAN  12')).toEqual(choice)
    expect(loadChoice('annan', 'Kungsgatan 12')).toBeUndefined()
    forgetChoice('avesta', 'kungsgatan 12')
    expect(loadChoice('avesta', 'Kungsgatan 12')).toBeUndefined()
  })

  it('sparar också ett val från ett område utan etikett', () => {
    rememberChoice({ sourceId: 'sater', street: 'Kungsgatan 12', areaId: 'ojamn-mandag', day: 'Måndag, ojämn vecka' })
    expect(loadChoice('sater', 'Kungsgatan 12')).toMatchObject({ areaId: 'ojamn-mandag', day: 'Måndag, ojämn vecka' })
  })

  it('flyttar val från det gamla området vid ett byte', () => {
    rememberChoice(choice)
    moveChoices('avesta', 'trakt-7', { id: 'trakt-1', label: 'Trakt 1', day: 'Måndag, udda vecka' })
    expect(loadChoice('avesta', 'Kungsgatan 12')).toMatchObject({ areaId: 'trakt-1', label: 'Trakt 1' })
  })

  it('rensas tillsammans med sparade adresser', () => {
    rememberChoice(choice)
    clearSaved()
    expect(loadChoice('avesta', 'Kungsgatan 12')).toBeUndefined()
  })

  it('tål trasig lagring', () => {
    localStorage.setItem('sopor.areaChoices.v1', '{trasig')
    expect(loadChoice('avesta', 'Kungsgatan 12')).toBeUndefined()
    localStorage.setItem('sopor.areaChoices.v1', JSON.stringify({ 'avesta/kungsgatan 12': { skräp: true } }))
    expect(loadChoice('avesta', 'Kungsgatan 12')).toBeUndefined()
  })

  it('tål att lagringen kastar fel', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(() => rememberChoice(choice)).not.toThrow()
    spy.mockRestore()
  })
})

describe('replaceSaved', () => {
  const omrade = { sourceId: 'avesta', addressId: 'trakt-7', name: 'Hemma', street: 'Avesta tätort', locality: '', savedAt: '2026-11-04' }
  beforeEach(() => localStorage.clear())

  it('ersätter området på samma plats och behåller ett eget namn', () => {
    upsertSaved(omrade)
    replaceSaved('avesta', 'trakt-7', { id: 'trakt-1', street: 'Askön' })
    expect(loadSaved()).toEqual([{ ...omrade, addressId: 'trakt-1', street: 'Askön' }])
  })

  it('byter namnet när det bara var områdets namn', () => {
    upsertSaved({ ...omrade, name: 'Avesta tätort' })
    replaceSaved('avesta', 'trakt-7', { id: 'trakt-1', street: 'Askön' })
    expect(loadSaved()[0].name).toBe('Askön')
  })

  it('lämnar listan orörd när det gamla området inte är sparat', () => {
    replaceSaved('avesta', 'trakt-7', { id: 'trakt-1', street: 'Askön' })
    expect(loadSaved()).toEqual([])
  })

  it('ger inga dubbletter om det nya området redan är sparat', () => {
    upsertSaved(omrade)
    upsertSaved({ ...omrade, addressId: 'trakt-1', street: 'Askön', name: 'Stugan' })
    replaceSaved('avesta', 'trakt-7', { id: 'trakt-1', street: 'Askön' })
    expect(loadSaved().map((a) => a.addressId)).toEqual(['trakt-1'])
  })
})
