import { describe, expect, it } from 'vitest'
import type { SourceResult } from './source-checks'
import { parseMarker, planIssues, type OpenIssue } from './source-issues'

const today = '2026-11-09'
const lidkoping = (over: Partial<SourceResult> = {}): SourceResult => ({
  sourceId: 'lidkoping',
  name: 'Lidköpings kommun',
  state: 'svarar-inte',
  baseUrl: 'https://futureweb.lidkoping.se/FutureWebBasic',
  probe: 'STORGATAN 2',
  error: 'futureweb.lidkoping.se svarade 502',
  ...over,
})
const issue = (number: number, sourceId: string, kind: string): OpenIssue => ({
  number,
  body: `Text\n\n<!-- sopor-bevakning: ${sourceId} ${kind} -->`,
})

describe('parseMarker', () => {
  it('läser källa och läge ur markeringen', () => {
    expect(parseMarker('x\n<!-- sopor-bevakning: lidkoping svarar-inte -->')).toEqual({ sourceId: 'lidkoping', kind: 'svarar-inte' })
  })

  it('ger null utan markering', () => {
    expect(parseMarker('Schemat stämmer inte för min adress')).toBeNull()
  })
})

describe('planIssues', () => {
  it('öppnar ett ärende för ett nytt problem, med allt som behövs för att prova själv', () => {
    const [action] = planIssues([lidkoping()], [], today)
    expect(action).toMatchObject({ type: 'open', title: 'Källa: Lidköpings kommun svarar inte', labels: ['källa'] })
    const body = action.type === 'open' ? action.body : ''
    for (const part of [
      '<!-- sopor-bevakning: lidkoping svarar-inte -->',
      'https://futureweb.lidkoping.se/FutureWebBasic',
      'STORGATAN 2',
      'futureweb.lidkoping.se svarade 502',
      '2026-11-09',
      'npm run check:source -- https://futureweb.lidkoping.se/FutureWebBasic "STORGATAN 2"',
    ]) {
      expect(body).toContain(part)
    }
  })

  it.each([
    ['nytt-format', 'Källa: Lidköpings kommun har nytt format'],
    ['tom', 'Källa: Lidköpings kommun ger inga adresser'],
    ['inga-tomningar', 'Källa: Lidköpings kommun har inga tömningar framåt'],
    ['schemat-tar-slut', 'Källa: Lidköpings kommun: schemat tar slut'],
  ] as const)('ger titeln för %s', (state, title) => {
    expect(planIssues([lidkoping({ state })], [], today)[0]).toMatchObject({ type: 'open', title })
  })

  it('öppnar ett ärende med lägre prioritet för okända avfallstyper', () => {
    const [action] = planIssues([lidkoping({ state: 'fungerar', error: undefined, unknownWasteTypes: ['Trädgårdsavfall'] })], [], today)
    expect(action).toMatchObject({
      type: 'open',
      title: 'Källa: Lidköpings kommun har okända avfallstyper',
      labels: ['källa', 'avfallstyp'],
    })
    expect(action.type === 'open' && action.body).toContain('Trädgårdsavfall')
    expect(action.type === 'open' && action.body).toContain('<!-- sopor-bevakning: lidkoping okanda-avfallstyper -->')
  })

  it('kommenterar ett öppet ärende i stället för att öppna ett nytt', () => {
    expect(planIssues([lidkoping()], [issue(12, 'lidkoping', 'svarar-inte')], today)).toEqual([
      { type: 'comment', number: 12, body: 'Fortfarande: futureweb.lidkoping.se svarade 502 (2026-11-09)' },
    ])
  })

  it('stänger ärendet när källan fungerar igen', () => {
    const ok = lidkoping({ state: 'fungerar', error: undefined, unknownWasteTypes: [] })
    expect(planIssues([ok], [issue(12, 'lidkoping', 'svarar-inte')], today)).toEqual([
      { type: 'close', number: 12, body: 'Fungerar igen 2026-11-09.' },
    ])
  })

  it('stänger det gamla och öppnar ett nytt när läget byts', () => {
    const actions = planIssues([lidkoping({ state: 'nytt-format' })], [issue(12, 'lidkoping', 'svarar-inte')], today)
    expect(actions.map((a) => a.type)).toEqual(['close', 'open'])
    expect(actions[0]).toMatchObject({ number: 12 })
  })

  it('rör inte ärenden utan markering', () => {
    const ok = lidkoping({ state: 'fungerar', error: undefined, unknownWasteTypes: [] })
    expect(planIssues([ok], [{ number: 7, body: 'Fel datum för Storgatan 2' }], today)).toEqual([])
  })

  it('rör inte ärendet om avfallstyper när schemat inte gick att hämta', () => {
    const actions = planIssues([lidkoping()], [issue(12, 'lidkoping', 'svarar-inte'), issue(13, 'lidkoping', 'okanda-avfallstyper')], today)
    expect(actions.filter((a) => a.type !== 'open' && a.number === 13)).toEqual([])
  })

  it('stänger ärenden för källor som inte kontrolleras längre', () => {
    expect(planIssues([], [issue(20, 'avesta', 'svarar-inte')], today)).toEqual([
      { type: 'close', number: 20, body: 'Källan kontrolleras inte längre.' },
    ])
  })
})
