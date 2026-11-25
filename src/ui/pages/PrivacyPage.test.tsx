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
    expect(screen.getByText(/Senast ändrad 25 november 2026/)).toBeInTheDocument()
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

  it('säger att appen inte har analys, och när push används', () => {
    setup()
    expect(screen.getByText(/samlar inte in analysdata och spårar dig inte/)).toBeInTheDocument()
    expect(screen.getByText(/Notiser och Live Activities visas av appen själv/)).toBeInTheDocument()
    expect(screen.queryByText(/utan push-server/)).toBeNull()
    expect(screen.queryByText(/ingen egen backend/)).toBeNull()
  })

  it('säger vad hushåll i appen delar, med vem och var det lagras', () => {
    setup()
    expect(screen.getByRole('heading', { level: 3, name: 'Hushåll i appen' })).toBeInTheDocument()
    expect(screen.getByText(/delas följande med dem du bjuder in eller som bjudit in dig/)).toBeInTheDocument()
    expect(screen.getByText(/krypteras på telefonen innan det skickas/)).toBeInTheDocument()
    expect(screen.getByText(/lagras hos Cloudflare inom EU/)).toBeInTheDocument()
    expect(screen.getByText(/Den som har länken kan gå med/)).toBeInTheDocument()
  })

  it('säger vad servern för hushåll ser', () => {
    setup()
    const part = screen.getByRole('heading', { level: 3, name: 'Det som servern för hushåll ser' }).parentElement!
    for (const text of [/slumpade id/, /ägare/, /hur många/, /när något ändras/, /ip-adress/]) expect(part).toHaveTextContent(text)
    expect(part).toHaveTextContent(/pushadress.*bara hushållets id och ett löpnummer/)
    expect(screen.getByRole('link', { name: 'Cloudflares integritetspolicy' })).toHaveAttribute('href', 'https://www.cloudflare.com/privacypolicy/')
  })

  it('säger när uppgifterna om ett hushåll tas bort', () => {
    setup()
    const part = screen.getByRole('heading', { level: 3, name: 'När uppgifterna om hushållet tas bort' }).parentElement!
    for (const text of [/dagen efter hämtningen/, /400 dagar/, /30 dagar/, /lämnar du hushållet/i, /bara hushållets id/]) expect(part).toHaveTextContent(text)
  })

  it('tar upp hushåll som ligger kvar i iCloud', () => {
    setup()
    const part = screen.getByRole('heading', { level: 3, name: 'Hushåll från äldre versioner av appen' }).parentElement!
    expect(part).toHaveTextContent(/i hushållsägarens iCloud/)
    expect(part).toHaveTextContent(/flyttas/)
    expect(part).toHaveTextContent(/90 dagar/)
  })
})
