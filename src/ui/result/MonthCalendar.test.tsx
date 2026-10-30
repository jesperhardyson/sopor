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
  ],
}

describe('MonthCalendar', () => {
  it('markerar röda dagar och aftnar med namn', () => {
    render(<MonthCalendar schedule={schedule} initial="2026-12-09" today="2026-12-01" />)
    expect(screen.getByLabelText('25 december: juldagen')).toHaveAttribute('data-holiday', 'röd')
    expect(screen.getByLabelText('24 december: julafton')).toHaveAttribute('data-holiday', 'afton')
    expect(screen.getByLabelText('9 december: Restavfall')).not.toHaveAttribute('data-holiday')
  })
})
