import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Schedule } from '@/domain/types'
import { MonthCalendar } from './MonthCalendar'

const schedule: Schedule = {
  bins: [],
  updatedAt: '2026-10-29',
  events: [
    { date: '2026-12-09', fractions: ['rest'] },
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
})
