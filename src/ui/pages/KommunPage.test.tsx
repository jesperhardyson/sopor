import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KommunPage } from '@/data/kommun-pages'
import { kommunPage, kommunPages, searchAll, searchInKommun } from '@/providers/registry'
import { embeddedScript } from '../kommun/embedded'
import { KommunRoute } from './KommunPage'
import { KommunerRoute } from './KommunerPage'

vi.mock('@/providers/registry', () => ({
  kommunPage: vi.fn(),
  kommunPages: vi.fn(),
  searchAll: vi.fn(async () => ({ addresses: [{ id: 'storgatan-2_stockholm', street: 'Storgatan 2', locality: 'Stockholm', sourceId: 'stockholm', kommun: 'Stockholms kommun' }], failed: [] })),
  searchInKommun: vi.fn(),
  warmUpSearch: () => {},
  prefetchAddress: () => {},
  suggestAll: async () => [],
  missingKommuner: async () => [],
}))

const uppsala: KommunPage = { code: '0380', name: 'Uppsala kommun', slug: 'uppsala-kommun', covered: true, sources: [], orter: [] }
const goteborg: KommunPage = { code: '1480', name: 'Göteborgs kommun', slug: 'goteborgs-kommun', covered: false, sources: [], orter: [] }

function AddressProbe() {
  const { sourceId, addressId } = useParams()
  return <p>adressidan {sourceId}/{addressId}</p>
}

function show(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Link to="/kommuner/goteborgs-kommun">till göteborg</Link>
      <Routes>
        <Route path="kommuner" element={<KommunerRoute />} />
        <Route path="kommuner/:slug" element={<KommunRoute />} />
        <Route path=":sourceId/:addressId" element={<AddressProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(kommunPage).mockImplementation(async (slug) => [uppsala, goteborg].find((k) => k.slug === slug))
  vi.mocked(kommunPages).mockResolvedValue([uppsala, goteborg])
  vi.mocked(searchInKommun).mockReturnValue({
    search: async () => ({ addresses: [{ id: 'storgatan-2_uppsala', street: 'Storgatan 2', locality: 'Uppsala', sourceId: 'uppsala', kommun: 'Uppsala kommun' }], failed: [] }),
    suggest: async () => [],
  })
})
afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

function embed(path: string, data: unknown) {
  const holder = document.createElement('div')
  holder.innerHTML = embeddedScript(path, data)
  document.body.append(holder)
}

describe('KommunRoute', () => {
  it('visar inbäddad data direkt, utan laddningsläge och utan hämtning', () => {
    embed('/kommuner/uppsala-kommun', uppsala)
    show('/kommuner/uppsala-kommun')
    expect(screen.getByRole('heading', { level: 1, name: 'Sophämtning i Uppsala kommun' })).toBeInTheDocument()
    expect(kommunPage).not.toHaveBeenCalled()
  })

  it('hämtar rätt kommun när man navigerar från en sida med inbäddad data', async () => {
    embed('/kommuner/uppsala-kommun', uppsala)
    show('/kommuner/uppsala-kommun')
    await userEvent.click(screen.getByRole('link', { name: 'till göteborg' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sophämtning i Göteborgs kommun' })).toBeInTheDocument()
  })

  it.each(['/kommuner/finns-inte', '/kommuner/Uppsala-Kommun'])('%s visar att kommunen inte finns', async (path) => {
    show(path)
    expect(await screen.findByRole('heading', { name: 'Kommunen finns inte' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se alla kommuner' })).toHaveAttribute('href', '/kommuner')
  })

  it('visar fel och försöker igen när datan inte går att hämta', async () => {
    vi.mocked(kommunPage).mockResolvedValueOnce(null)
    show('/kommuner/uppsala-kommun')
    await userEvent.click(await screen.findByRole('button', { name: /försök igen/i }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sophämtning i Uppsala kommun' })).toBeInTheDocument()
  })

  it('söker i kommunen, så att Enter leder till en adress där och inte i en annan kommun', async () => {
    embed('/kommuner/uppsala-kommun', uppsala)
    show('/kommuner/uppsala-kommun')
    await userEvent.type(screen.getByRole('combobox'), 'Storgatan 2{Enter}')
    expect(await screen.findByText('adressidan uppsala/storgatan-2_uppsala')).toBeInTheDocument()
    expect(searchInKommun).toHaveBeenCalledWith(expect.objectContaining({ code: '0380', name: 'Uppsala kommun' }))
    expect(searchAll).not.toHaveBeenCalled()
  })

  it('förklarar att adressen saknas i just den här kommunen', async () => {
    vi.mocked(searchInKommun).mockReturnValue({ search: async () => ({ addresses: [], failed: [] }), suggest: async () => [] })
    embed('/kommuner/uppsala-kommun', uppsala)
    show('/kommuner/uppsala-kommun')
    await userEvent.type(screen.getByRole('combobox'), 'Storgatan 2{Enter}')
    expect(await screen.findByRole('heading', { name: 'Vi hittade inte adressen i Uppsala kommun' })).toBeInTheDocument()
  })

  it('sätter sidans titel', async () => {
    show('/kommuner/uppsala-kommun')
    await waitFor(() => expect(document.title).toBe('Sophämtning i Uppsala kommun – Sopor'))
  })

  it('går före adressidans rutt med samma form', async () => {
    show('/kommuner/uppsala-kommun')
    expect(screen.queryByText(/adressidan/)).not.toBeInTheDocument()
  })
})

describe('KommunerRoute', () => {
  it('visar inbäddad översikt direkt', () => {
    embed('/kommuner', [uppsala])
    show('/kommuner')
    expect(screen.getByRole('heading', { name: 'Här finns Sopor (1)' })).toBeInTheDocument()
    expect(kommunPages).not.toHaveBeenCalled()
  })

  it('hämtar listan och sätter titeln', async () => {
    show('/kommuner')
    expect(await screen.findByRole('heading', { name: 'Inte än (1)' })).toBeInTheDocument()
    expect(document.title).toBe('Sophämtning i Sveriges kommuner – Sopor')
  })

  it('visar fel och försöker igen', async () => {
    vi.mocked(kommunPages).mockResolvedValueOnce(null)
    show('/kommuner')
    await userEvent.click(await screen.findByRole('button', { name: /försök igen/i }))
    expect(await screen.findByRole('heading', { name: 'Inte än (1)' })).toBeInTheDocument()
  })
})
