import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AreasIndexFile } from '@/data/static-format'
import { loadChoice, loadSaved, upsertSaved } from '@/lib/storage'
import type { WasteProvider } from '@/providers/types'
import { AreaRoute } from './AreaPage'

const index: AreasIndexFile = {
  explanation: 'Avesta Vatten publicerar sophämtningen per område.',
  help: 'Osäker? Fråga Avesta Vatten på 0226-64 55 00.',
  areas: [
    {
      id: 'trakt-1', name: 'Askön, Nyhyttan m.fl.', day: 'Måndag, udda vecka', label: 'Område 1',
      places: ['Klintbo', 'Baggbo', 'Högbo', 'Stallgatan', 'Storbogatan', 'Hedbo', 'Vallby'],
      otherDays: [], searchTerms: ['trakt 1'], dates: ['2026-10-19'],
    },
    {
      id: 'trakt-7', name: 'Avesta tätort, Östanfors m.fl.', day: 'Tisdag, jämn vecka', label: 'Område 7',
      places: ['Lycka', 'Kolarbo'], otherDays: [], searchTerms: ['trakt 7'], dates: ['2026-10-27'],
    },
  ],
}

let fake: WasteProvider
let knownStreets: Record<string, string> = {}
vi.mock('@/providers/registry', () => ({
  providerFor: () => fake,
  knownAreaStreet: async (_source: string, query: string) => knownStreets[query],
}))

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
  const changed = (useLocation().state as { areaChanged?: boolean } | null)?.areaChanged
  return <p>resultat {sourceId}/{addressId}{changed && ' områdesbyte: ja'}</p>
}

function show(path: string | { pathname: string; state: unknown } = '/avesta/omraden') {
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
  knownStreets = {}
  localStorage.clear()
})

describe('AreaPage', () => {
  it('visar rubrik, förklaring, hjälp och alla områden', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'Välj ditt område' })).toBeInTheDocument()
    expect(screen.getByText('Avesta kommun')).toBeInTheDocument()
    expect(screen.getByText(index.explanation)).toBeInTheDocument()
    expect(screen.getByText(index.help)).toBeInTheDocument()
    expect(screen.getByText('Askön, Nyhyttan m.fl.')).toBeInTheDocument()
    expect(screen.getByText('Måndag, udda vecka')).toBeInTheDocument()
    expect(screen.getByText('Område 1')).toBeInTheDocument()
    expect(screen.getByText('Tisdag, jämn vecka')).toBeInTheDocument()
    expect(screen.getByText('Område 7')).toBeInTheDocument()
    expect(document.title).toBe('Välj område – Sopor')
  })

  it('visar alla platser, så att man kan hitta sitt område i listan', async () => {
    show()
    expect(await screen.findByText('Klintbo, Baggbo, Högbo, Stallgatan, Storbogatan, Hedbo, Vallby')).toBeInTheDocument()
  })

  it('filtrerar på namn och visar en tom ruta utan träff', async () => {
    show()
    await screen.findByText('Askön, Nyhyttan m.fl.')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Sök område, ort eller gata' }), 'Östanfors')
    expect(screen.getByText('Avesta tätort, Östanfors m.fl.')).toBeInTheDocument()
    expect(screen.queryByText('Askön, Nyhyttan m.fl.')).not.toBeInTheDocument()
    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), 'Qqqq')
    expect(screen.getByText('Inget område matchar')).toBeInTheDocument()
  })

  it('filtret hittar också på början av ett ord', async () => {
    show()
    await screen.findByText('Askön, Nyhyttan m.fl.')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Sök område, ort eller gata' }), 'östan')
    expect(screen.getByText('Avesta tätort, Östanfors m.fl.')).toBeInTheDocument()
    expect(screen.queryByText('Askön, Nyhyttan m.fl.')).not.toBeInTheDocument()
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

  it('filtret hittar på hämtdagen', async () => {
    show()
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Sök område, ort eller gata' }), 'tisdag')
    expect(screen.getByText('Avesta tätort, Östanfors m.fl.')).toBeInTheDocument()
    expect(screen.queryByText('Askön, Nyhyttan m.fl.')).toBeNull()
    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), 'jämn vecka')
    expect(screen.getByText('Avesta tätort, Östanfors m.fl.')).toBeInTheDocument()
  })

  it('visar inget märke för ett område utan etikett, och filtret skiljer jämn från ojämn', async () => {
    const { label: _label, ...askon } = index.areas[0]
    fake = makeProvider({ listAreas: async () => ({ ...index, areas: [{ ...askon, day: 'Måndag, ojämn vecka' }, { ...index.areas[1], day: 'Tisdag, jämn vecka' }] }) })
    show()
    expect(await screen.findByText('Måndag, ojämn vecka')).toBeInTheDocument()
    expect(screen.queryByText('Område 1')).toBeNull()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Sök område, ort eller gata' }), 'ojämn')
    expect(screen.getByText('Askön, Nyhyttan m.fl.')).toBeInTheDocument()
    expect(screen.queryByText('Avesta tätort, Östanfors m.fl.')).toBeNull()
  })

  it('skriver kommunens hela namn när det slutar på s', async () => {
    knownStreets = { Kungsgatan: 'Kungsgatan' }
    show('/sater/omraden')
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Sök område, ort eller gata' }), 'Kungsgatan')
    expect(await screen.findByRole('heading', { name: 'Kungsgatan finns i Säters kommun' })).toBeInTheDocument()
  })

  it('visar förklaring och hela listan för en känd gata utan områdesträff', async () => {
    knownStreets = { 'Kungsgatan 12': 'Kungsgatan' }
    show()
    await userEvent.type(await screen.findByRole('searchbox'), 'Kungsgatan 12')
    expect(await screen.findByRole('heading', { name: 'Kungsgatan finns i Avesta' })).toBeInTheDocument()
    expect(screen.getByText('Askön, Nyhyttan m.fl.')).toBeInTheDocument()
    expect(screen.queryByText('Inget område matchar')).toBeNull()
  })

  it('säger att inget matchar för ett okänt ord', async () => {
    show()
    await userEvent.type(await screen.findByRole('searchbox'), 'Zzzgatan')
    expect(await screen.findByText('Inget område matchar')).toBeInTheDocument()
  })

  it('visar gatan man sökte, sparar valet lokalt och väljer inget åt användaren', async () => {
    show({ pathname: '/avesta/omraden', state: { street: 'Kungsgatan 12' } })
    expect(await screen.findByRole('heading', { name: 'Du sökte Kungsgatan 12' })).toBeInTheDocument()
    expect(loadChoice('avesta', 'Kungsgatan 12')).toBeUndefined()
    await userEvent.click(screen.getByRole('link', { name: /Avesta tätort/ }))
    expect(loadChoice('avesta', 'Kungsgatan 12')).toMatchObject({ areaId: 'trakt-7', label: 'Område 7' })
  })

  it('byter ett sparat område och säger till resultatsidan att området är bytt', async () => {
    upsertSaved({ sourceId: 'avesta', addressId: 'trakt-1', name: 'Hemma', street: 'Askön, Nyhyttan m.fl.', locality: '', savedAt: '2026-11-04' })
    show({ pathname: '/avesta/omraden', state: { from: 'trakt-1' } })
    await userEvent.click(await screen.findByRole('link', { name: /Avesta tätort/ }))
    expect(loadSaved()).toMatchObject([{ addressId: 'trakt-7', name: 'Hemma', street: 'Avesta tätort, Östanfors m.fl.' }])
    expect(await screen.findByText(/områdesbyte: ja/)).toBeInTheDocument()
  })

  it('öppnar arket direkt från kalenderdialogen', async () => {
    show({ pathname: '/avesta/omraden', state: { find: true } })
    expect(await screen.findByRole('heading', { name: 'När tömdes ditt kärl senast?' })).toBeInTheDocument()
  })
})
