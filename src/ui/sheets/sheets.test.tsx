import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReminderId } from '@/domain/reminders'
import type { Address } from '@/domain/types'
import { loadSaved } from '@/lib/storage'
import { CalendarSheet } from './CalendarSheet'
import { SaveSheet } from './SaveSheet'

const villa: Address = { id: 'krylbo-storgatan-12b', street: 'Storgatan 12 B', locality: 'Krylbo', sourceId: 'uppsala', kommun: 'Avesta kommun' }

const icsUrl = (reminder: ReminderId) =>
  reminder === 'kvall-18' ? '/ics/avesta/krylbo-storgatan-12b.ics' : `/ics/avesta/${reminder}/krylbo-storgatan-12b.ics`

const googleCid = (href: string | null) => new URL(href!).searchParams.get('cid')

describe('CalendarSheet', () => {
  it('visar ingen varning för en vanlig adress', () => {
    render(<CalendarSheet open onOpenChange={() => {}} address={villa} icsUrl={icsUrl} />)
    expect(screen.queryByText(/Kontrollera/)).toBeNull()
  })

  it('har fyra sätt att lägga till kalendern och ett notistips', () => {
    render(<CalendarSheet open onOpenChange={() => {}} address={villa} icsUrl={icsUrl} />)
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
    // Med download sparar iOS bara filen i stället för att öppna kalendern.
    expect(download).not.toHaveAttribute('download')
    expect(
      screen.getByText(
        'Påminnelsen kommer kvällen innan kl. 18. Slå på notiser för kalendern i din kalenderapp. Google Kalender visar troligen inte påminnelser från prenumerationer. Vill du byta tid senare tar du bort kalendern och lägger till den igen.',
      ),
    ).toBeInTheDocument()
  })

  it('börjar på kl. 18', () => {
    render(<CalendarSheet open onOpenChange={() => {}} address={villa} icsUrl={icsUrl} />)
    expect(screen.getByRole('group', { name: 'När vill du bli påmind?' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Kvällen innan, kl. 18' })).toBeChecked()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })

  it('byter alla fyra länkarna när man väljer en annan tid', async () => {
    render(<CalendarSheet open onOpenChange={() => {}} address={villa} icsUrl={icsUrl} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Samma morgon, kl. 06' }))
    const webcal = 'webcal://sopor.hardyson.se/ics/avesta/morgon/krylbo-storgatan-12b.ics'
    expect(screen.getByRole('link', { name: /^Prenumerera/ })).toHaveAttribute('href', webcal)
    expect(screen.getByRole('link', { name: /Apple Kalender/ })).toHaveAttribute('href', webcal)
    expect(googleCid(screen.getByRole('link', { name: /Google Kalender/ }).getAttribute('href'))).toBe(webcal)
    expect(screen.getByRole('link', { name: /Ladda ner \.ics/ })).toHaveAttribute('href', '/ics/avesta/morgon/krylbo-storgatan-12b.ics')
  })

  it('låter notistexten följa valet', async () => {
    render(<CalendarSheet open onOpenChange={() => {}} address={villa} icsUrl={icsUrl} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Kväll och morgon' }))
    expect(screen.getByText(/^Påminnelser kommer kvällen innan kl\. 18 och samma morgon kl\. 06\. Slå på notiser/)).toBeInTheDocument()
  })

  it('går att använda med tangentbordet', async () => {
    render(<CalendarSheet open onOpenChange={() => {}} address={villa} icsUrl={icsUrl} />)
    screen.getByRole('radio', { name: 'Kvällen innan, kl. 18' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: 'Kvällen innan, kl. 20' })).toBeChecked()
  })

  it('börjar om på kl. 18 när rutan öppnas igen', async () => {
    const { rerender } = render(<CalendarSheet open onOpenChange={() => {}} address={villa} icsUrl={icsUrl} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Samma morgon, kl. 06' }))
    rerender(<CalendarSheet open={false} onOpenChange={() => {}} address={villa} icsUrl={icsUrl} />)
    rerender(<CalendarSheet open onOpenChange={() => {}} address={villa} icsUrl={icsUrl} />)
    expect(screen.getByRole('radio', { name: 'Kvällen innan, kl. 18' })).toBeChecked()
  })

  it('skickar valet via Google på Android', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile')
    render(<CalendarSheet open onOpenChange={() => {}} address={villa} icsUrl={icsUrl} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Kvällen innan, kl. 20' }))
    expect(googleCid(screen.getByRole('link', { name: /^Prenumerera/ }).getAttribute('href'))).toBe(
      'webcal://sopor.hardyson.se/ics/avesta/kvall-20/krylbo-storgatan-12b.ics',
    )
    vi.restoreAllMocks()
  })

  it('prenumererar via Google på Android, som inte kan öppna webcal', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    )
    render(<CalendarSheet open onOpenChange={() => {}} address={villa} icsUrl={icsUrl} />)
    const subscribe = screen.getByRole('link', { name: /^Prenumerera/ })
    expect(subscribe.getAttribute('href')).toContain('calendar.google.com/calendar/r?cid=webcal%3A%2F%2F')
    vi.restoreAllMocks()
  })
})

describe('SaveSheet', () => {
  beforeEach(() => localStorage.clear())

  it('fyller i namn från snabbval och sparar adressen', async () => {
    let open = true
    render(<SaveSheet open onOpenChange={(o) => (open = o)} address={villa} kommunName="Avesta kommun" />)
    expect(screen.getByText('Storgatan 12 B, Krylbo · Avesta kommun')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stugan' }))
    expect(screen.getByLabelText('Ge adressen ett namn')).toHaveValue('Stugan')
    await userEvent.click(screen.getByRole('button', { name: 'Spara adress' }))
    expect(loadSaved()).toMatchObject([{ addressId: 'krylbo-storgatan-12b', name: 'Stugan', street: 'Storgatan 12 B' }])
    expect(open).toBe(false)
  })

  // Fokus i fältet öppnar tangentbordet på mobil, och det täcker "Spara adress".
  it('fokuserar arket, inte namnfältet, när det öppnas', () => {
    render(<SaveSheet open onOpenChange={() => {}} address={villa} kommunName="Avesta kommun" />)
    expect(screen.getByLabelText('Ge adressen ett namn')).not.toHaveFocus()
    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('använder ordet område för en källa som väljs per område', async () => {
    const area: Address = { ...villa, id: 'trakt-7', street: 'Avesta tätort', locality: '', sourceId: 'avesta' }
    render(<SaveSheet open onOpenChange={() => {}} address={area} kommunName="Avesta kommun" />)
    expect(screen.getByRole('dialog', { name: 'Spara område' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ge området ett namn')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Spara område' }))
    expect(loadSaved()).toMatchObject([{ addressId: 'trakt-7', street: 'Avesta tätort' }])
  })

  it('behåller adressorden för vanliga källor', () => {
    render(<SaveSheet open onOpenChange={() => {}} address={villa} kommunName="Avesta kommun" />)
    expect(screen.getByRole('dialog', { name: 'Spara adress' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spara adress' })).toBeInTheDocument()
  })
})
