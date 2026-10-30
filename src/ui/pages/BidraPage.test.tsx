import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { BidraPage, REQUEST_TEXT } from './BidraPage'

function setup() {
  render(
    <MemoryRouter>
      <BidraPage />
    </MemoryRouter>,
  )
}

describe('BidraPage', () => {
  it('förklarar hur man tar reda på var kommunens data finns, utan teknik', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Hjälp till att få in din kommun' })).toBeInTheDocument()
    const steps = screen.getByRole('list', { name: 'Så tar du reda på var datan finns' })
    expect(within(steps).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.queryByText(/curl/)).toBeNull()
  })

  it('har de tre sätten att bidra och kommunernas status', () => {
    setup()
    expect(screen.getByRole('link', { name: /Tipsa om din kommun/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Rapportera ett fel/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Lägg in schemat själv/ })).toBeInTheDocument()
    expect(screen.getByText('Avesta kommun')).toBeInTheDocument()
  })

  it('kopierar exempeltexten för att begära ut adresslistan', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Kopiera texten' }))
    expect(await navigator.clipboard.readText()).toBe(REQUEST_TEXT)
    expect(screen.getByRole('button', { name: 'Kopierad!' })).toBeInTheDocument()
  })

  it('länkar till den tekniska guiden för utvecklare', () => {
    setup()
    expect(screen.getByRole('link', { name: /tekniska guiden/ })).toHaveAttribute(
      'href',
      'https://github.com/jesperhardyson/sopor/blob/main/docs/kommuner/hitta-kommunens-data.md',
    )
  })
})
