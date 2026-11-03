import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SITE } from '@/config'
import { reportMissingKommun } from '@/lib/analytics'
import type { KommunStatus } from '@/providers/registry'
import { KommunCheck } from './KommunCheck'

vi.mock('@/lib/analytics', () => ({ reportMissingKommun: vi.fn() }))

const DATA: Record<string, KommunStatus[]> = {
  malmö: [{ name: 'Malmö kommun', covered: true }],
  limhamn: [{ name: 'Malmö kommun', covered: true }],
  hedemora: [{ name: 'Hedemora kommun', covered: false }],
  bergby: [
    { name: 'Ljusdals kommun', covered: false },
    { name: 'Norrtälje kommun', covered: true },
  ],
}

async function ask(query: string, check = async (q: string): Promise<KommunStatus[] | null> => DATA[q.toLowerCase()] ?? []) {
  render(
    <MemoryRouter>
      <KommunCheck check={check} />
    </MemoryRouter>,
  )
  await userEvent.type(screen.getByRole('textbox', { name: 'Kommun eller ort' }), query)
}

describe('KommunCheck', () => {
  it('säger ja och länkar till adressökningen när kommunen finns', async () => {
    await ask('Malmö')
    expect(await screen.findByRole('heading', { name: 'Ja, Malmö kommun finns' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sök adress i Malmö kommun' })).toHaveAttribute('href', '/#sok')
    expect(screen.queryByText(/ligger i/)).toBeNull()
  })

  it('berättar vilken kommun en ort ligger i', async () => {
    await ask('limhamn')
    expect(await screen.findByText(/Limhamn ligger i Malmö kommun\./)).toBeInTheDocument()
  })

  it('ber om tips och räknar kommunen som saknad när den inte finns', async () => {
    await ask('Hedemora')
    expect(await screen.findByRole('heading', { name: 'Hedemora kommun finns inte än' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tipsa om Hedemora kommun' })).toHaveAttribute('href', SITE.newMunicipalityIssueUrl)
    expect(reportMissingKommun).toHaveBeenCalledWith(['Hedemora kommun'])
  })

  it('ger en rad per kommun för orter i flera kommuner', async () => {
    await ask('Bergby')
    expect(await screen.findByRole('heading', { name: 'Bergby ligger i 2 kommuner' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tipsa om Ljusdals kommun' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sök adress i Norrtälje kommun' })).toBeInTheDocument()
  })

  it('säger till när orten är okänd', async () => {
    await ask('Xyzby')
    expect(await screen.findByRole('heading', { name: 'Hittar ingen ort som heter så' })).toBeInTheDocument()
  })

  it('säger till när uppslaget inte går att göra', async () => {
    await ask('Malmö', async () => null)
    expect(await screen.findByText('Det gick inte att slå upp orten just nu. Försök igen om en stund.')).toBeInTheDocument()
  })

  it('visar inget svar för ett tomt fält', async () => {
    const check = vi.fn(async () => [])
    render(
      <MemoryRouter>
        <KommunCheck check={check} />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('textbox', { name: 'Kommun eller ort' }), '  ')
    expect(screen.queryByRole('status')).toBeEmptyDOMElement()
    expect(check).not.toHaveBeenCalled()
  })
})
