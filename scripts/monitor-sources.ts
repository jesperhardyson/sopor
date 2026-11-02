// Bevakning av källorna: kontrollerar varje källa på sajten och gör problem till GitHub-ärenden.
// Körs varje måndag av .github/workflows/sources.yml, eller för hand: `npm run monitor:sources`.
// Se docs/specs/2026-11-02-bevakning-av-kallor.md.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { todayInStockholm } from '../src/domain/dates.js'
import { SOURCES, type Source } from '../src/sources/index.js'
import { readYears } from './build-data.js'
import { checkEdpSource, checkStaticSource, checkViaSite, unreachableFromHere, type SourceResult } from './source-checks.js'
import { applyIssues, ensureLabels, listOpenIssues, planIssues } from './source-issues.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * En känd adress per live-källa, som söks och vars schema hämtas. Välj en vanlig adress ur
 * `npm run check:source` när en källa läggs till (ett test kräver att alla har en).
 */
export const PROBES: Record<string, string> = {
  uppsala: 'Storgatan 2, Uppsala',
  orebro: 'Storgatan 3, Örebro',
  vafab: 'Skolgatan 8, Västerås',
  june: 'Storgatan 1, Habo',
  boras: 'Storgatan 1, Dalsjöfors',
  lund: 'Kyrkogatan 2, S SANDBY',
  nacka: 'Järnvägsgatan 7, Nacka',
  gotland: 'Storgatan 1, Hemse',
  skelleftea: 'Storgatan, Byske',
  ssam: 'Storgatan, Ryssby',
  'kretslopp-sydost': 'Storgatan, Vetlanda',
  varberg: 'Storgatan 3, TRÄSLÖVSLÄGE',
  falkenberg: 'Storgatan 1, FALKENBERG',
  partille: 'Kyrkogatan 1, Jonsered',
  kungalv: 'Kyrkogatan 1, MARSTRAND',
  boden: 'Drottninggatan 1, Boden',
  danderyd: 'Skolvägen 1, Enebyberg',
  lycksele: 'SKOLGATAN 13, LYCKSELE',
  kiruna: 'Kyrkogatan 1, Vittangi',
  lidkoping: 'STORGATAN 2',
  orust: 'SKOLVÄGEN 1, HENÅN',
  ljungby: 'Storgatan 1, Ryssby',
  mark: 'Kyrkogatan 2, KINNA',
  'herrljunga-vargarda': 'Storgatan 5, Herrljunga',
}

const RETRY_DELAY_MS = 5 * 60 * 1000

const readValidToFromData = (sourceId: string) =>
  readYears(path.join(root, 'data', sourceId)).map((y) => y.schedules.validTo)

async function checkOne(
  source: Source,
  today: string,
  probes: Record<string, string>,
  fetchFn: typeof fetch,
  readValidTo: (id: string) => string[],
): Promise<SourceResult> {
  if (source.config.system !== 'edp') return checkStaticSource(source, readValidTo(source.id), today)
  const direct = await checkEdpSource(source, probes[source.id], today, fetchFn)
  if (!unreachableFromHere(direct)) return direct
  // Fungerar källan från sajten är det bara GitHub som stängs ute, och det är inget att larma om.
  const site = await checkViaSite(source, probes[source.id], today, fetchFn)
  if (site.state === 'fungerar') return { ...direct, ...site, error: direct.error }
  return { ...direct, error: `${direct.error}. Via sajten: ${site.error ?? site.state}` }
}

/**
 * Kontrollerar källorna en i taget, så att ingen värd får flera anrop samtidigt. En källa som inte
 * nås härifrån kontrolleras också via sajten. Källor som inte svarade prövas igen efter en stund,
 * så att ett tillfälligt avbrott inte blir ett ärende.
 */
export async function runChecks(
  sources: Source[],
  today: string,
  {
    fetchFn = fetch,
    retryDelayMs = RETRY_DELAY_MS,
    readValidTo = readValidToFromData,
    probes = PROBES,
  }: { fetchFn?: typeof fetch; retryDelayMs?: number; readValidTo?: (sourceId: string) => string[]; probes?: Record<string, string> } = {},
): Promise<SourceResult[]> {
  const results: SourceResult[] = []
  for (const source of sources) results.push(await checkOne(source, today, probes, fetchFn, readValidTo))

  const retry = results.flatMap((r, i) => (r.state === 'svarar-inte' ? [i] : []))
  if (retry.length === 0) return results
  await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
  for (const i of retry) results[i] = await checkOne(sources[i], today, probes, fetchFn, readValidTo)
  return results
}

/** En Markdown-tabell för jobbets logg och sammanfattning. */
export function formatTable(results: SourceResult[]): string {
  const cell = (text = '') => text.replace(/\|/g, '\\|')
  return [
    '| Källa | Läge | Fel | Okända avfallstyper |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${cell(r.name)} | ${r.state}${r.via ? ` via ${r.via}` : ''} | ${cell(r.error)} | ${cell(r.unknownWasteTypes?.join(', '))} |`),
  ].join('\n')
}

async function main() {
  const retry = process.env.RETRY
  const results = await runChecks(SOURCES, todayInStockholm(), retry ? { retryDelayMs: Number(retry) } : {})
  const table = formatTable(results)
  console.log(table)
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Bevakning av källorna\n\n${table}\n`)

  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env
  if (!token || !repo) {
    // Lokalt: visa vad som skulle hända, utan att röra GitHub.
    const actions = planIssues(results, [], todayInStockholm())
    for (const a of actions) console.log(a.type === 'open' ? `Skulle öppna: ${a.title}` : `Skulle ${a.type}: #${a.number}`)
    return
  }
  const gh = { repo, token }
  await ensureLabels(gh)
  const actions = planIssues(results, await listOpenIssues(gh), todayInStockholm())
  await applyIssues(gh, actions)
  console.log(`Ärenden: ${actions.length} åtgärder`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`monitor-sources: ${error.message}`)
    process.exit(1)
  })
}
