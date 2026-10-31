import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSaved, upsertSaved } from '@/lib/storage'
import { SavedList } from './SavedList'

vi.mock('@/providers/registry', () => ({
  providerFor: () => ({ getSchedule: async () => null }),
}))

const saved = (addressId: string, name: string) => ({
  sourceId: 'avesta',
  addressId,
  name,
  street: 'Storgatan 1',
  locality: 'Avesta',
  savedAt: '',
})

function setup() {
  render(
    <MemoryRouter>
      <SavedList today="2026-10-30" />
    </MemoryRouter>,
  )
}

describe('SavedList', () => {
  beforeEach(() => {
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
})
