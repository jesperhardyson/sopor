// Bevakning av källorna: kontrollerar varje källa på sajten och gör problem till GitHub-ärenden.
// Körs varje måndag av .github/workflows/sources.yml, eller för hand: `npm run monitor:sources`.
// Se docs/specs/2026-11-02-bevakning-av-kallor.md.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Source } from '../src/sources/index.js'
import { readYears } from './build-data.js'
import { checkEdpSource, checkStaticSource, type SourceResult } from './source-checks.js'

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
  lund: 'Kyrkogatan 1, LUND',
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

async function checkOne(source: Source, today: string, probes: Record<string, string>, fetchFn: typeof fetch, readValidTo: (id: string) => string[]) {
  return source.config.system === 'edp'
    ? checkEdpSource(source, probes[source.id], today, fetchFn)
    : checkStaticSource(source, readValidTo(source.id), today)
}

/**
 * Kontrollerar källorna en i taget, så att ingen värd får flera anrop samtidigt. Källor som inte
 * svarade prövas igen efter en stund, så att ett tillfälligt avbrott inte blir ett ärende.
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
    ...results.map((r) => `| ${cell(r.name)} | ${r.state} | ${cell(r.error)} | ${cell(r.unknownWasteTypes?.join(', '))} |`),
  ].join('\n')
}
