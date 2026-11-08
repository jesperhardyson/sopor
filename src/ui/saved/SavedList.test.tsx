import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Schedule } from '@/domain/types'
import { loadSaved, upsertSaved } from '@/lib/storage'
import { SavedList } from './SavedList'

let schedule: Schedule | null = null

vi.mock('@/providers/registry', () => ({
  providerFor: () => ({ getSchedule: async () => schedule }),
}))

const saved = (addressId: string, name: string) => ({
  sourceId: 'avesta',
  addressId,
  name,
  street: 'Storgatan 1',
  locality: 'Avesta',
  savedAt: '',
})

function setup(today = '2026-10-30') {
  render(
    <MemoryRouter>
      <SavedList today={today} />
    </MemoryRouter>,
  )
}

describe('SavedList', () => {
  beforeEach(() => {
    schedule = null
    localStorage.clear()
    upsertSaved(saved('a', 'Hemma'))
    upsertSaved(saved('b', 'Stugan'))
  })

  it('har knappen Hantera och kan glömma en adress', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Hantera' }))
    await userEvent.click(screen.getByRole('button', { name: 'Glöm Hemma' }))
    expect(loadSaved().map((s) => s.name)).toEqual(['Stugan'])
  })

  it('glömmer alla adresser efter bekräftelse', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Hantera' }))
    await userEvent.click(screen.getByRole('button', { name: 'Glöm alla adresser på den här enheten' }))
    expect(loadSaved()).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(loadSaved()).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Glöm alla adresser på den här enheten' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, glöm alla' }))
    expect(loadSaved()).toEqual([])
    expect(screen.queryByText('Mina adresser')).toBeNull()
  })

  it('säger när schemat slutar, 14 dagar eller mindre före slutet', async () => {
    schedule = { bins: [], updatedAt: '2026-11-01', validTo: '2027-01-10', events: [{ date: '2027-01-07', fractions: ['rest'] }] }
    setup('2026-12-27')
    expect(await screen.findAllByText('Schemat slutar 10 jan')).toHaveLength(2)
  })

  it('säger inget om slutet när det är längre kvar', async () => {
    schedule = { bins: [], updatedAt: '2026-11-01', validTo: '2027-01-10', events: [{ date: '2027-01-07', fractions: ['rest'] }] }
    setup('2026-12-26')
    expect(await screen.findAllByText('Tor 7 jan')).toHaveLength(2)
    expect(screen.queryByText(/Schemat slutar/)).toBeNull()
  })
})
