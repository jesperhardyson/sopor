import { describe, expect, it } from 'vitest'
import type { SoporMessage, SoporSchedule } from './api.mjs'
import { activeMessages, newMessages, warningText } from './messages.mjs'

const message = (over: Partial<SoporMessage> = {}): SoporMessage => ({
  id: 'nya-rutter-2026',
  title: 'Hämtrutterna läggs om',
  text: 'Schemat kan bli fel.',
  url: null,
  validFrom: '2026-11-17',
  validTo: '2027-03-31',
  ...over,
})

const schedule = (messages?: SoporMessage[]) =>
  ({ address: { source: 'avesta' }, events: [], fractions: {}, ...(messages ? { messages } : {}) }) as unknown as SoporSchedule

describe('activeMessages', () => {
  it('gäller från första till sista dagen, båda inklusive', () => {
    const s = schedule([message()])
    expect(activeMessages(s, '2026-11-17').map((m) => m.id)).toEqual(['nya-rutter-2026'])
    expect(activeMessages(s, '2027-03-31').map((m) => m.id)).toEqual(['nya-rutter-2026'])
    expect(activeMessages(s, '2026-11-16')).toEqual([])
    expect(activeMessages(s, '2027-04-01')).toEqual([])
  })

  it('ger en tom lista för ett svar utan meddelanden', () => {
    expect(activeMessages(schedule(), '2026-11-17')).toEqual([])
  })
})

describe('newMessages', () => {
  it('ger bara meddelanden som enheten inte redan sett, med källan i nyckeln', () => {
    const s = schedule([message(), message({ id: 'annat' })])
    const result = newMessages(s, '2026-11-20', ['avesta/nya-rutter-2026'])
    expect(result.fresh.map((m) => m.id)).toEqual(['annat'])
    expect(result.seen).toEqual(['avesta/nya-rutter-2026', 'avesta/annat'])
  })

  it('räknar inte ett kommande meddelande som sett', () => {
    const result = newMessages(schedule([message()]), '2026-11-01', [])
    expect(result.fresh).toEqual([])
    expect(result.seen).toEqual([])
  })
})

describe('warningText', () => {
  it('sätter rubrik och text ihop, ett meddelande per rad', () => {
    expect(warningText([message(), message({ id: 'b', title: 'B', text: 'Text B.' })])).toBe(
      'Hämtrutterna läggs om: Schemat kan bli fel.\nB: Text B.',
    )
  })

  it('ger null utan meddelanden', () => {
    expect(warningText([])).toBeNull()
  })
})
