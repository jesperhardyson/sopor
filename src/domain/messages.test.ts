import { describe, expect, it } from 'vitest'
import { activeMessages, currentAndUpcoming, messagesOn, type SourceMessage } from './messages'

const msg = (id: string, validFrom: string, validTo: string): SourceMessage => ({ id, title: id, text: id, validFrom, validTo })

describe('activeMessages', () => {
  const nov = [msg('nov', '2026-11-17', '2026-11-30')]

  it('gäller från första till sista dagen, båda inklusive', () => {
    expect(activeMessages(nov, '2026-11-17').map((m) => m.id)).toEqual(['nov'])
    expect(activeMessages(nov, '2026-11-30').map((m) => m.id)).toEqual(['nov'])
    expect(activeMessages(nov, '2026-11-16')).toEqual([])
    expect(activeMessages(nov, '2026-12-01')).toEqual([])
  })

  it('ger en tom lista när källan saknar meddelanden', () => {
    expect(activeMessages(undefined, '2026-11-17')).toEqual([])
  })

  it('sorterar på första dagen och sedan id', () => {
    const list = [msg('a', '2026-11-10', '2026-12-31'), msg('c', '2026-11-01', '2026-12-31'), msg('b', '2026-11-01', '2026-12-31')]
    expect(activeMessages(list, '2026-11-17').map((m) => m.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('currentAndUpcoming', () => {
  it('tar med kommande men inte utgångna', () => {
    const list = [msg('snart', '2026-12-01', '2026-12-31'), msg('slut', '2026-11-01', '2026-11-16'), msg('nu', '2026-11-01', '2026-11-30')]
    expect(currentAndUpcoming(list, '2026-11-17').map((m) => m.id)).toEqual(['nu', 'snart'])
  })
})

describe('messagesOn', () => {
  it('ger meddelandena som gäller på ett visst datum', () => {
    const list = [msg('nov', '2026-11-20', '2026-11-30')]
    expect(messagesOn(list, '2026-11-24').map((m) => m.id)).toEqual(['nov'])
    expect(messagesOn(list, '2026-11-10')).toEqual([])
  })
})
