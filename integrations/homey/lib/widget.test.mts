import { describe, expect, it } from 'vitest'
import type { SoporSchedule } from './api.mjs'
import { widgetRows } from './widget.mjs'

const schedule = {
  events: [
    { date: '2026-10-30', fractions: ['rest'], estimated: false, deviation: null, warning: null },
    { date: '2026-11-01', fractions: ['mat', 'plast'], estimated: false, deviation: null, warning: null },
    { date: '2026-11-04', fractions: ['rest', 'mat'], estimated: true, deviation: null, warning: null },
  ],
  fractions: {
    rest: { name: 'Restavfall', short: 'Rest', color: '#474C48', icon: 'trash-2' },
    mat: { name: 'Matavfall', short: 'Mat', color: '#7A4A1E', icon: 'apple' },
    plast: { name: 'Plastförpackningar', short: 'Plast', color: '#A8431F', icon: 'cup-soda' },
  },
} as unknown as SoporSchedule

describe('widgetens rader', () => {
  it('ger nästa hämtning per fraktion, tidigast först', () => {
    expect(widgetRows(schedule, '2026-10-31')).toEqual([
      { fraction: 'mat', name: 'Matavfall', icon: 'apple', color: '#7A4A1E', date: 'sön 1 nov', when: 'i morgon', soon: true, estimated: false },
      { fraction: 'plast', name: 'Plastförpackningar', icon: 'cup-soda', color: '#A8431F', date: 'sön 1 nov', when: 'i morgon', soon: true, estimated: false },
      { fraction: 'rest', name: 'Restavfall', icon: 'trash-2', color: '#474C48', date: 'ons 4 nov', when: 'om 4 dagar', soon: false, estimated: true },
    ])
  })

  it('klarar fraktioner som saknas i registret', () => {
    const odd = { ...schedule, events: [{ date: '2026-11-02', fractions: ['kompost'], estimated: false, deviation: null, warning: null }] }
    expect(widgetRows(odd, '2026-10-31')[0]).toMatchObject({ fraction: 'kompost', name: 'kompost', icon: null, color: null })
  })
})
