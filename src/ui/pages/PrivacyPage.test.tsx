import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { PrivacyPage } from './PrivacyPage'

function setup() {
  render(
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>,
  )
}

describe('PrivacyPage', () => {
  it('har rubrik, titel och datum för senaste ändring', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Integritetspolicy' })).toBeInTheDocument()
    expect(document.title).toBe('Integritetspolicy – Sopor')
    expect(screen.getByText(/Senast ändrad 10 november 2026/)).toBeInTheDocument()
  })

  it('tar upp allt som ärendet kräver', () => {
    setup()
    for (const name of ['Vem som ansvarar', 'Webbplatsen', 'Appen Sophämtning', 'Dina rättigheter']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(screen.getByText(/inofficiell tjänst och är inte kopplad till någon kommun/)).toBeInTheDocument()
  })

  it('går att kontakta, och länkar till rensningen och till tillsynsmyndigheten', () => {
    setup()
    for (const mail of screen.getAllByRole('link', { name: 'support@hardyson.se' })) expect(mail).toHaveAttribute('href', 'mailto:support@hardyson.se')
    expect(screen.getByRole('link', { name: 'Om-sidan' })).toHaveAttribute('href', '/om')
    expect(screen.getByRole('link', { name: 'Integritetsskyddsmyndigheten' })).toHaveAttribute('href', 'https://www.imy.se')
  })

  it('anger hur länge loggar, cache och besökshash finns kvar', () => {
    setup()
    expect(screen.getByText(/loggar sparas i en timme/)).toBeInTheDocument()
    expect(screen.getByText(/högst åtta dygn/)).toBeInTheDocument()
    expect(screen.getByText(/kastas efter 24 timmar/)).toBeInTheDocument()
  })

  it('säger att appen inte har analys eller push', () => {
    setup()
    expect(screen.getByText(/samlar inte in analysdata och spårar dig inte/)).toBeInTheDocument()
    expect(screen.getByText(/utan push-server/)).toBeInTheDocument()
  })

  it('säger vad hushåll i appen delar, med vem och var det lagras', () => {
    setup()
    expect(screen.getByRole('heading', { level: 3, name: 'Hushåll i appen' })).toBeInTheDocument()
    expect(screen.getByText(/delas följande med dem du bjuder in eller som bjudit in dig/)).toBeInTheDocument()
    expect(screen.getByText(/i hushållsägarens iCloud. Sopor kan inte läsa dem/)).toBeInTheDocument()
    expect(screen.getByText(/Avslutar ägaren hushållet tas de delade uppgifterna bort ur iCloud/)).toBeInTheDocument()
  })
})
