// Ärenden för bevakningen av källorna: vilka som ska öppnas, kommenteras och stängas.
// Bevakningen känner igen sina egna ärenden på en dold markering och rör aldrig andra.

import { USER_AGENT } from '../src/server/http.js'
import type { SourceResult, SourceState } from './source-checks.js'

export interface OpenIssue {
  number: number
  body: string
}

export type IssueAction =
  | { type: 'open'; title: string; body: string; labels: string[] }
  | { type: 'comment'; number: number; body: string }
  | { type: 'close'; number: number; body: string }

const WASTE_TYPES = 'okanda-avfallstyper'
const MARKER = /<!-- sopor-bevakning: (\S+) (\S+) -->/

const TITLES: Record<Exclude<SourceState, 'fungerar'> | typeof WASTE_TYPES, string> = {
  'svarar-inte': 'svarar inte',
  'nytt-format': 'har nytt format',
  tom: 'ger inga adresser',
  'inga-tomningar': 'har inga tömningar framåt',
  'schemat-tar-slut': ': schemat tar slut',
  [WASTE_TYPES]: 'har okända avfallstyper',
}

/** "<!-- sopor-bevakning: lidkoping svarar-inte -->" → { sourceId, kind } */
export function parseMarker(body: string): { sourceId: string; kind: string } | null {
  const m = body.match(MARKER)
  return m ? { sourceId: m[1], kind: m[2] } : null
}

const marker = (sourceId: string, kind: string) => `<!-- sopor-bevakning: ${sourceId} ${kind} -->`

function title(r: SourceResult, kind: keyof typeof TITLES): string {
  const what = TITLES[kind]
  return `Källa: ${r.name}${what.startsWith(':') ? what : ` ${what}`}`
}

function openBody(r: SourceResult, kind: string, today: string): string {
  const lines = [
    `Bevakningen av källorna hittade ett problem ${today}.`,
    '',
    `- **Källa:** ${r.name} (\`${r.sourceId}\`)`,
    ...(r.baseUrl ? [`- **baseUrl:** ${r.baseUrl}`] : []),
    ...(r.probe ? [`- **Kontrolladress:** ${r.probe}`] : []),
    ...(r.error ? [`- **Fel:** ${r.error}`] : []),
    ...(kind === WASTE_TYPES ? [`- **Okända avfallstyper:** ${r.unknownWasteTypes!.join(', ')}`] : []),
  ]
  if (r.baseUrl && r.probe) lines.push('', 'Prova själv:', '', '```bash', `npm run check:source -- ${r.baseUrl} "${r.probe}"`, '```')
  if (kind === WASTE_TYPES) lines.push('', 'Lägg till vanliga fraktioner i `src/server/fractions-map.ts`.')
  lines.push('', 'Ärendet stängs av sig självt när källan fungerar igen.', '', marker(r.sourceId, kind))
  return lines.join('\n')
}

export function planIssues(results: SourceResult[], open: OpenIssue[], today: string): IssueAction[] {
  const bySource = new Map(results.map((r) => [r.sourceId, r]))
  const problems = (r: SourceResult): string[] => [
    ...(r.state === 'fungerar' ? [] : [r.state]),
    ...(r.unknownWasteTypes?.length ? [WASTE_TYPES] : []),
  ]

  const actions: IssueAction[] = []
  const covered = new Set<string>()
  for (const issue of open) {
    const m = parseMarker(issue.body)
    if (!m) continue
    const r = bySource.get(m.sourceId)
    if (!r) {
      actions.push({ type: 'close', number: issue.number, body: 'Källan kontrolleras inte längre.' })
      continue
    }
    // Hämtades inte schemat går det inte att säga något om avfallstyperna den här veckan.
    if (m.kind === WASTE_TYPES && r.unknownWasteTypes === undefined) continue
    if (problems(r).includes(m.kind)) {
      covered.add(`${m.sourceId} ${m.kind}`)
      const detail = m.kind === WASTE_TYPES ? r.unknownWasteTypes!.join(', ') : r.error ?? m.kind
      actions.push({ type: 'comment', number: issue.number, body: `Fortfarande: ${detail} (${today})` })
    } else if (m.kind === WASTE_TYPES) {
      actions.push({ type: 'close', number: issue.number, body: `Inga okända avfallstyper längre (${today}).` })
    } else {
      const body = r.state === 'fungerar' ? `Fungerar igen ${today}.` : `Nytt läge: ${r.state} (${today}).`
      actions.push({ type: 'close', number: issue.number, body })
    }
  }

  for (const r of results) {
    for (const kind of problems(r)) {
      if (covered.has(`${r.sourceId} ${kind}`)) continue
      const labels = kind === WASTE_TYPES ? ['källa', 'avfallstyp'] : ['källa']
      actions.push({ type: 'open', title: title(r, kind as keyof typeof TITLES), body: openBody(r, kind, today), labels })
    }
  }
  return actions
}

export interface GitHub {
  /** "ägare/repo", som GITHUB_REPOSITORY */
  repo: string
  token: string
  fetchFn?: typeof fetch
}

const LABELS = [
  { name: 'källa', color: 'D93F0B', description: 'Bevakningen av källorna hittade ett problem' },
  { name: 'avfallstyp', color: 'FBCA04', description: 'Okänd avfallstyp från en källa (lägre prioritet)' },
]

async function github(gh: GitHub, method: string, pathname: string, body?: unknown): Promise<Response> {
  const res = await (gh.fetchFn ?? fetch)(`https://api.github.com/repos/${gh.repo}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${gh.token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return res
}

async function ok(res: Promise<Response>, method: string, pathname: string, gh: GitHub): Promise<Response> {
  const r = await res
  if (!r.ok) throw new Error(`GitHub svarade ${r.status} ${method} /repos/${gh.repo}${pathname}`)
  return r
}

const call = (gh: GitHub, method: string, pathname: string, body?: unknown) =>
  ok(github(gh, method, pathname, body), method, pathname, gh)

export async function listOpenIssues(gh: GitHub): Promise<OpenIssue[]> {
  const res = await call(gh, 'GET', `/issues?state=open&labels=${encodeURIComponent('källa')}&per_page=100`)
  const issues = (await res.json()) as { number: number; body: string | null; pull_request?: unknown }[]
  return issues.filter((i) => !i.pull_request).map((i) => ({ number: i.number, body: i.body ?? '' }))
}

export async function ensureLabels(gh: GitHub): Promise<void> {
  for (const label of LABELS) {
    const res = await github(gh, 'GET', `/labels/${encodeURIComponent(label.name)}`)
    if (res.status === 404) await call(gh, 'POST', '/labels', label)
  }
}

export async function applyIssues(gh: GitHub, actions: IssueAction[]): Promise<void> {
  for (const a of actions) {
    if (a.type === 'open') await call(gh, 'POST', '/issues', { title: a.title, body: a.body, labels: a.labels })
    else await call(gh, 'POST', `/issues/${a.number}/comments`, { body: a.body })
    if (a.type === 'close') await call(gh, 'PATCH', `/issues/${a.number}`, { state: 'closed', state_reason: 'completed' })
  }
}
