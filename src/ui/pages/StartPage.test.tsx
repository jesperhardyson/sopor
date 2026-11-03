import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StartPage } from './StartPage'

vi.mock('@/providers/registry', () => ({
  searchAll: async () => ({ addresses: [], failed: [] }),
  warmUpSearch: () => {},
  prefetchAddress: () => {},
  suggestAll: async () => [],
  missingKommuner: async () => [],
  kommunStatus: async () => [],
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
  afterEach(() => vi.restoreAllMocks())

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

  it('scrollar sidan så att sökfältet hamnar nära toppen', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 372 } as DOMRect)
    const input = setup()
    await userEvent.click(input)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 456 }))
  })

  // Telefonen scrollar själv när tangentbordet öppnas. En transform ovanpå den scrollen
  // flyttade fältet ovanför skärmen.
  it('flyttar inte sökfältet med transform', async () => {
    const input = setup()
    await userEvent.click(input)
    for (let el: HTMLElement | null = input; el; el = el.parentElement) {
      expect(el.style.transform).toBe('')
    }
  })

  it('avslutas när man klickar på den tonade ytan', async () => {
    const input = setup()
    await userEvent.click(input)
    await userEvent.click(screen.getByTestId('sok-fokus'))
    expect(screen.queryByTestId('sok-fokus')).toBeNull()
  })
})

describe('StartPage innehåll', () => {
  it('har sajtens titel', () => {
    document.title = 'Bidra – Sopor'
    setup()
    expect(document.title).toBe('Sopor – när töms dina kärl?')
  })

  it('har ett eget avsnitt om integrationerna med korten', () => {
    setup()
    const section = screen.getByRole('region', { name: 'Påminnelse i Homey eller Home Assistant' })
    expect(within(section).getByRole('article', { name: 'Homey' })).toBeInTheDocument()
    expect(within(section).getByRole('article', { name: 'Home Assistant' })).toBeInTheDocument()
    expect(within(section).getByRole('article', { name: 'API' })).toBeInTheDocument()
    expect(within(section).getByText('Integrationer')).toBeInTheDocument()
  })

  it('berättar vad man får se efter sökningen', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Koll på sopdagen, utan att behöva tänka på den' })).toBeInTheDocument()
    const points = screen.getByRole('list', { name: 'Det här får du' })
    expect(within(points).getByRole('link', { name: /Läs mer om integrationer/ })).toHaveAttribute('href', '/om#integrationer')
    expect(within(points).getByText('Påminnelser i Homey och Home Assistant, kvällen innan.')).toBeInTheDocument()
    for (const title of ['Nästa tömning direkt', 'Alla tömningar framåt', 'Schemat i din kalender', 'Spara adresser', 'Integrationer']) {
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

  it('bjuder in till att bidra med kommuner', async () => {
    setup()
    const bidra = screen.getByRole('region', { name: 'Saknas din kommun? Hjälp till att få in den.' })
    await userEvent.click(within(bidra).getByRole('button', { name: 'Visa alla kommuner' }))
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

describe('StartPage och Finns din kommun?', () => {
  it('länkar från kommunraden till kontrollen i Bidra-kortet', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Finns din kommun?' })).toHaveAttribute('href', '/#finns-din-kommun')
    expect(screen.getByRole('textbox', { name: 'Kommun eller ort' })).toBeInTheDocument()
  })

  it('sätter fokus i adressfältet när man kommer via #sok', () => {
    render(
      <MemoryRouter initialEntries={['/#sok']}>
        <StartPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('combobox')).toHaveFocus()
  })
})
