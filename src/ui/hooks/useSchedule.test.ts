import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address, Schedule } from '@/domain/types'
import { storeSchedule, upsertSaved } from '@/lib/storage'
import { useSchedule } from './useSchedule'

const getSchedule = vi.fn<(id: string) => Promise<Schedule | null>>()
vi.mock('@/providers/registry', () => ({ providerFor: () => ({ getSchedule }) }))

const address: Address = { id: 'krylbo-storgatan-12b', street: 'Storgatan 12 B', locality: 'Krylbo', sourceId: 'avesta', kommun: 'Avesta kommun' }
const schedule: Schedule = { bins: [], events: [{ date: '2026-11-11', fractions: ['rest'] }], updatedAt: '2026-11-02' }

function saveWithSchedule() {
  upsertSaved({ sourceId: 'avesta', addressId: address.id, name: 'Hemma', street: address.street, locality: address.locality, savedAt: '' })
  storeSchedule({ address, schedule, fetchedAt: '2026-11-02' })
}

describe('useSchedule', () => {
  beforeEach(() => {
    localStorage.clear()
    getSchedule.mockReset()
  })

  it('ger schemat från källan', async () => {
    getSchedule.mockResolvedValue(schedule)
    const { result } = renderHook(() => useSchedule('avesta', address.id))
    await waitFor(() => expect(result.current[0]).toEqual({ status: 'ok', schedule }))
  })

  it('ger fel när källan inte svarar och inget schema är sparat', async () => {
    getSchedule.mockRejectedValue(new Error('502'))
    const { result } = renderHook(() => useSchedule('avesta', address.id))
    await waitFor(() => expect(result.current[0]).toEqual({ status: 'error' }))
  })

  it('ger det sparade schemat när källan inte svarar', async () => {
    saveWithSchedule()
    getSchedule.mockRejectedValue(new Error('502'))
    const { result } = renderHook(() => useSchedule('avesta', address.id))
    await waitFor(() =>
      expect(result.current[0]).toEqual({ status: 'stale', schedule, address, fetchedAt: '2026-11-02' }),
    )
  })

  it('visar det sparade schemat direkt medan källan frågas', async () => {
    saveWithSchedule()
    const fresh = { ...schedule, updatedAt: '2026-11-03' }
    getSchedule.mockResolvedValue(fresh)
    const { result } = renderHook(() => useSchedule('avesta', address.id))
    expect(result.current[0]).toEqual({ status: 'cached', schedule, address, fetchedAt: '2026-11-02' })
    await waitFor(() => expect(result.current[0]).toEqual({ status: 'ok', schedule: fresh }))
  })

  it('hämtar igen vid nytt försök', async () => {
    saveWithSchedule()
    getSchedule.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce(schedule)
    const { result } = renderHook(() => useSchedule('avesta', address.id))
    await waitFor(() => expect(result.current[0].status).toBe('stale'))
    act(() => result.current[1]())
    await waitFor(() => expect(result.current[0]).toEqual({ status: 'ok', schedule }))
  })
})
