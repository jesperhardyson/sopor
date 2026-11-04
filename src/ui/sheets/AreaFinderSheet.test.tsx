import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Area } from '@/domain/types'
import { AreaFinderSheet } from './AreaFinderSheet'

function area(id: string, name: string, dates: string[]): Area {
  return { id, name, day: 'Tisdag, jämn vecka', label: id === 'trakt-7' ? 'Trakt 7' : 'Trakt 1', places: [], otherDays: [], searchTerms: [], dates }
}

const areas = [
  area('trakt-7', 'Avesta tätort, Östanfors m.fl.', ['2026-10-13', '2026-10-27', '2026-11-10']),
  area('trakt-1', 'Askön, Nyhyttan m.fl.', ['2026-10-19', '2026-11-02']),
]

function show(over: { areas?: Area[]; onOpenChange?: (o: boolean) => void } = {}) {
  const onOpenChange = over.onOpenChange ?? vi.fn()
  render(
    <MemoryRouter>
      <AreaFinderSheet open onOpenChange={onOpenChange} areas={over.areas ?? areas} sourceId="avesta" today="2026-11-04" />
    </MemoryRouter>,
  )
  return { onOpenChange }
}

function pick(date: string) {
  fireEvent.change(screen.getByLabelText('Senaste tömning'), { target: { value: date } })
}

describe('AreaFinderSheet', () => {
  it('har en statusregion som finns redan innan ett datum valts och rymmer resultatet', () => {
    show()
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    pick('2026-10-27')
    expect(within(screen.getByRole('status')).getByText('Det här bör vara ditt område')).toBeInTheDocument()
    pick('2026-10-24')
    expect(within(screen.getByRole('status')).getByText('Inget område har hämtning den dagen')).toBeInTheDocument()
  })

  it('har rubrik, förklaring och ett datumfält som inte släpper fram framtiden', () => {
    show()
    expect(screen.getByRole('heading', { name: 'När tömdes ditt kärl senast?' })).toBeInTheDocument()
    expect(screen.getByText('Varje hämtdag hör till ett område, så datumet visar vilket som gäller.')).toBeInTheDocument()
    const input = screen.getByLabelText('Senaste tömning')
    expect(input).toHaveAttribute('type', 'date')
    expect(input).toHaveAttribute('max', '2026-11-04')
  })

  it('visar området som hade hämtning, med kontroll och länk till schemat', () => {
    show()
    pick('2026-10-27')
    expect(screen.getByText('Det här bör vara ditt område')).toBeInTheDocument()
    expect(screen.getByText('Avesta tätort, Östanfors m.fl.')).toBeInTheDocument()
    expect(screen.getByText('Tisdag, jämn vecka · Trakt 7')).toBeInTheDocument()
    expect(
      screen.getByText('Tömningar 13 okt och 27 okt. Nästa är 10 nov. Stämmer det? En försenad tömning kan ge fel område.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Visa hämtschemat' })).toHaveAttribute('href', '/avesta/trakt-7')
  })

  it('klarar att bara en tidigare tömning finns', () => {
    show()
    pick('2026-10-13')
    expect(
      screen.getByText('Tömning 13 okt. Nästa är 27 okt. Stämmer det? En försenad tömning kan ge fel område.'),
    ).toBeInTheDocument()
  })

  it('utelämnar "Nästa är" när området inte har fler tömningar', () => {
    show({ areas: [area('trakt-7', 'Avesta tätort, Östanfors m.fl.', ['2026-10-13', '2026-10-27']), areas[1]] })
    pick('2026-10-27')
    const text = screen.getByText(/^Tömningar 13 okt och 27 okt\./).textContent
    expect(text).toBe('Tömningar 13 okt och 27 okt. Stämmer det? En försenad tömning kan ge fel område.')
  })

  it('säger att ingen hade hämtning en dag utan tömning', () => {
    show()
    pick('2026-10-24')
    expect(screen.getByText('Inget område har hämtning den dagen')).toBeInTheDocument()
    expect(screen.getByText('Hämtning sker måndag till fredag. Prova ett annat datum eller välj område i listan.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Visa hämtschemat' })).not.toBeInTheDocument()
  })

  it('säger att schemat saknas för ett datum utanför det', () => {
    show()
    pick('2026-08-01')
    expect(screen.getByText('Vi har inget schema för det datumet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Välj område själv' })).toBeInTheDocument()
  })

  it('säger att ett framtida datum inte har varit än, utan område', () => {
    show()
    pick('2026-11-10')
    expect(screen.getByText('Datumet har inte varit än')).toBeInTheDocument()
    expect(screen.queryByText('Det här bör vara ditt område')).not.toBeInTheDocument()
    expect(screen.queryByText('Avesta tätort, Östanfors m.fl.')).not.toBeInTheDocument()
  })

  it('tar bort resultatet när fältet töms', () => {
    show()
    pick('2026-10-27')
    pick('')
    expect(screen.queryByText('Det här bör vara ditt område')).not.toBeInTheDocument()
    expect(screen.queryByText('Vi har inget schema för det datumet')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stänger arket med "Välj område själv"', async () => {
    const { onOpenChange } = show()
    pick('2026-10-24')
    await userEvent.click(screen.getByRole('button', { name: 'Välj område själv' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
