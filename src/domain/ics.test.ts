import { describe, expect, it, vi } from 'vitest'
import { buildIcs } from './ics'
import { REMINDER_IDS, type ReminderId } from './reminders'
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

  it('märker beräknade datum och visar varning och källans kärltext', () => {
    const estimated: Schedule = {
      ...schedule,
      events: [
        { date: '2026-12-24', fractions: ['rest', 'karl'], labels: { karl: 'Fyrfack 1' }, estimated: true, warning: 'Infaller på julafton – kan flyttas.' },
      ],
    }
    const lines = unfold(buildIcs({ address, kommunName: 'Avesta kommun', schedule: estimated }))
    expect(lines).toContain('SUMMARY:Sopor: Restavfall + Fyrfack 1 (beräknat)')
    const desc = lines.find((l) => l.startsWith('DESCRIPTION:Infaller'))
    expect(desc).toContain('Infaller på julafton – kan flyttas.')
    expect(desc).toContain('Beräknat datum – helgdagar kan flytta tömningen. Kolla kommunens besked.')
    expect(lines).toContain('UID:krylbo-storgatan-12b-2026-12-24@sopor.hardyson.se')
  })
})

describe('buildIcs med vald påminnelsetid', () => {
  const icsWith = (reminder: ReminderId) => buildIcs({ address, kommunName: 'Avesta kommun', schedule, reminder })

  it.each<[ReminderId, string[], string[]]>([
    ['kvall-20', ['TRIGGER:-PT4H'], ['DESCRIPTION:I morgon: Restavfall + Matavfall']],
    ['morgon', ['TRIGGER:PT6H'], ['DESCRIPTION:I dag: Restavfall + Matavfall']],
    [
      'kvall-och-morgon',
      ['TRIGGER:-PT6H', 'TRIGGER:PT6H'],
      ['DESCRIPTION:I morgon: Restavfall + Matavfall', 'DESCRIPTION:I dag: Restavfall + Matavfall'],
    ],
  ])('bygger påminnelserna för %s', (reminder, triggers, descriptions) => {
    const lines = vevent(icsWith(reminder), '2026-11-11')
    expect(lines.filter((l) => l.startsWith('TRIGGER:'))).toEqual(triggers)
    expect(lines.filter((l) => l === 'BEGIN:VALARM')).toHaveLength(triggers.length)
    for (const description of descriptions) expect(lines).toContain(description)
  })

  it('har samma UID för alla val', () => {
    for (const id of REMINDER_IDS) {
      expect(vevent(icsWith(id), '2026-11-11')).toContain('UID:krylbo-storgatan-12b-2026-11-11@sopor.hardyson.se')
    }
  })

  it('ger samma fil för förvalet som utan val', () => {
    expect(icsWith('kvall-18')).toBe(ics())
  })

  it('viker rader vid 75 oktetter även med två påminnelser och långa namn', () => {
    const fractions = ['rest', 'mat', 'papper', 'plast', 'glas', 'metall'] as const
    const long: Schedule = { ...schedule, events: [{ date: '2026-11-11', fractions: [...fractions] }] }
    const text = buildIcs({ address, kommunName: 'Avesta kommun', schedule: long, reminder: 'kvall-och-morgon' })
    expect(unfold(text).filter((l) => l === 'BEGIN:VALARM')).toHaveLength(2)
    for (const line of text.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })
})

describe('buildIcs med varning för valt område', () => {
  const unfolded = (ics: string) => ics.replace(/\r\n /g, '')
  const area = { id: 'trakt-7', street: 'Avesta tätort', locality: '', sourceId: 'avesta', kommun: 'Avesta kommun' }
  const schedule = { updatedAt: '2026-11-04', bins: [], events: [{ date: '2026-11-10', fractions: ['mat' as const] }, { date: '2026-11-24', fractions: ['mat' as const] }] }

  it('står i kalendern och i varje händelse, med oförändrat UID', () => {
    const ics = unfolded(buildIcs({ address: area, kommunName: 'Avesta kommun', schedule: schedule as never, notice: 'Kontrollera att området stämmer. Text.' }))
    expect(ics).toMatch(/X-WR-CALDESC:.*Kontrollera att området stämmer\. Text\./)
    expect(ics.match(/^DESCRIPTION:Kontrollera att området stämmer/gm)).toHaveLength(2)
    expect(ics).toContain('UID:trakt-7-2026-11-10@sopor.hardyson.se')
  })

  it('saknas utan varning', () => {
    expect(buildIcs({ address: area, kommunName: 'Avesta kommun', schedule: schedule as never })).not.toContain('Kontrollera')
  })
})

describe('buildIcs med meddelanden från källan', () => {
  const schedule = { updatedAt: '2026-11-04', bins: [], events: [{ date: '2026-11-10', fractions: ['mat' as const] }, { date: '2026-11-24', fractions: ['mat' as const] }] }
  const messages = [{ id: 'rutter', title: 'Rutterna läggs om', text: 'Kontrollera schemat.', validFrom: '2026-11-20', validTo: '2026-11-30' }]
  const without = buildIcs({ address, kommunName: 'Avesta kommun', schedule })
  const withMessages = buildIcs({ address, kommunName: 'Avesta kommun', schedule, messages })

  it('står i tömningar inom meddelandets period, före friskrivningen', () => {
    const description = vevent(withMessages, '2026-11-24').find((l) => l.startsWith('DESCRIPTION:'))!
    expect(description).toMatch(/^DESCRIPTION:Rutterna läggs om: Kontrollera schemat\.\\n/)
  })

  it('saknas i tömningar utanför perioden', () => {
    expect(vevent(withMessages, '2026-11-10')).toEqual(vevent(without, '2026-11-10'))
  })

  it('ändrar bara beskrivningen och tidsstämpeln i berörda tömningar', () => {
    const changed = unfold(withMessages).filter((l, i) => l !== unfold(without)[i])
    // Tidsstämpeln blir meddelandets första dag, så att kalenderappar ser att händelsen ändrats.
    expect(changed).toEqual(['DTSTAMP:20261120T000000Z', expect.stringMatching(/^DESCRIPTION:Rutterna läggs om/)])
    expect(unfold(withMessages)).toHaveLength(unfold(without).length)
  })

  it('behåller schemats tidsstämpel när den är senare än meddelandet', () => {
    const later = buildIcs({ address, kommunName: 'Avesta kommun', schedule: { ...schedule, updatedAt: '2026-11-22' }, messages })
    expect(vevent(later, '2026-11-24')).toContain('DTSTAMP:20261122T000000Z')
  })
})
