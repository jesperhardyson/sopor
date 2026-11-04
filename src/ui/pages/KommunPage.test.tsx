import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KommunPage } from '@/data/kommun-pages'
import { kommunPage, kommunPages } from '@/providers/registry'
import { embeddedScript } from '../kommun/embedded'
import { KommunRoute } from './KommunPage'
import { KommunerRoute } from './KommunerPage'

vi.mock('@/providers/registry', () => ({
  kommunPage: vi.fn(),
  kommunPages: vi.fn(),
  searchAll: async () => ({ addresses: [], failed: [] }),
  warmUpSearch: () => {},
  prefetchAddress: () => {},
  suggestAll: async () => [],
  missingKommuner: async () => [],
}))

const uppsala: KommunPage = { code: '0380', name: 'Uppsala kommun', slug: 'uppsala-kommun', covered: true, sources: [], orter: [] }
const goteborg: KommunPage = { code: '1480', name: 'Göteborgs kommun', slug: 'goteborgs-kommun', covered: false, sources: [], orter: [] }

function show(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Link to="/kommuner/goteborgs-kommun">till göteborg</Link>
      <Routes>
        <Route path="kommuner" element={<KommunerRoute />} />
        <Route path="kommuner/:slug" element={<KommunRoute />} />
        <Route path=":sourceId/:addressId" element={<p>adressidan</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(kommunPage).mockImplementation(async (slug) => [uppsala, goteborg].find((k) => k.slug === slug))
  vi.mocked(kommunPages).mockResolvedValue([uppsala, goteborg])
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

  it('sätter sidans titel', async () => {
    show('/kommuner/uppsala-kommun')
    await waitFor(() => expect(document.title).toBe('Sophämtning i Uppsala kommun – Sopor'))
  })

  it('går före adressidans rutt med samma form', async () => {
    show('/kommuner/uppsala-kommun')
    expect(screen.queryByText('adressidan')).not.toBeInTheDocument()
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
