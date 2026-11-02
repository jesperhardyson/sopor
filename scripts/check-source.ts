// Provar om en värd har EDP Futures publika modul SimpleWastePickup, med samma kod som sajten.
// `npm run check:source -- <värd eller adress> "Storgatan 1" [--ort Varberg]`
// Bara publika anrop: en sökning per sökväg tills en ger adresser, sedan ett schema.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FractionId } from '../src/domain/types.js'
import { edpSchedule, edpSearch, type EdpBuilding } from '../src/server/edp.js'
import { mapWasteType } from '../src/server/fractions-map.js'
import { ALL_SOURCES } from '../src/sources/index.js'

const TIMEOUT_MS = 10000

/** Sökvägarna som källorna i registret använder. Udda namn (FutureWebVKFHus) går att ange direkt. */
const PATHS = ['FutureWeb', 'FutureWebBasic', 'EDPFutureWeb', 'EDP/FutureWebBasic']
const ORT_PATHS = (ort: string) => [`${ort}/FutureWeb`, `${ort}/EDPFutureWeb`, `FutureWeb${ort}`, `FutureWeb${ort}Basic`]

/** "futureweb.x.se" eller "https://futureweb.x.se/Ort/FutureWeb" → baseUrl:er att prova, i ordning. */
export function candidateBaseUrls(target: string, ort?: string): string[] {
  const url = new URL(/^https?:\/\//.test(target) ? target : `https://${target}`)
  const given = url.pathname.replace(/\/+$/, '')
  if (given) return [`${url.origin}${given}`]
  return [...(ort ? ORT_PATHS(ort) : []), ...PATHS].map((p) => `${url.origin}/${p}`)
}

export interface Attempt {
  baseUrl: string
  ms: number
  buildings?: number
  error?: string
}

export interface WasteTypeRow {
  wasteType: string
  fractions: FractionId[]
  label?: string
  /** okänd = blir `karl` med källans egen text */
  status: 'känd' | 'okänd' | 'hoppas över'
}

interface RawService {
  WasteType?: string
  WastePickupFrequency?: string | null
  Description?: string | null
}

export function classifyWasteTypes(services: RawService[]): WasteTypeRow[] {
  return services.map((s) => {
    const wasteType = (s.WasteType ?? '').trim()
    const mapped = mapWasteType(wasteType, s.WastePickupFrequency ?? '', s.Description ?? '')
    if (!mapped) return { wasteType, fractions: [], status: 'hoppas över' }
    const unknown = mapped.fractions.includes('karl') && !mapped.label?.startsWith('Fyrfackskärl')
    return { wasteType, fractions: mapped.fractions, label: mapped.label, status: unknown ? 'okänd' : 'känd' }
  })
}

export interface Report {
  target: string
  query: string
  tried: Attempt[]
  baseUrl?: string
  /** Sökvägar som svarade med JSON men utan adresser */
  emptyBaseUrls: string[]
  addresses: EdpBuilding[]
  existingSource?: string
  schedule?: { address: string; ms: number; events: number; wasteTypes: WasteTypeRow[]; error?: string }
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; ms: number; error?: string }> {
  const start = performance.now()
  try {
    const value = await fn()
    return { value, ms: Math.round(performance.now() - start) }
  } catch (error) {
    return { ms: Math.round(performance.now() - start), error: (error as Error).message }
  }
}

export async function checkSource(
  target: string,
  query: string,
  { ort, fetchFn = fetch }: { ort?: string; fetchFn?: typeof fetch } = {},
): Promise<Report> {
  const report: Report = { target, query, tried: [], emptyBaseUrls: [], addresses: [] }

  for (const baseUrl of candidateBaseUrls(target, ort)) {
    const { value, ms, error } = await timed(() => edpSearch(baseUrl, query, fetchFn, TIMEOUT_MS))
    report.tried.push({ baseUrl, ms, error, buildings: value?.length })
    if (value?.length) {
      report.baseUrl = baseUrl
      report.addresses = value
      break
    }
    if (value) report.emptyBaseUrls.push(baseUrl)
  }
  if (!report.baseUrl) return report

  const lower = report.baseUrl.toLowerCase()
  report.existingSource = ALL_SOURCES.find((s) => s.config.system === 'edp' && s.config.baseUrl.toLowerCase() === lower)?.id

  // Rådatan fångas på vägen, så att avfallstyperna syns som källan skrev dem.
  let services: RawService[] = []
  const spy: typeof fetch = async (input, init) => {
    const res = await fetchFn(input, init)
    services = ((await res.clone().json().catch(() => null)) as { RhServices?: RawService[] } | null)?.RhServices ?? []
    return res
  }
  const address = report.addresses[0].raw
  const { value, ms, error } = await timed(() => edpSchedule(report.baseUrl!, address, spy, new Date(), TIMEOUT_MS))
  report.schedule = { address, ms, error, events: value?.events.length ?? 0, wasteTypes: classifyWasteTypes(services) }
  return report
}

export function formatReport(r: Report): string {
  const lines = [`Söker "${r.query}" på ${r.target}`, '']
  for (const t of r.tried) {
    const result = t.error ?? (t.buildings ? `${t.buildings} adresser` : 'svarar, men inga adresser')
    lines.push(`  ${t.baseUrl}  ${result}  (${t.ms} ms)`)
  }
  lines.push('')

  if (!r.baseUrl) {
    if (r.emptyBaseUrls.length > 0) {
      lines.push(`EDP-tjänsten svarar men gav inga adresser (${r.emptyBaseUrls.join(', ')}).`)
      lines.push('Prova en annan gata. Är den tom för flera gator saknar kommunen data i tjänsten.')
    } else {
      lines.push('Ingen EDP-tjänst hittades. Prova --ort <Ort> (som Uppsala: /Uppsala/FutureWeb), en annan värd eller hela adressen med sökväg.')
    }
    return lines.join('\n')
  }

  lines.push(`Fungerar: config: { system: 'edp', baseUrl: '${r.baseUrl}' }`)
  if (r.existingSource) lines.push(`Den här baseUrl:en finns redan i registret som '${r.existingSource}'.`)
  lines.push('', `Adresser (${r.addresses.length}):`)
  for (const a of r.addresses.slice(0, 10)) lines.push(`  ${a.raw}`)
  if (r.addresses.length > 10) lines.push(`  … och ${r.addresses.length - 10} till`)

  const s = r.schedule!
  lines.push('', `Schema för "${s.address}" (${s.ms} ms):`)
  if (s.error) return [...lines, `  Fel: ${s.error}`].join('\n')
  for (const w of s.wasteTypes) {
    const to = w.status === 'hoppas över' ? '(hoppas över)' : `→ ${w.fractions.join(', ')}${w.label ? ` "${w.label}"` : ''}`
    lines.push(`  ${w.wasteType.padEnd(28)} ${to}`)
  }
  lines.push(`  ${s.events} tömningsdagar framåt`)

  const unknown = s.wasteTypes.filter((w) => w.status === 'okänd')
  if (unknown.length > 0) {
    lines.push('', 'Okända avfallstyper som blir karl (lägg till i src/server/fractions-map.ts om de är vanliga fraktioner):')
    for (const w of unknown) lines.push(`  ${w.wasteType}`)
  }
  return lines.join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  const ortAt = args.indexOf('--ort')
  const ort = ortAt >= 0 ? args.splice(ortAt, 2)[1] : undefined
  const [target, query] = args
  if (!target || !query) {
    console.error('Användning: npm run check:source -- <värd eller adress> "Storgatan 1" [--ort Ort]')
    process.exit(2)
  }
  const report = await checkSource(target, query, { ort })
  console.log(formatReport(report))
  if (!report.baseUrl) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`check-source: ${error.message}`)
    process.exit(1)
  })
}
