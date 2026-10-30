import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address, Schedule } from '@/domain/types'
import type { WasteProvider } from '@/providers/types'
import { ResultPage } from './ResultPage'

const villa: Address = { id: 'krylbo-storgatan-12b', street: 'Storgatan 12 B', locality: 'Krylbo', municipalityId: 'avesta' }
const schedule: Schedule = {
  bins: [{ fraction: 'rest', sizeLiters: 190, frequencyText: 'Var 6:e vecka · onsdagar' }, { fraction: 'mat' }],
  note: 'Påminnelse: ställ ut kärlen senast 06.00 på tömningsdagen.',
  updatedAt: '2026-10-29',
  events: [
    { date: '2026-10-28', fractions: ['plast', 'mat'] },
    { date: '2026-11-11', fractions: ['rest', 'mat'] },
    { date: '2026-11-25', fractions: ['papper', 'mat'] },
    { date: '2026-12-09', fractions: ['plast', 'mat'] },
    { date: '2026-12-23', fractions: ['rest', 'mat'] },
    { date: '2027-01-07', fractions: ['papper', 'mat'], deviation: { originalDate: '2027-01-06', reason: 'trettondedag jul' } },
  ],
}

let fake: WasteProvider
let resolveSchedule: (() => void) | undefined

vi.mock('@/providers/registry', () => ({
  providerFor: () => fake,
  getAddress: (_m: string, id: string) => fake.getAddress(id),
  searchAll: async () => [],
  suggestAll: async () => [],
}))

function makeProvider(over: Partial<WasteProvider> = {}): WasteProvider {
  return {
    searchAddresses: async () => [],
    suggestAddresses: async () => [],
    getAddress: async (id) => (id === villa.id ? villa : null),
    getSchedule: (id) =>
      new Promise((resolve) => {
        resolveSchedule = () => resolve(id === villa.id ? schedule : null)
      }),
    icsUrl: (id) => `/ics/avesta/${id}.ics`,
    ...over,
  }
}

function renderAt(path: string, today = '2026-10-30') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path=":municipalityId/:addressId" element={<ResultPage today={today} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ResultPage', () => {
  beforeEach(() => {
    fake = makeProvider()
    resolveSchedule = undefined
  })

  it('visar laddning och sedan nästa tömning, lista och avvikelse', async () => {
    renderAt('/avesta/krylbo-storgatan-12b')
    expect(await screen.findByText('Hämtar schemat från Avesta kommun…')).toBeInTheDocument()
    resolveSchedule!()

    const next = await screen.findByRole('region', { name: 'Nästa tömning' })
    expect(within(next).getByText('Onsdag')).toBeInTheDocument()
    expect(within(next).getByText('11 november')).toBeInTheDocument()
    expect(within(next).getByText('om 12 dagar')).toBeInTheDocument()
    expect(within(next).getByText('Restavfall')).toBeInTheDocument()
    expect(within(next).getByText('Matavfall')).toBeInTheDocument()
    expect(within(next).getByText('Påminnelse: ställ ut kärlen senast 06.00 på tömningsdagen.')).toBeInTheDocument()

    const list = screen.getByRole('region', { name: 'Kommande tömningar' })
    expect(within(list).queryByText('28')).toBeNull()
    expect(within(list).getByText('Nästa · om 12 dagar')).toBeInTheDocument()
    expect(within(list).getByText('Flyttad · helgdag')).toBeInTheDocument()
    expect(within(list).getByText('Flyttad från ons 6 jan på grund av trettondedag jul.')).toBeInTheDocument()
  })

  it('visar kärl med storlek bara när den finns', async () => {
    renderAt('/avesta/krylbo-storgatan-12b')
    resolveSchedule?.()
    await vi.waitFor(() => resolveSchedule!())
    const bins = await screen.findByRole('region', { name: 'Mina kärl' })
    expect(within(bins).getByText('190 l')).toBeInTheDocument()
    expect(within(bins).getAllByText(/ l$/)).toHaveLength(1)
    expect(within(bins).getByText('Var 6:e vecka · onsdagar')).toBeInTheDocument()
  })

  it('har månadskalender med prickar och bläddring', async () => {
    renderAt('/avesta/krylbo-storgatan-12b')
    await vi.waitFor(() => resolveSchedule!())
    const cal = await screen.findByRole('region', { name: /November 2026/ })
    expect(within(cal).getByRole('button', { name: 'Föregående månad' })).toBeEnabled()
    expect(within(cal).getByLabelText('11 november: Restavfall, Matavfall')).toBeInTheDocument()
    expect(within(cal).getByLabelText('25 november: Pappersförpackningar, Matavfall')).toBeInTheDocument()

    await userEvent.click(within(cal).getByRole('button', { name: 'Nästa månad' }))
    const dec = screen.getByRole('region', { name: /December 2026/ })
    expect(within(dec).getByLabelText('9 december: Plastförpackningar, Matavfall')).toBeInTheDocument()
    expect(within(dec).getByLabelText('23 december: Restavfall, Matavfall')).toBeInTheDocument()

    await userEvent.click(within(dec).getByRole('button', { name: 'Nästa månad' }))
    expect(within(screen.getByRole('region', { name: /Januari 2027/ })).getByRole('button', { name: 'Nästa månad' })).toBeDisabled()
  })

  it('visar kommunen stöds inte för okänd kommun, utan e-postfält', async () => {
    renderAt('/hedemora/storgatan-12')
    expect(await screen.findByText('Vi finns bara i Avesta just nu')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('visar hittades inte för okänd adress', async () => {
    renderAt('/avesta/finns-inte')
    await vi.waitFor(() => resolveSchedule?.())
    expect(await screen.findByText('Vi hittade inte adressen')).toBeInTheDocument()
  })

  it('visar fel och kan försöka igen', async () => {
    let calls = 0
    fake = makeProvider({
      getSchedule: async () => {
        calls++
        if (calls === 1) throw new Error('nere')
        return schedule
      },
    })
    renderAt('/avesta/krylbo-storgatan-12b')
    await userEvent.click(await screen.findByRole('button', { name: 'Försök igen' }))
    expect(await screen.findByRole('region', { name: 'Nästa tömning' })).toBeInTheDocument()
    expect(calls).toBe(2)
  })

  it('visar ett tomt läge när alla tömningar har passerat', async () => {
    renderAt('/avesta/krylbo-storgatan-12b', '2027-03-01')
    await vi.waitFor(() => resolveSchedule!())
    expect(await screen.findByText('Inga kommande tömningar i schemat än')).toBeInTheDocument()
  })

  it('öppnar kalenderarket och spara-arket', async () => {
    renderAt('/avesta/krylbo-storgatan-12b')
    await vi.waitFor(() => resolveSchedule!())
    await userEvent.click(await screen.findByRole('button', { name: 'Lägg till i kalender' }))
    expect(await screen.findByRole('dialog', { name: 'Lägg till i kalender' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    await userEvent.click(screen.getByRole('button', { name: 'Spara' }))
    expect(await screen.findByRole('dialog', { name: 'Spara adress' })).toBeInTheDocument()
  })
})
