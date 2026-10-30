import { describe, expect, it, vi } from 'vitest'
import { buildIcs } from './ics'
import type { Address, Schedule } from './types'

const address: Address = {
  id: 'krylbo-storgatan-12b',
  street: 'Storgatan 12 B',
  locality: 'Krylbo',
  sourceId: 'avesta',
  kommun: 'Avesta kommun',
}

const schedule: Schedule = {
  bins: [],
  updatedAt: '2026-10-29',
  events: [
    { date: '2026-11-11', fractions: ['rest', 'mat'] },
    { date: '2026-11-25', fractions: ['mat', 'papper'] },
    {
      date: '2027-01-07',
      fractions: ['papper', 'mat'],
      deviation: { originalDate: '2027-01-06', reason: 'trettondedag jul' },
    },
  ],
}

const ics = () => buildIcs({ address, kommunName: 'Avesta kommun', schedule })

/** Avvikta rader (RFC 5545 3.1) */
function unfold(text: string): string[] {
  return text.replace(/\r\n /g, '').split('\r\n')
}

function vevent(text: string, date: string): string[] {
  const lines = unfold(text)
  const start = lines.indexOf(`DTSTART;VALUE=DATE:${date.replaceAll('-', '')}`)
  const begin = lines.lastIndexOf('BEGIN:VEVENT', start)
  return lines.slice(begin, lines.indexOf('END:VEVENT', start) + 1)
}

describe('buildIcs', () => {
  it('matchar snapshot', () => {
    expect(ics()).toMatchSnapshot()
  })

  it('använder CRLF och viker rader vid 75 oktetter utan att dela tecken', () => {
    const text = ics()
    expect(text.endsWith('\r\n')).toBe(true)
    expect(text.replace(/\r\n/g, '')).not.toMatch(/\n|\r/)
    for (const line of text.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
      expect(line).not.toContain('�')
    }
  })

  it('har kalendernamn och uppdateringsintervall', () => {
    const lines = unfold(ics())
    expect(lines).toContain('X-WR-CALNAME:Sopor – Storgatan 12 B\\, Krylbo')
    expect(lines).toContain('REFRESH-INTERVAL;VALUE=DURATION:P1D')
    expect(lines).toContain('X-PUBLISHED-TTL:P1D')
  })

  it('skapar heldagshändelse med stabilt UID, titel och påminnelse kvällen innan', () => {
    const ev = vevent(ics(), '2026-11-11')
    expect(ev).toContain('DTEND;VALUE=DATE:20261112')
    expect(ev).toContain('UID:krylbo-storgatan-12b-2026-11-11@sopor.hardyson.se')
    expect(ev).toContain('SUMMARY:Sopor: Restavfall + Matavfall')
    expect(ev).toContain('BEGIN:VALARM')
    expect(ev).toContain('TRIGGER:-PT6H')
    expect(ev).toContain('ACTION:DISPLAY')
  })

  it('sorterar fraktionerna i titeln enligt registret', () => {
    expect(vevent(ics(), '2026-11-25')).toContain('SUMMARY:Sopor: Pappersförpackningar + Matavfall')
  })

  it('beskriver avvikelser och friskrivning', () => {
    const desc = vevent(ics(), '2027-01-07').find((l) => l.startsWith('DESCRIPTION:'))
    expect(desc).toContain('Flyttad från onsdag 6 januari (trettondedag jul).')
    expect(desc).toContain('Inofficiell tjänst. Vid avvikelser gäller kommunens information.')
  })

  it('ger samma fil oavsett när den byggs', () => {
    const first = ics()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T12:00:00Z'))
    const second = ics()
    vi.useRealTimers()
    expect(second).toBe(first)
    expect(unfold(first)).toContain('DTSTAMP:20261029T000000Z')
  })

  it('escapar specialtecken i text', () => {
    const odd: Schedule = {
      ...schedule,
      events: [{ date: '2026-12-01', fractions: ['rest'], deviation: { reason: 'a,b;c\\d\nny rad' } }],
    }
    const text = buildIcs({ address, kommunName: 'Avesta kommun', schedule: odd })
    const desc = unfold(text).find((l) => l.startsWith('DESCRIPTION:'))
    expect(desc).toContain('a\\,b\\;c\\\\d\\nny rad')
  })
})
