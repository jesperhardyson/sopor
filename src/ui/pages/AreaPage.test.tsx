import '@/test/show-hidden-sources'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AreasIndexFile } from '@/data/static-format'
import type { WasteProvider } from '@/providers/types'
import { AreaRoute } from './AreaPage'

const index: AreasIndexFile = {
  explanation: 'Avesta Vatten publicerar sophämtningen per område.',
  help: 'Osäker? Fråga Avesta Vatten på 0226-64 55 00.',
  areas: [
    {
      id: 'trakt-1', name: 'Askön, Nyhyttan m.fl.', day: 'Måndag, udda vecka', label: 'Trakt 1',
      places: ['Klintbo', 'Baggbo', 'Högbo', 'Stallgatan', 'Storbogatan', 'Hedbo', 'Vallby'],
      otherDays: [], searchTerms: ['trakt 1'], dates: ['2026-10-19'],
    },
    {
      id: 'trakt-7', name: 'Avesta tätort, Östanfors m.fl.', day: 'Tisdag, jämn vecka', label: 'Trakt 7',
      places: ['Lycka', 'Kolarbo'], otherDays: [], searchTerms: ['trakt 7'], dates: ['2026-10-27'],
    },
  ],
}

let fake: WasteProvider
vi.mock('@/providers/registry', () => ({ providerFor: () => fake }))

function makeProvider(over: Partial<WasteProvider> = {}): WasteProvider {
  return {
    searchAddresses: async () => [],
    suggestAddresses: async () => [],
    getAddress: async () => null,
    getSchedule: async () => null,
    dataUpdatedAt: async () => null,
    icsUrl: () => '',
    listAreas: async () => index,
    ...over,
  }
}

function Probe() {
  const { sourceId, addressId } = useParams()
  return <p>resultat {sourceId}/{addressId}</p>
}

function show(path = '/avesta/omraden') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path=":sourceId/omraden" element={<AreaRoute today="2026-11-04" />} />
        <Route path=":sourceId/:addressId" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  fake = makeProvider()
})

describe('AreaPage', () => {
  it('visar rubrik, förklaring, hjälp och alla områden', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'Välj ditt område' })).toBeInTheDocument()
    expect(screen.getByText('Avesta kommun')).toBeInTheDocument()
    expect(screen.getByText(index.explanation)).toBeInTheDocument()
    expect(screen.getByText(index.help)).toBeInTheDocument()
    expect(screen.getByText('Askön, Nyhyttan m.fl.')).toBeInTheDocument()
    expect(screen.getByText('Måndag, udda vecka · Trakt 1')).toBeInTheDocument()
    expect(screen.getByText('Tisdag, jämn vecka · Trakt 7')).toBeInTheDocument()
    expect(document.title).toBe('Välj område – Sopor')
  })

  it('visar högst fem platser och slutar med " …" när fler finns', async () => {
    show()
    expect(await screen.findByText('Klintbo, Baggbo, Högbo, Stallgatan, Storbogatan …')).toBeInTheDocument()
    expect(screen.getByText('Lycka, Kolarbo')).toBeInTheDocument()
  })

  it('filtrerar på namn och visar en tom ruta utan träff', async () => {
    show()
    await screen.findByText('Askön, Nyhyttan m.fl.')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Sök ort eller gata' }), 'Östanfors')
    expect(screen.getByText('Avesta tätort, Östanfors m.fl.')).toBeInTheDocument()
    expect(screen.queryByText('Askön, Nyhyttan m.fl.')).not.toBeInTheDocument()
    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), 'Qqqq')
    expect(screen.getByText('Inget område matchar')).toBeInTheDocument()
  })

  it('länkar varje rad till områdets resultat', async () => {
    show()
    await userEvent.click(await screen.findByRole('link', { name: /Östanfors/ }))
    expect(screen.getByText('resultat avesta/trakt-7')).toBeInTheDocument()
  })

  it('öppnar arket med "Vet du inte vilket område?"', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: /Vet du inte vilket område\?/ }))
    expect(await screen.findByRole('heading', { name: 'När tömdes ditt kärl senast?' })).toBeInTheDocument()
  })

  it('visar UnsupportedState för en källa utan områdesval', async () => {
    show('/uppsala/omraden')
    expect(await screen.findByText('Den här adressen finns inte hos Sopor')).toBeInTheDocument()
  })

  it('visar ErrorState när områdena inte går att hämta och försöker igen', async () => {
    const listAreas = vi.fn().mockRejectedValueOnce(new Error('nere')).mockResolvedValue(index)
    fake = makeProvider({ listAreas })
    show()
    expect(await screen.findByText('Schemat gick inte att hämta')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Försök igen' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Välj ditt område' })).toBeInTheDocument())
    expect(listAreas).toHaveBeenCalledTimes(2)
  })
})
