import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Address } from '@/domain/types'
import { loadSaved } from '@/lib/storage'
import { CalendarSheet } from './CalendarSheet'
import { SaveSheet } from './SaveSheet'

const villa: Address = { id: 'krylbo-storgatan-12b', street: 'Storgatan 12 B', locality: 'Krylbo', municipalityId: 'avesta' }

describe('CalendarSheet', () => {
  it('har fyra sätt att lägga till kalendern och ett notistips', () => {
    render(<CalendarSheet open onOpenChange={() => {}} address={villa} icsPath="/ics/avesta/krylbo-storgatan-12b.ics" />)
    expect(screen.getByRole('heading', { name: 'Lägg till i kalender' })).toBeInTheDocument()
    const subscribe = screen.getByRole('link', { name: /^Prenumerera/ })
    expect(subscribe).toHaveAttribute('href', 'webcal://sopor.hardyson.se/ics/avesta/krylbo-storgatan-12b.ics')
    expect(subscribe).toHaveTextContent('Bäst')
    expect(screen.getByRole('link', { name: /Google Kalender/ }).getAttribute('href')).toContain(
      'calendar.google.com/calendar/r?cid=webcal%3A%2F%2F',
    )
    expect(screen.getByRole('link', { name: /Apple Kalender/ })).toHaveAttribute(
      'href',
      'webcal://sopor.hardyson.se/ics/avesta/krylbo-storgatan-12b.ics',
    )
    const download = screen.getByRole('link', { name: /Ladda ner \.ics/ })
    expect(download).toHaveAttribute('href', '/ics/avesta/krylbo-storgatan-12b.ics')
    expect(download).toHaveAttribute('download')
    expect(
      screen.getByText(
        'Vill du bli påmind kvällen innan? Slå på notiser för kalendern i din kalenderapp. Google och Apple stänger ofta av dem för prenumerationer.',
      ),
    ).toBeInTheDocument()
  })
})

describe('SaveSheet', () => {
  beforeEach(() => localStorage.clear())

  it('fyller i namn från snabbval och sparar adressen', async () => {
    let open = true
    render(<SaveSheet open onOpenChange={(o) => (open = o)} address={villa} municipalityName="Avesta kommun" />)
    expect(screen.getByText('Storgatan 12 B, Krylbo · Avesta kommun')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stugan' }))
    expect(screen.getByLabelText('Ge adressen ett namn')).toHaveValue('Stugan')
    await userEvent.click(screen.getByRole('button', { name: 'Spara adress' }))
    expect(loadSaved()).toMatchObject([{ addressId: 'krylbo-storgatan-12b', name: 'Stugan', street: 'Storgatan 12 B' }])
    expect(open).toBe(false)
  })
})
