import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PickupEvent } from '@/domain/types'
import { NextPickup } from './NextPickup'
import { UpcomingList } from './UpcomingList'

const events: PickupEvent[] = [
  { date: '2026-12-17', fractions: ['rest', 'karl'], labels: { karl: 'Fyrfack 1' }, estimated: false },
  { date: '2026-12-24', fractions: ['rest'], estimated: true, warning: 'Infaller på julafton – kan flyttas.' },
]

describe('beräknade datum i UI:t', () => {
  it('visar källans kärltext och markerar beräknade rader med varning', () => {
    render(<UpcomingList events={events} today="2026-12-10" />)
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('Fyrfack 1')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('beräknat')).toBeNull()
    expect(within(rows[1]).getByText('beräknat')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Infaller på julafton – kan flyttas.')).toBeInTheDocument()
  })

  it('märker nästa tömning som beräknad när den är det', () => {
    render(<NextPickup event={events[1]} today="2026-12-10" />)
    expect(screen.getByText('beräknat')).toBeInTheDocument()
    expect(screen.getByText('Infaller på julafton – kan flyttas.')).toBeInTheDocument()
  })
})
