import { describe, expect, it } from 'vitest'
import type { SoporSchedule } from './api.mjs'
import { binDaysToNext, binFractions, binId, iconPath, binNextText, binSchedule, putOutDate, shouldReset, suggestedIcon, suggestedName } from './bin.mjs'

const fraction = (name: string, short: string) => ({ name, short, color: '#000000', icon: 'trash-2' })

const schedule: SoporSchedule = {
  apiVersion: '1',
  today: '2026-11-01',
  address: { id: 'storgatan-2_uppsala-1', street: 'Storgatan 2', locality: 'Uppsala', kommun: 'Uppsala kommun', source: 'uppsala', detail: null },
  events: [
    { date: '2026-11-02', fractions: ['plast', 'metall'], estimated: false, deviation: null, warning: null },
    { date: '2026-11-04', fractions: ['rest', 'mat'], estimated: false, deviation: null, warning: null },
    { date: '2026-11-11', fractions: ['mat'], estimated: true, deviation: null, warning: null },
  ],
  fractions: {
    rest: fraction('Restavfall', 'Rest'),
    mat: fraction('Matavfall', 'Mat'),
    plast: fraction('Plastförpackningar', 'Plast'),
    metall: fraction('Metall', 'Metall'),
  },
  links: { ics: 'https://sopor.hardyson.se/ics/x.ics', web: 'https://sopor.hardyson.se/x' },
}

const today = '2026-11-01'

describe('kärlets avfallstyper', () => {
  it('tar de ikryssade kända typerna och de okända från parningen', () => {
    const settings = { ingar_mat: true, ingar_rest: false, ingar_plast: true }
    expect(binFractions(settings, ['rest', 'kompost'])).toEqual(['mat', 'plast', 'kompost'])
  })

  it('är tom när inget är valt', () => {
    expect(binFractions({}, [])).toEqual([])
  })
})

describe('kärlets schema', () => {
  it('har bara kärlets avfallstyper', () => {
    const bin = binSchedule(schedule, ['mat'])
    expect(bin.events.map((e) => e.date)).toEqual(['2026-11-04', '2026-11-11'])
    expect(bin.events[0].fractions).toEqual(['mat'])
  })

  it('töms när någon av flera avfallstyper hämtas', () => {
    const bin = binSchedule(schedule, ['rest', 'metall'])
    expect(bin.events.map((e) => e.date)).toEqual(['2026-11-02', '2026-11-04'])
  })

  it('visar nästa tömning och dagar kvar', () => {
    const bin = binSchedule(schedule, ['mat'])
    expect(binNextText(bin, today)).toBe('om 3 dagar, ons 4 nov')
    expect(binNextText(bin, today, 'en')).toBe('in 3 days, Wed 4 Nov')
    expect(binDaysToNext(bin, today)).toBe(3)
  })

  it('säger när inget väntar', () => {
    const bin = binSchedule(schedule, ['glas'])
    expect(binNextText(bin, today)).toBe('Inga kommande hämtningar')
    expect(binDaysToNext(bin, today)).toBeNull()
  })
})

describe('utställt', () => {
  it('gäller nästa tömning', () => {
    expect(putOutDate(binSchedule(schedule, ['mat']), today)).toBe('2026-11-04')
  })

  it('gäller tömningen i dag på tömningsdagen', () => {
    expect(putOutDate(binSchedule(schedule, ['mat']), '2026-11-04')).toBe('2026-11-04')
  })

  it('gäller i dag när inget väntar', () => {
    expect(putOutDate(binSchedule(schedule, ['glas']), today)).toBe(today)
  })

  it('återställs dagen efter tömningen, inte samma dag', () => {
    expect(shouldReset('2026-11-04', '2026-11-04')).toBe(false)
    expect(shouldReset('2026-11-04', '2026-11-05')).toBe(true)
    expect(shouldReset(null, '2026-11-05')).toBe(false)
  })
})

describe('förslag vid parningen', () => {
  it('namnger kärlet efter avfallstyperna i schemats ordning', () => {
    expect(suggestedName(schedule, ['mat'])).toBe('Mat')
    expect(suggestedName(schedule, ['metall', 'plast'])).toBe('Plast & metall')
    expect(suggestedName(schedule, [])).toBe('')
  })

  it('väljer ikon efter avfallstyperna', () => {
    expect(suggestedIcon(['mat'])).toBe('mat')
    expect(suggestedIcon(['tidningar'])).toBe('tidningar')
    expect(suggestedIcon(['rest', 'mat'])).toBe('flerfack')
    expect(suggestedIcon(['karl'])).toBe('flerfack')
    expect(suggestedIcon(['kompost'])).toBe('standard')
    expect(suggestedIcon([])).toBe('standard')
  })

  it('ger ikonens sökväg, och ingen för standard eller okänt', () => {
    expect(iconPath('mat')).toBe('/icons/mat.svg')
    expect(iconPath('flerfack')).toBe('/icons/flerfack.svg')
    expect(iconPath('standard')).toBeUndefined()
    expect(iconPath('../x')).toBeUndefined()
  })

  it('ger kärlet ett id under adressen', () => {
    expect(binId('uppsala/storgatan-2_uppsala-1', 'a1b2c3d4')).toBe('uppsala/storgatan-2_uppsala-1/a1b2c3d4')
  })
})
