import { normalize } from '../domain/search.js'

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
  /**
   * Kommuner där källan har en del adresser utan att räknas som täckt där, t.ex. för att den
   * bara hämtar vissa fraktioner. Används bara för att slå upp ort → kommun.
   */
  grannkommuner?: Kommun[]
  config: SourceConfig
  /** Påhittad data (seed). Ta bort när riktig data finns. */
  testData?: boolean
  /** Visas inte på sajten: inte i sökning, på Om-sidan, i API:t eller i byggd data. Datan valideras ändå vid build. */
  hidden?: boolean
}

/** EDP-källorna kontrollerades live 2026-10-30 (SearchAdress gav träffar). Stenungsund svarade utan data. */
export const ALL_SOURCES: Source[] = [
  {
    id: 'avesta',
    name: 'Avesta Vatten och Avfall',
    url: 'https://www.avestavatten.se',
    kommuner: [{ code: '2084', name: 'Avesta kommun' }],
    config: { system: 'static' },
    testData: true,
    // Dold tills den riktiga trakt-tabellen har kommit, så att ingen får påhittade datum.
    hidden: true,
  },
  {
    id: 'uppsala',
    name: 'Uppsala Vatten',
    url: 'https://www.uppsalavatten.se',
    kommuner: [{ code: '0380', name: 'Uppsala kommun' }],
    config: { system: 'edp', baseUrl: 'https://futureweb.uppsalavatten.se/Uppsala/FutureWeb' },
  },
  {
    id: 'orebro',
    name: 'Örebro kommun',
    url: 'https://www.orebro.se',
    kommuner: [{ code: '1880', name: 'Örebro kommun' }],
    config: { system: 'edp', baseUrl: 'https://futureweb.orebro.se/FutureWeb' },
  },
  {
    id: 'vafab',
    name: 'Vafab Miljö',
    url: 'https://www.vafabmiljo.se',
    kommuner: [{ code: '1980', name: 'Västerås kommun' }, { code: '0381', name: 'Enköpings kommun' }, { code: '0331', name: 'Heby kommun' }, { code: '1981', name: 'Sala kommun' }, { code: '1982', name: 'Fagersta kommun' }, { code: '1983', name: 'Köpings kommun' }, { code: '1984', name: 'Arboga kommun' }, { code: '1960', name: 'Kungsörs kommun' }, { code: '1961', name: 'Hallstahammars kommun' }, { code: '1962', name: 'Norbergs kommun' }, { code: '1904', name: 'Skinnskattebergs kommun' }, { code: '1907', name: 'Surahammars kommun' }],
    config: { system: 'edp', baseUrl: 'https://services.vafabmiljo.se/FutureWebVKFHus' },
  },
  {
    id: 'june',
    name: 'June Avfall & Miljö',
    url: 'https://www.juneavfall.se',
    kommuner: [{ code: '0680', name: 'Jönköpings kommun' }, { code: '0643', name: 'Habo kommun' }, { code: '0642', name: 'Mullsjö kommun' }],
    config: { system: 'edp', baseUrl: 'https://minasidor.juneavfall.se/FutureWebJuneBasic' },
  },
  {
    id: 'boras',
    name: 'Borås Energi och Miljö',
    url: 'https://www.borasem.se',
    kommuner: [{ code: '1490', name: 'Borås kommun' }],
    config: { system: 'edp', baseUrl: 'https://kundportal.borasem.se/EDPFutureWeb' },
  },
  {
    id: 'lund',
    name: 'Lunds kommun',
    url: 'https://lund.se',
    kommuner: [{ code: '1281', name: 'Lunds kommun' }],
    config: { system: 'edp', baseUrl: 'https://eservice431601.lund.se/Lund/FutureWeb' },
  },
  {
    id: 'nacka',
    name: 'Nacka vatten och avfall',
    url: 'https://www.nvoa.se',
    kommuner: [{ code: '0182', name: 'Nacka kommun' }],
    config: { system: 'edp', baseUrl: 'https://futureweb.nvoa.se/EDP/FutureWebBasic' },
  },
  {
    id: 'gotland',
    name: 'Region Gotland',
    url: 'https://www.gotland.se',
    kommuner: [{ code: '0980', name: 'Gotlands kommun' }],
    config: { system: 'edp', baseUrl: 'https://edpfuture.gotland.se/FutureWeb' },
  },
  {
    id: 'skelleftea',
    name: 'Skellefteå kommun',
    url: 'https://skelleftea.se',
    kommuner: [{ code: '2482', name: 'Skellefteå kommun' }],
    config: { system: 'edp', baseUrl: 'https://wwwtk2.skelleftea.se/FutureWeb' },
  },
  {
    id: 'ssam',
    name: 'SSAM',
    url: 'https://www.ssam.se',
    kommuner: [{ code: '0780', name: 'Växjö kommun' }, { code: '0764', name: 'Alvesta kommun' }, { code: '0761', name: 'Lessebo kommun' }, { code: '0763', name: 'Tingsryds kommun' }, { code: '0760', name: 'Uppvidinge kommun' }],
    config: { system: 'edp', baseUrl: 'https://edpfuture.ssam.se/FutureWeb' },
  },
  {
    id: 'kretslopp-sydost',
    name: 'Kretslopp Sydost',
    url: 'https://www.kretsloppsydost.se',
    kommuner: [{ code: '0880', name: 'Kalmar kommun' }, { code: '0881', name: 'Nybro kommun' }, { code: '0862', name: 'Emmaboda kommun' }, { code: '0834', name: 'Torsås kommun' }, { code: '0840', name: 'Mörbylånga kommun' }, { code: '0885', name: 'Borgholms kommun' }],
    // Söktjänsten har även adresser här (sedd 2026-10-31), t.ex. Kristdala, Korsberga och Åseda.
    grannkommuner: [{ code: '0882', name: 'Oskarshamns kommun' }, { code: '0685', name: 'Vetlanda kommun' }, { code: '0684', name: 'Sävsjö kommun' }, { code: '0760', name: 'Uppvidinge kommun' }],
    config: { system: 'edp', baseUrl: 'https://kundportal.kretsloppsydost.se/FutureWeb' },
  },
  {
    id: 'varberg',
    name: 'VIVAB Varberg',
    url: 'https://www.vivab.info',
    kommuner: [{ code: '1383', name: 'Varbergs kommun' }],
    config: { system: 'edp', baseUrl: 'https://minasidor.vivab.info/FutureWebVarberg' },
  },
  {
    id: 'falkenberg',
    name: 'VIVAB Falkenberg',
    url: 'https://www.vivab.info',
    kommuner: [{ code: '1382', name: 'Falkenbergs kommun' }],
    config: { system: 'edp', baseUrl: 'https://minasidor.vivab.info/FutureWebFalken' },
  },
  {
    id: 'partille',
    name: 'Partille kommun',
    url: 'https://www.partille.se',
    kommuner: [{ code: '1402', name: 'Partille kommun' }],
    config: { system: 'edp', baseUrl: 'https://vatjanst.partille.se/FutureWeb' },
  },
  {
    id: 'kungalv',
    name: 'Kungälvs kommun',
    url: 'https://www.kungalv.se',
    kommuner: [{ code: '1482', name: 'Kungälvs kommun' }],
    config: { system: 'edp', baseUrl: 'https://minasidor-va-avfall.kungalv.se/FutureWeb' },
  },
  {
    id: 'boden',
    name: 'Bodens kommun',
    url: 'https://www.boden.se',
    kommuner: [{ code: '2582', name: 'Bodens kommun' }],
    config: { system: 'edp', baseUrl: 'https://edpmobile.boden.se/FutureWeb' },
  },
  {
    id: 'danderyd',
    name: 'Danderyds kommun',
    url: 'https://www.danderyd.se',
    kommuner: [{ code: '0162', name: 'Danderyds kommun' }],
    config: { system: 'edp', baseUrl: 'https://future.danderyd.se/Danderyd/EDPFutureweb' },
  },
  {
    id: 'lycksele',
    name: 'Lycksele kommun',
    url: 'https://www.lycksele.se',
    kommuner: [{ code: '2481', name: 'Lycksele kommun' }],
    config: { system: 'edp', baseUrl: 'https://future.lycksele.se/FutureWeb' },
  },
  {
    id: 'kiruna',
    name: 'Tekniska Verken i Kiruna',
    url: 'https://www.tekniskaverkenikiruna.se',
    kommuner: [{ code: '2584', name: 'Kiruna kommun' }],
    config: { system: 'edp', baseUrl: 'https://kund.tekniskaverkenikiruna.se/FutureWebBasic' },
  },
  {
    id: 'lidkoping',
    name: 'Lidköpings kommun',
    url: 'https://www.lidkoping.se',
    kommuner: [{ code: '1494', name: 'Lidköpings kommun' }],
    config: { system: 'edp', baseUrl: 'https://futureweb.lidkoping.se/FutureWebBasic' },
  },
  {
    id: 'orust',
    name: 'Orust kommun',
    url: 'https://www.orust.se',
    kommuner: [{ code: '1421', name: 'Orust kommun' }],
    config: { system: 'edp', baseUrl: 'https://va-renhallning-minasidor.orust.se/FutureWebBasic' },
  },
  {
    id: 'ljungby',
    name: 'Ljungby kommun',
    url: 'https://www.ljungby.se',
    kommuner: [{ code: '0781', name: 'Ljungby kommun' }],
    config: { system: 'edp', baseUrl: 'https://edpwebb.ljungby.se/FutureWeb' },
  },
  {
    id: 'mark',
    name: 'Marks kommun',
    url: 'https://www.mark.se',
    kommuner: [{ code: '1463', name: 'Marks kommun' }],
    config: { system: 'edp', baseUrl: 'https://va-renhallning.mark.se/FutureWeb' },
  },
  {
    id: 'herrljunga-vargarda',
    name: 'Remondis (Herrljunga och Vårgårda)',
    url: 'https://www.remondis.se',
    kommuner: [{ code: '1466', name: 'Herrljunga kommun' }, { code: '1442', name: 'Vårgårda kommun' }],
    config: { system: 'edp', baseUrl: 'https://edpfuture.remondis.se/EDPFutureWeb' },
  },
]

/** Källorna som visas på sajten. All kod utom build-skriptets validering använder den här. */
export const SOURCES: Source[] = ALL_SOURCES.filter((s) => !s.hidden)

export function getSource(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id)
}

/** Alla kommuner som någon källa täcker, sorterade efter namn. */
export function supportedKommuner(): Kommun[] {
  const byCode = new Map(SOURCES.flatMap((s) => s.kommuner).map((k) => [k.code, k]))
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'))
}

/** Kommunerna som källan täcker: "Avesta kommun", "Herrljunga kommun och Vårgårda kommun". */
export function sourceLabel(source: Source): string {
  const names = source.kommuner.map((k) => k.name)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} och ${names.at(-1)}` : names[0]
}

/** Kommunerna vars orter finns i källans ort→kommun-tabell. */
export function placeKommuner(source: Source): Kommun[] {
  return [...source.kommuner, ...(source.grannkommuner ?? [])]
}

/** Om adresserna behöver ort→kommun-tabellen, dvs. om orten kan ligga i mer än en kommun. */
export function needsPlaces(source: Source): boolean {
  return placeKommuner(source).length > 1
}

/**
 * Kommunen för en adress hos källan. Källor med en kommun ger den direkt. Annars slås orten upp
 * i gatuindexets ort→kommun-tabell (se scripts/build-street-index.ts). En okänd ort visas som
 * den är, hellre än att källans namn ser ut som en kommun.
 */
export function kommunForLocality(source: Source, locality: string, places: Record<string, string> = {}): string {
  if (!needsPlaces(source)) return source.kommuner[0].name
  return places[normalize(locality, false)] ?? locality
}

