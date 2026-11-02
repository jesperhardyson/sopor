import { describe, expect, it, vi } from 'vitest'
import type { SourceResult } from './source-checks'
import { applyIssues, ensureLabels, listOpenIssues, parseMarker, planIssues, type OpenIssue } from './source-issues'

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

  it('säger varför när källan bara fungerar via sajten', () => {
    const ok = lidkoping({ state: 'fungerar', via: 'sajten', unknownWasteTypes: undefined })
    expect(planIssues([ok], [issue(12, 'lidkoping', 'svarar-inte')], today)).toEqual([
      { type: 'close', number: 12, body: 'Fungerar 2026-11-09 via sajten. Källan stänger ute GitHubs servrar, så bevakningen frågar sajten i stället.' },
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

  it.each(['nytt-format', 'tom', 'inga-tomningar'])('låter ett öppet %s-ärende vara när källan bara inte svarar', (kind) => {
    const actions = planIssues([lidkoping()], [issue(14, 'lidkoping', kind)], today)
    expect(actions.filter((a) => a.type !== 'open' && a.number === 14)).toEqual([])
    expect(actions).toMatchObject([{ type: 'open', title: 'Källa: Lidköpings kommun svarar inte' }])
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

describe('GitHub-anropen', () => {
  const api = 'https://api.github.com/repos/jesperhardyson/sopor'

  function fakeGitHub(respond: (method: string, url: string) => Response = () => Response.json({})) {
    const calls: { method: string; url: string; body?: unknown; headers: Headers }[] = []
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const url = String(input)
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) })
      return respond(method, url)
    }) as unknown as typeof fetch
    return { calls, gh: { repo: 'jesperhardyson/sopor', token: 'hemlig', fetchFn } }
  }

  it('hämtar alla öppna ärenden, utan pull requests, så att markeringen räcker även om etiketten tas bort', async () => {
    const { calls, gh } = fakeGitHub(() =>
      Response.json([
        { number: 1, body: 'a' },
        { number: 2, body: null },
        { number: 3, body: 'pr', pull_request: {} },
      ]),
    )
    expect(await listOpenIssues(gh)).toEqual([
      { number: 1, body: 'a' },
      { number: 2, body: '' },
    ])
    expect(calls[0].url).toBe(`${api}/issues?state=open&per_page=100&page=1`)
    expect(calls[0].headers.get('Authorization')).toBe('Bearer hemlig')
    expect(calls[0].headers.get('Accept')).toBe('application/vnd.github+json')
  })

  it('hämtar nästa sida så länge sidan är full', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ number: i + 1, body: '' }))
    const { calls, gh } = fakeGitHub((_, url) => Response.json(url.endsWith('page=1') ? full : [{ number: 101, body: '' }]))
    expect(await listOpenIssues(gh)).toHaveLength(101)
    expect(calls.map((c) => c.url.split('&').at(-1))).toEqual(['page=1', 'page=2'])
  })

  it('skapar bara etiketter som saknas', async () => {
    const { calls, gh } = fakeGitHub((method, url) =>
      method === 'GET' && url.endsWith('/labels/avfallstyp') ? new Response('', { status: 404 }) : Response.json({}),
    )
    await ensureLabels(gh)
    expect(calls.filter((c) => c.method === 'POST')).toMatchObject([{ url: `${api}/labels`, body: { name: 'avfallstyp' } }])
  })

  it('öppnar, kommenterar och stänger', async () => {
    const { calls, gh } = fakeGitHub()
    await applyIssues(gh, [
      { type: 'open', title: 'T', body: 'B', labels: ['källa'] },
      { type: 'comment', number: 5, body: 'K' },
      { type: 'close', number: 6, body: 'S' },
    ])
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['POST', `${api}/issues`, { title: 'T', body: 'B', labels: ['källa'] }],
      ['POST', `${api}/issues/5/comments`, { body: 'K' }],
      ['POST', `${api}/issues/6/comments`, { body: 'S' }],
      ['PATCH', `${api}/issues/6`, { state: 'closed', state_reason: 'completed' }],
    ])
  })

  it('kastar ett fel med status och sökväg när GitHub säger nej', async () => {
    const { gh } = fakeGitHub(() => new Response('nej', { status: 403 }))
    await expect(applyIssues(gh, [{ type: 'comment', number: 5, body: 'K' }])).rejects.toThrow('403 POST /repos/jesperhardyson/sopor/issues/5/comments')
  })
})
