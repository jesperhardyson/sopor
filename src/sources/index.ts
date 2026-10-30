/** En kommun enligt SCB:s kommunkod. */
export interface Kommun {
  code: string
  name: string
}

/** Hur källans data hämtas. Ny leverantör = ny variant här + ny provider. */
export type SourceConfig = { system: 'static' } | { system: 'edp'; baseUrl: string }

/**
 * En datakälla för hämtschema, oftast ett avfallsbolag eller en kommun. En källa kan täcka
 * flera kommuner. `id` används i URL:er (/avesta/<adress>) och får aldrig ändras.
 */
export interface Source {
  id: string
  name: string
  url: string
  kommuner: Kommun[]
  config: SourceConfig
  /** Påhittad data (seed). Visar en varningsbanderoll på hela sajten. Ta bort när riktig data finns. */
  testData?: boolean
}

export const SOURCES: Source[] = [
  {
    id: 'avesta',
    name: 'Avesta Vatten och Avfall',
    url: 'https://www.avestavatten.se',
    kommuner: [{ code: '2084', name: 'Avesta kommun' }],
    config: { system: 'static' },
    testData: true,
  },
]

export function getSource(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id)
}

/** Alla kommuner som någon källa täcker, sorterade efter namn. */
export function supportedKommuner(): Kommun[] {
  const byCode = new Map(SOURCES.flatMap((s) => s.kommuner).map((k) => [k.code, k]))
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'))
}

/** "Avesta kommun" för en källa med en kommun, annars källans namn. */
export function sourceLabel(source: Source): string {
  return source.kommuner.length === 1 ? source.kommuner[0].name : source.name
}

/**
 * Kommunen för en adress hos källan. Källor med en kommun ger den direkt. För källor med flera
 * kommuner slås orten upp i gatuindexets ort→kommun-tabell (se scripts/build-street-index.ts).
 */
export function kommunForLocality(source: Source, locality: string, places: Record<string, string> = {}): string {
  if (source.kommuner.length === 1) return source.kommuner[0].name
  return places[locality.toLowerCase()] ?? source.name
}

