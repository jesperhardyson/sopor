import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Schedule } from '@/domain/types'
import { MonthCalendar } from './MonthCalendar'

const schedule: Schedule = {
  bins: [],
  updatedAt: '2026-10-29',
  events: [
    { date: '2026-12-09', fractions: ['rest'], estimated: true },
    { date: '2026-12-23', fractions: ['mat'] },
    { date: '2026-12-02', fractions: ['rest', 'papper', 'plast'] },
    { date: '2026-12-16', fractions: ['rest', 'papper', 'plast', 'glas', 'metall', 'tidningar', 'mat'] },
  ],
}

describe('MonthCalendar', () => {
  it('markerar röda dagar och aftnar med namn', () => {
    render(<MonthCalendar schedule={schedule} initial="2026-12-09" today="2026-12-01" />)
    expect(screen.getByLabelText('25 december: juldagen')).toHaveAttribute('data-holiday', 'röd')
    expect(screen.getByLabelText('24 december: julafton')).toHaveAttribute('data-holiday', 'afton')
    expect(screen.getByLabelText('9 december: Restavfall')).not.toHaveAttribute('data-holiday')
  })

  it('visar alla ikoner när de är högst tre', () => {
    render(<MonthCalendar schedule={schedule} initial="2026-12-09" today="2026-12-01" />)
    const day = screen.getByLabelText('2 december: Restavfall, Pappersförpackningar, Plastförpackningar')
    expect(day.querySelectorAll('svg')).toHaveLength(3)
  })

  it('visar två ikoner och antalet till när det är fler, så att dagen får plats', () => {
    render(<MonthCalendar schedule={schedule} initial="2026-12-09" today="2026-12-01" />)
    const day = screen.getByLabelText(/^16 december: Restavfall, Pappersförpackningar/)
    expect(day.querySelectorAll('svg')).toHaveLength(2)
    expect(day).toHaveTextContent('+5')
  })

  it('använder källans namn på fraktionen i förklaringen, som i etiketterna', () => {
    const egna: Schedule = { ...schedule, events: [{ date: '2026-12-09', fractions: ['karl'], labels: { karl: 'Hushåll' } }] }
    render(<MonthCalendar schedule={egna} initial="2026-12-09" today="2026-12-01" />)
    expect(screen.getByTestId('forklaring')).toHaveTextContent('Hushåll')
  })

  it('har månadsknappar som är stora nog att träffa med fingret', () => {
    render(<MonthCalendar schedule={schedule} initial="2026-12-09" today="2026-12-01" />)
    expect(screen.getByRole('button', { name: 'Nästa månad' })).toHaveClass('after:-inset-1')
  })

  it('visar allt som töms en dag när man trycker på den', async () => {
    render(<MonthCalendar schedule={schedule} initial="2026-12-09" today="2026-12-01" />)
    await userEvent.click(screen.getByRole('button', { name: /^16 december:/ }))
    const dialog = screen.getByRole('dialog', { name: 'Onsdag 16 december' })
    for (const name of ['Restavfall', 'Matavfall', 'Glas', 'Metall', 'Tidningar']) {
      expect(within(dialog).getByText(name)).toBeInTheDocument()
    }
  })

  it('berättar i dagens detaljer att datumet är framräknat', async () => {
    render(<MonthCalendar schedule={schedule} initial="2026-12-09" today="2026-12-01" />)
    await userEvent.click(screen.getByRole('button', { name: '9 december: Restavfall' }))
    expect(within(screen.getByRole('dialog')).getByText('beräknat')).toBeInTheDocument()
  })

  it('gör bara dagar med tömning klickbara', () => {
    render(<MonthCalendar schedule={schedule} initial="2026-12-09" today="2026-12-01" />)
    expect(screen.getAllByRole('button', { name: /december:/ })).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /juldagen/ })).toBeNull()
  })
})
