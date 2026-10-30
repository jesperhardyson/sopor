import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AboutPage } from './AboutPage'

vi.mock('@/providers/registry', () => ({
  providerFor: () => ({ dataUpdatedAt: async () => '2026-10-29' }),
}))

describe('AboutPage', () => {
  it('visar rubrik, källor, kontakt och friskrivning', async () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Om Sopor', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Avesta Vatten och Avfall/ })).toHaveAttribute('href', 'https://www.avestavatten.se')
    expect(await screen.findAllByText('Hämtat 29 okt')).toHaveLength(1)
    expect(screen.queryByText('Lantmäteriet')).toBeNull()
    expect(screen.getByRole('link', { name: 'Skriv till oss' })).toHaveAttribute('href', 'mailto:support@hardyson.se')
    expect(screen.getByText(/Sopor är en inofficiell tjänst och är inte kopplad till någon kommun/)).toBeInTheDocument()
  })

  it('berättar om analysen och att man kan bidra på GitHub', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Ingen reklam och inga spårningscookies')).toBeInTheDocument()
    expect(screen.getByText(/Vi räknar besök anonymt med Vercel Web Analytics, utan cookies\. Adresser du söker på skickas inte med\./)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bidra' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Så bidrar du/ })).toHaveAttribute('href', '/bidra')
    expect(screen.getByRole('link', { name: /Sopor på GitHub/ })).toHaveAttribute('href', 'https://github.com/jesperhardyson/sopor')
  })

  it('kan glömma sparade adresser under Integritet', async () => {
    localStorage.setItem(
      'sopor.saved.v1',
      JSON.stringify([{ sourceId: 'avesta', addressId: 'a', name: 'Hemma', street: 'S 1', locality: 'A', savedAt: '' }]),
    )
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Glöm sparade adresser (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, glöm alla' }))
    expect(localStorage.getItem('sopor.saved.v1')).toBe('[]')
    expect(screen.getByText('Inga adresser sparade på den här enheten.')).toBeInTheDocument()
  })
})

