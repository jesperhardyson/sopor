import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { StartPage } from './StartPage'

vi.mock('@/providers/registry', () => ({
  searchAll: async () => ({ addresses: [], failed: [] }),
  warmUpSearch: () => {},
  suggestAll: async () => [],
  providerFor: () => ({ getSchedule: async () => null }),
}))

function setup() {
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  return screen.getByRole('combobox')
}

describe('StartPage fokusläge', () => {
  it('tonar ner resten av sidan när man klickar i sökfältet', async () => {
    const input = setup()
    expect(screen.queryByTestId('sok-fokus')).toBeNull()
    await userEvent.click(input)
    expect(screen.getByTestId('sok-fokus')).toBeInTheDocument()
  })

  it('avslutas med Esc', async () => {
    const input = setup()
    await userEvent.click(input)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('sok-fokus')).toBeNull()
    expect(input).not.toHaveFocus()
  })

  it('avslutas när man klickar på den tonade ytan', async () => {
    const input = setup()
    await userEvent.click(input)
    await userEvent.click(screen.getByTestId('sok-fokus'))
    expect(screen.queryByTestId('sok-fokus')).toBeNull()
  })
})

describe('StartPage innehåll', () => {
  it('berättar vad man får se efter sökningen', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Koll på sopdagen, utan att behöva tänka på den' })).toBeInTheDocument()
    const points = screen.getByRole('list', { name: 'Det här får du' })
    for (const title of ['Nästa tömning direkt', 'Alla tömningar framåt', 'Schemat i din kalender', 'Spara adresser']) {
      expect(within(points).getByRole('heading', { name: title })).toBeInTheDocument()
    }
  })

  it('lägger informationen om tjänsten i ett eget band, skilt från sök och sparade adresser', () => {
    setup()
    const band = screen.getByTestId('infoband')
    expect(within(band).getByRole('heading', { name: 'Koll på sopdagen, utan att behöva tänka på den' })).toBeInTheDocument()
    expect(within(band).getByRole('heading', { name: 'Saknas din kommun? Hjälp till att få in den.' })).toBeInTheDocument()
    expect(within(band).queryByRole('combobox')).toBeNull()
  })

  it('visar exempelkortet bara visuellt, inte för skärmläsare', () => {
    setup()
    expect(screen.getByTestId('forhandsvisning')).toHaveAttribute('aria-hidden', 'true')
  })

  it('bjuder in till att bidra med kommuner', () => {
    setup()
    const bidra = screen.getByRole('region', { name: 'Saknas din kommun? Hjälp till att få in den.' })
    expect(within(bidra).getByText('Uppsala kommun')).toBeInTheDocument()
    expect(within(bidra).getByText('Herrljunga kommun')).toBeInTheDocument()
    expect(within(bidra).getByText('Vårgårda kommun')).toBeInTheDocument()
    expect(within(bidra).queryByText(/Remondis|Vafab/)).toBeNull()
    expect(within(bidra).queryByText('Avesta kommun')).toBeNull()
    expect(within(bidra).queryByText('Testdata')).toBeNull()
    expect(within(bidra).getByRole('link', { name: /Tipsa om din kommun/ })).toHaveAttribute(
      'href',
      'https://github.com/jesperhardyson/sopor/issues/new?template=ny-kommun.md',
    )
    expect(within(bidra).getByRole('link', { name: /Rapportera ett fel/ })).toHaveAttribute(
      'href',
      'https://github.com/jesperhardyson/sopor/issues/new?template=fel-i-schemat.md',
    )
    expect(within(bidra).getByRole('link', { name: /Lägg in schemat själv/ })).toHaveAttribute(
      'href',
      'https://github.com/jesperhardyson/sopor/blob/main/CONTRIBUTING.md',
    )
    expect(within(bidra).getByRole('link', { name: /Så går det till/ })).toHaveAttribute('href', '/bidra')
    expect(within(bidra).getByRole('link', { name: 'support@hardyson.se' })).toHaveAttribute(
      'href',
      'mailto:support@hardyson.se',
    )
  })
})
