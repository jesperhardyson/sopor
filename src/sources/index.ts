import { normalize } from '../domain/search.js'

/** En kommun enligt SCB:s kommunkod. */
export interface Kommun {
  code: string
  name: string
}

/** Hur källans data hämtas. Ny leverantör = ny variant här + ny provider. */
export type SourceConfig = { system: 'static' } | { system: 'edp'; baseUrl: string } | { system: 'svoa' } | { system: 'vasyd' } | { system: 'nsr' } | { system: 'srv' } | { system: 'appbolaget'; unit: string } | { system: 'uddevalla' } | { system: 'borlange' } | { system: 'roslagsvatten'; municipality: string } | { system: 'msva' } | { system: 'telge' } | { system: 'vakin' }

/**
 * Hur man når källans kundtjänst, hämtat från källans egen webbplats. Minst en av `phone`, `email`
 * och `page` finns. `checked` säger var uppgifterna står och när de senast kontrollerades.
 */
export interface SourceContact {
  /** `number` i E.164, `display` som källan själv skriver det. */
  phone?: { number: string; display: string }
  /** Kundtjänstens adress, aldrig en persons. */
  email?: string
  /** Källans kontaktsida. */
  page?: string
  checked: { url: string; date: string }
}

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
  /**
   * Postorter som källan skriver men som inte går att slå upp i OpenStreetMaps orter, för att de
   * saknas där eller finns i flera av källans kommuner: ort → kommunkod.
   */
  postorter?: Record<string, string>
  config: SourceConfig
  /**
   * Hur användaren väljer i källans data: `address` (standard) eller `area`, när källan bara
   * publicerar scheman per område och ingen tabell från adress till område finns.
   */
  selection?: 'address' | 'area'
  /** Påhittad data (seed). Ta bort när riktig data finns. */
  testData?: boolean
  /** Visas inte på sajten: inte i sökning, på Om-sidan, i API:t eller i byggd data. Datan valideras ändå vid build. */
  hidden?: boolean
  /**
   * Krävs för källor med områdesval: vad vi inte vet, eftersom användaren valt området själv. Följer
   * med överallt där schemat visas, i kalenderarket, kalenderfilen och API:t.
   */
  areaNotice?: { title: string; text: string }
  /** Visas i stället för "Inga kommande tömningar" när en adress hos källan har ett tomt schema. */
  emptyScheduleNote?: { title: string; text: string }
  contact?: SourceContact
}

/** Kontaktuppgifterna gäller alla källor hos samma organisation. */
const VIVAB_CONTACT: SourceContact = {
  phone: { number: '+46757274000', display: '0757-27 40 00' },
  page: 'https://vivab.se/om-vivab/kundservice',
  checked: { url: 'https://vivab.se/om-vivab/kundservice', date: '2026-11-07' },
}

const ROSLAGSVATTEN_CONTACT: SourceContact = {
  phone: { number: '+46854083500', display: '08-540 835 00' },
  email: 'info@roslagsvatten.se',
  page: 'https://roslagsvatten.se/kundservice',
  checked: { url: 'https://roslagsvatten.se/kundservice', date: '2026-11-07' },
}

/** EDP-källorna kontrollerades live 2026-10-30 (SearchAdress gav träffar), Ale, Stenungsund, Lidingö och Värmdö 2026-11-03. */
export const ALL_SOURCES: Source[] = [
  {
    id: 'avesta',
    name: 'Avesta Vatten och Avfall',
    url: 'https://www.avestavatten.se',
    contact: {
      phone: { number: '+46226645500', display: '0226-64 55 00' },
      email: 'avestavatten@avesta.se',
      page: 'https://www.avestavatten.se/support/',
      checked: { url: 'https://www.avestavatten.se/support/', date: '2026-11-07' },
    },
    kommuner: [{ code: '2084', name: 'Avesta kommun' }],
    config: { system: 'static' },
    selection: 'area',
    areaNotice: {
      title: 'Kontrollera att området stämmer',
      text: 'Du har valt området själv, eftersom Avesta Vatten inte publicerar vilka adresser som hör till vilket område. Väljer du fel område kan du missa din tömning.',
    },
    emptyScheduleNote: {
      title: 'Schemat för nästa år är inte publicerat än',
      text: 'Avesta Vatten publicerar hämtschemat ett år i taget. Datumen visas här när det nya schemat finns.',
    },
  },
  {
    id: 'sater',
    name: 'Säters kommun',
    url: 'https://sater.se',
    contact: {
      phone: { number: '+4622555000', display: '0225-55 000' },
      email: 'kommun@sater.se',
      checked: { url: 'https://sater.se/', date: '2026-11-07' },
    },
    kommuner: [{ code: '2082', name: 'Säters kommun' }],
    config: { system: 'static' },
    selection: 'area',
    areaNotice: {
      title: 'Kontrollera att området stämmer',
      text: 'Du har valt området själv, eftersom Säters kommun inte visar öppet vilka adresser som hör till vilket område. Väljer du fel område kan du missa din tömning.',
    },
    emptyScheduleNote: {
      title: 'Schemat framåt är inte publicerat än',
      text: 'Säters kommun har bara publicerat hämtveckorna en bit framåt. Datumen visas här när nästa period finns.',
    },
  },
  {
    id: 'uppsala',
    name: 'Uppsala Vatten',
    url: 'https://www.uppsalavatten.se',
    contact: {
      phone: { number: '+46187279400', display: '018-727 94 00' },
      email: 'kundservice@uppsalavatten.se',
      page: 'https://www.uppsalavatten.se/kontakt',
      checked: { url: 'https://www.uppsalavatten.se/kontakt', date: '2026-11-07' },
    },
    kommuner: [{ code: '0380', name: 'Uppsala kommun' }],
    config: { system: 'edp', baseUrl: 'https://futureweb.uppsalavatten.se/Uppsala/FutureWeb' },
  },
  {
    id: 'orebro',
    name: 'Örebro kommun',
    url: 'https://www.orebro.se',
    contact: {
      phone: { number: '+4619211000', display: '019-21 10 00' },
      email: 'servicecenter@orebro.se',
      page: 'https://www.orebro.se/ovrigt/servicecenter.html',
      checked: { url: 'https://www.orebro.se/ovrigt/servicecenter.html', date: '2026-11-07' },
    },
    kommuner: [{ code: '1880', name: 'Örebro kommun' }],
    config: { system: 'edp', baseUrl: 'https://futureweb.orebro.se/FutureWeb' },
  },
  {
    id: 'vafab',
    name: 'Vafab Miljö',
    url: 'https://www.vafabmiljo.se',
    contact: {
      phone: { number: '+4621393500', display: '021-39 35 00' },
      email: 'kundcenter@vafabmiljo.se',
      page: 'https://vafabmiljo.se/kundcenter/kontakta-oss/',
      checked: { url: 'https://vafabmiljo.se/kundcenter/kontakta-oss/', date: '2026-11-07' },
    },
    kommuner: [{ code: '1980', name: 'Västerås kommun' }, { code: '0381', name: 'Enköpings kommun' }, { code: '0331', name: 'Heby kommun' }, { code: '1981', name: 'Sala kommun' }, { code: '1982', name: 'Fagersta kommun' }, { code: '1983', name: 'Köpings kommun' }, { code: '1984', name: 'Arboga kommun' }, { code: '1960', name: 'Kungsörs kommun' }, { code: '1961', name: 'Hallstahammars kommun' }, { code: '1962', name: 'Norbergs kommun' }, { code: '1904', name: 'Skinnskattebergs kommun' }, { code: '1907', name: 'Surahammars kommun' }],
    config: { system: 'edp', baseUrl: 'https://services.vafabmiljo.se/FutureWebVKFHus' },
  },
  {
    id: 'june',
    name: 'June Avfall & Miljö',
    url: 'https://www.juneavfall.se',
    contact: {
      phone: { number: '+4636171900', display: '036-17 19 00' },
      email: 'info@juneavfall.se',
      page: 'https://www.juneavfall.se/om-oss/kontakta-oss/kontakta-kundtjanst',
      checked: { url: 'https://www.juneavfall.se/om-oss/kontakta-oss/kontakta-kundtjanst', date: '2026-11-07' },
    },
    kommuner: [{ code: '0680', name: 'Jönköpings kommun' }, { code: '0643', name: 'Habo kommun' }, { code: '0642', name: 'Mullsjö kommun' }],
    config: { system: 'edp', baseUrl: 'https://minasidor.juneavfall.se/FutureWebJuneBasic' },
  },
  {
    id: 'boras',
    name: 'Borås Energi och Miljö',
    url: 'https://www.borasem.se',
    contact: {
      phone: { number: '+4620971300', display: '020-97 13 00' },
      email: 'kund@borasem.se',
      page: 'https://borasem.se/webb/privat/kontaktaoss.4.61b62986153ef999daeacee3.html',
      checked: { url: 'https://borasem.se/webb/privat/kontaktaoss.4.61b62986153ef999daeacee3.html', date: '2026-11-07' },
    },
    kommuner: [{ code: '1490', name: 'Borås kommun' }],
    config: { system: 'edp', baseUrl: 'https://kundportal.borasem.se/EDPFutureWeb' },
  },
  {
    id: 'lund',
    name: 'Lunds kommun',
    url: 'https://lund.se',
    contact: {
      phone: { number: '+46463595000', display: '046-359 50 00' },
      email: 'lunds.kommun@lund.se',
      page: 'https://lund.se/kontakt',
      checked: { url: 'https://lund.se/kontakt', date: '2026-11-07' },
    },
    kommuner: [{ code: '1281', name: 'Lunds kommun' }],
    config: { system: 'edp', baseUrl: 'https://eservice431601.lund.se/Lund/FutureWeb' },
  },
  {
    id: 'nacka',
    name: 'Nacka vatten och avfall',
    url: 'https://www.nacka.se/nackavattenavfall/',
    contact: {
      phone: { number: '+4687189000', display: '08-718 90 00' },
      email: 'kundservice@nvoa.se',
      page: 'https://www.nacka.se/nackavattenavfall/kontakta-oss/kontakt-och-oppettider/',
      checked: { url: 'https://www.nacka.se/nackavattenavfall/kontakta-oss/kontakt-och-oppettider/', date: '2026-11-07' },
    },
    kommuner: [{ code: '0182', name: 'Nacka kommun' }],
    config: { system: 'edp', baseUrl: 'https://futureweb.nvoa.se/EDP/FutureWebBasic' },
  },
  {
    id: 'gotland',
    name: 'Region Gotland',
    url: 'https://www.gotland.se',
    contact: {
      phone: { number: '+46498269000', display: '0498-26 90 00' },
      email: 'regiongotland@gotland.se',
      page: 'https://gotland.se/region-och-politik/kontakta-oss/sa-kontaktar-du-oss',
      checked: { url: 'https://gotland.se/region-och-politik/kontakta-oss/sa-kontaktar-du-oss', date: '2026-11-07' },
    },
    kommuner: [{ code: '0980', name: 'Gotlands kommun' }],
    config: { system: 'edp', baseUrl: 'https://edpfuture.gotland.se/FutureWeb' },
  },
  {
    id: 'skelleftea',
    name: 'Skellefteå kommun',
    url: 'https://skelleftea.se',
    contact: {
      phone: { number: '+46910735000', display: '0910-73 50 00' },
      email: 'kundtjanst@skelleftea.se',
      page: 'https://skelleftea.se/invanare/startsida/kontakta-kundtjanst',
      checked: { url: 'https://skelleftea.se/invanare/startsida/kontakta-kundtjanst', date: '2026-11-07' },
    },
    kommuner: [{ code: '2482', name: 'Skellefteå kommun' }],
    config: { system: 'edp', baseUrl: 'https://wwwtk2.skelleftea.se/FutureWeb' },
  },
  {
    id: 'ssam',
    name: 'SSAM',
    url: 'https://www.ssam.se',
    contact: {
      phone: { number: '+46470599500', display: '0470-59 95 00' },
      email: 'info@ssam.se',
      page: 'https://ssam.se/om-ssam/kontakta-ssam.html',
      checked: { url: 'https://ssam.se/om-ssam/kontakta-ssam.html', date: '2026-11-07' },
    },
    kommuner: [{ code: '0780', name: 'Växjö kommun' }, { code: '0764', name: 'Alvesta kommun' }, { code: '0761', name: 'Lessebo kommun' }, { code: '0763', name: 'Tingsryds kommun' }, { code: '0760', name: 'Uppvidinge kommun' }],
    config: { system: 'edp', baseUrl: 'https://edpfuture.ssam.se/FutureWeb' },
  },
  {
    id: 'kretslopp-sydost',
    name: 'Kretslopp Sydost',
    url: 'https://www.kretsloppsydost.se',
    contact: {
      phone: { number: '+4620404300', display: '020-40 43 00' },
      page: 'https://kretsloppsydost.se/kontakt/',
      checked: { url: 'https://kretsloppsydost.se/kontakt/', date: '2026-11-07' },
    },
    kommuner: [{ code: '0880', name: 'Kalmar kommun' }, { code: '0881', name: 'Nybro kommun' }, { code: '0862', name: 'Emmaboda kommun' }, { code: '0834', name: 'Torsås kommun' }, { code: '0840', name: 'Mörbylånga kommun' }, { code: '0885', name: 'Borgholms kommun' }],
    // Söktjänsten har även adresser här (sedd 2026-10-31), t.ex. Kristdala, Korsberga och Åseda.
    grannkommuner: [{ code: '0882', name: 'Oskarshamns kommun' }, { code: '0685', name: 'Vetlanda kommun' }, { code: '0684', name: 'Sävsjö kommun' }, { code: '0760', name: 'Uppvidinge kommun' }],
    config: { system: 'edp', baseUrl: 'https://kundportal.kretsloppsydost.se/FutureWeb' },
  },
  {
    id: 'varberg',
    name: 'VIVAB Varberg',
    url: 'https://vivab.se',
    contact: VIVAB_CONTACT,
    kommuner: [{ code: '1383', name: 'Varbergs kommun' }],
    config: { system: 'edp', baseUrl: 'https://minasidor.vivab.info/FutureWebVarberg' },
  },
  {
    id: 'falkenberg',
    name: 'VIVAB Falkenberg',
    url: 'https://vivab.se',
    contact: VIVAB_CONTACT,
    kommuner: [{ code: '1382', name: 'Falkenbergs kommun' }],
    config: { system: 'edp', baseUrl: 'https://minasidor.vivab.info/FutureWebFalken' },
  },
  {
    id: 'partille',
    name: 'Partille kommun',
    url: 'https://www.partille.se',
    contact: {
      phone: { number: '+46317921000', display: '031-792 10 00' },
      email: 'kundcenter@partille.se',
      page: 'https://www.partille.se/kontakt/',
      checked: { url: 'https://www.partille.se/kontakt/', date: '2026-11-07' },
    },
    kommuner: [{ code: '1402', name: 'Partille kommun' }],
    config: { system: 'edp', baseUrl: 'https://vatjanst.partille.se/FutureWeb' },
  },
  {
    id: 'kungalv',
    name: 'Kungälvs kommun',
    url: 'https://www.kungalv.se',
    contact: {
      phone: { number: '+46303238000', display: '0303-23 80 00' },
      email: 'kommun@kungalv.se',
      page: 'https://www.kungalv.se/kommun--politik/kontakta-oss/',
      checked: { url: 'https://sjalvservice.kungalv.se/page/om', date: '2026-11-07' },
    },
    kommuner: [{ code: '1482', name: 'Kungälvs kommun' }],
    config: { system: 'edp', baseUrl: 'https://minasidor-va-avfall.kungalv.se/FutureWeb' },
  },
  {
    id: 'boden',
    name: 'Bodens kommun',
    url: 'https://www.boden.se',
    contact: {
      phone: { number: '+4692162000', display: '0921-620 00' },
      email: 'kommunen@boden.se',
      checked: { url: 'https://boden.se/en/municipality-and-politics/citizen-service', date: '2026-11-07' },
    },
    kommuner: [{ code: '2582', name: 'Bodens kommun' }],
    config: { system: 'edp', baseUrl: 'https://edpmobile.boden.se/FutureWeb' },
  },
  {
    id: 'danderyd',
    name: 'Danderyds kommun',
    url: 'https://www.danderyd.se',
    contact: {
      email: 'kontakt@danderyd.se',
      page: 'https://sjalvservice.danderyd.se/kontaktakommunen',
      checked: { url: 'https://sjalvservice.danderyd.se/kontaktakommunen', date: '2026-11-07' },
    },
    kommuner: [{ code: '0162', name: 'Danderyds kommun' }],
    config: { system: 'edp', baseUrl: 'https://future.danderyd.se/Danderyd/EDPFutureweb' },
  },
  {
    id: 'lycksele',
    name: 'Lycksele kommun',
    url: 'https://www.lycksele.se',
    contact: {
      phone: { number: '+4695016720', display: '0950-167 20' },
      email: 'kundtjanst@lavab.nu',
      page: 'https://www.lycksele.se/lavab/kundtjanst/',
      checked: { url: 'https://www.lycksele.se/lavab/', date: '2026-11-07' },
    },
    kommuner: [{ code: '2481', name: 'Lycksele kommun' }],
    config: { system: 'edp', baseUrl: 'https://future.lycksele.se/FutureWeb' },
  },
  {
    id: 'kiruna',
    name: 'Tekniska Verken i Kiruna',
    url: 'https://www.tekniskaverkenikiruna.se',
    contact: {
      phone: { number: '+4698070723', display: '0980-707 23' },
      email: 'info@tvab.kiruna.se',
      page: 'https://www.tekniskaverkenikiruna.se/om-oss/kundservice',
      checked: { url: 'https://www.tekniskaverkenikiruna.se/om-oss/kundservice', date: '2026-11-07' },
    },
    kommuner: [{ code: '2584', name: 'Kiruna kommun' }],
    config: { system: 'edp', baseUrl: 'https://kund.tekniskaverkenikiruna.se/FutureWebBasic' },
  },
  {
    id: 'lidkoping',
    name: 'Lidköpings kommun',
    url: 'https://www.lidkoping.se',
    contact: {
      phone: { number: '+46510770000', display: '0510-77 00 00' },
      email: 'kommun@lidkoping.se',
      page: 'https://lidkoping.se/kommun-och-politik/kontaktcenter/',
      checked: { url: 'https://sjalvservice.lidkoping.se/oversikt/overview/481', date: '2026-11-07' },
    },
    kommuner: [{ code: '1494', name: 'Lidköpings kommun' }],
    config: { system: 'edp', baseUrl: 'https://futureweb.lidkoping.se/FutureWebBasic' },
  },
  {
    id: 'orust',
    name: 'Orust kommun',
    url: 'https://www.orust.se',
    contact: {
      phone: { number: '+46304334000', display: '0304-33 40 00' },
      email: 'kommun@orust.se',
      page: 'https://www.orust.se/kommun-och-politik/adresser-och-oppettider',
      checked: { url: 'https://www.orust.se/kommun-och-politik/adresser-och-oppettider', date: '2026-11-07' },
    },
    kommuner: [{ code: '1421', name: 'Orust kommun' }],
    config: { system: 'edp', baseUrl: 'https://va-renhallning-minasidor.orust.se/FutureWebBasic' },
  },
  {
    id: 'ljungby',
    name: 'Ljungby kommun',
    url: 'https://www.ljungby.se',
    contact: {
      phone: { number: '+46372789000', display: '0372-78 90 00' },
      email: 'kontaktcenter@ljungby.se',
      page: 'https://www.ljungby.se/ovrigt/kontakta-oss',
      checked: { url: 'https://www.ljungby.se/ovrigt/kontakta-oss', date: '2026-11-07' },
    },
    kommuner: [{ code: '0781', name: 'Ljungby kommun' }],
    config: { system: 'edp', baseUrl: 'https://edpwebb.ljungby.se/FutureWeb' },
  },
  {
    id: 'mark',
    name: 'Marks kommun',
    url: 'https://www.mark.se',
    contact: {
      phone: { number: '+46320217000', display: '0320-21 70 00' },
      email: 'kontaktcenter@mark.se',
      page: 'https://www.mark.se/kommun-och-politik/kontakta-oss/kontaktcenter',
      checked: { url: 'https://www.mark.se/kommun-och-politik/kontakta-oss/kontaktcenter', date: '2026-11-07' },
    },
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
  {
    id: 'ale',
    name: 'Ale kommun',
    url: 'https://www.ale.se',
    contact: {
      phone: { number: '+46303703000', display: '0303-70 30 00' },
      email: 'kommun@ale.se',
      page: 'https://ale.se/ovrigt/kontakta-oss.html',
      checked: { url: 'https://ale.se/ovrigt/kontakta-oss.html', date: '2026-11-07' },
    },
    kommuner: [{ code: '1440', name: 'Ale kommun' }],
    config: { system: 'edp', baseUrl: 'https://edp.ale.se/FutureWeb' },
  },
  {
    // Kommunens egen värd har data, Remondis värd var tom för Stenungsund (2026-10-30).
    id: 'stenungsund',
    name: 'Stenungsunds kommun',
    url: 'https://www.stenungsund.se',
    contact: {
      phone: { number: '+46303730000', display: '0303-73 00 00' },
      email: 'kommun@stenungsund.se',
      page: 'https://www.stenungsund.se/kontakta-oss/kontaktcenter',
      checked: { url: 'https://www.stenungsund.se/kontakta-oss/kontaktcenter', date: '2026-11-07' },
    },
    kommuner: [{ code: '1415', name: 'Stenungsunds kommun' }],
    config: { system: 'edp', baseUrl: 'https://futureweb.stenungsund.se/FutureWeb' },
  },
  {
    id: 'lidingo',
    name: 'Lidingö stad',
    url: 'https://lidingo.se',
    contact: {
      phone: { number: '+4687313000', display: '08-731 30 00' },
      page: 'https://lidingo.se/kontakt/',
      checked: { url: 'https://lidingo.se/kontakt/', date: '2026-11-07' },
    },
    kommuner: [{ code: '0186', name: 'Lidingö kommun' }],
    config: { system: 'edp', baseUrl: 'https://vaochavfall.lidingo.se/Futureweb' },
  },
  {
    id: 'varmdo',
    name: 'Värmdö kommun',
    url: 'https://www.varmdo.se',
    contact: {
      phone: { number: '+46857047000', display: '08-570 470 00' },
      email: 'varmdo.kommun@varmdo.se',
      page: 'https://www.varmdo.se/kontakt.4.3251048d16e2a7e784851453.html',
      checked: { url: 'https://www.varmdo.se/kontakt.4.3251048d16e2a7e784851453.html', date: '2026-11-07' },
    },
    kommuner: [{ code: '0120', name: 'Värmdö kommun' }],
    config: { system: 'edp', baseUrl: 'https://edp-futureweb.varmdo.se/FutureWeb' },
  },
  {
    // Ingen EDP: SVOA:s publika tjänst, bara villor och radhus (src/server/svoa.ts).
    id: 'stockholm',
    name: 'Stockholm Vatten och Avfall',
    url: 'https://www.stockholmvattenochavfall.se',
    contact: {
      phone: { number: '+46852212000', display: '08-522 120 00' },
      email: 'kund@svoa.se',
      page: 'https://www.stockholmvattenochavfall.se/villa-och-radhus/kontakta-oss/',
      checked: { url: 'https://www.stockholmvattenochavfall.se/villa-och-radhus/kontakta-oss/', date: '2026-11-07' },
    },
    kommuner: [{ code: '0180', name: 'Stockholms kommun' }],
    config: { system: 'svoa' },
    emptyScheduleNote: {
      title: 'I Stockholm visar Sopor bara villor och radhus',
      text: 'Bor du i lägenhet sköter fastighetsägaren sophämtningen. Fråga din hyresvärd eller bostadsrättsförening.',
    },
  },
  {
    // Ingen EDP: VA Syds publika tjänst (src/server/vasyd.ts). Malmö och Burlöv, inte Lund, Lomma eller Eslöv.
    id: 'vasyd',
    name: 'VA Syd',
    url: 'https://www.vasyd.se',
    kommuner: [{ code: '1280', name: 'Malmö kommun' }, { code: '1231', name: 'Burlövs kommun' }],
    config: { system: 'vasyd' },
  },
  {
    // Ingen EDP: tömningskalendern på nsr.se (src/server/nsr.ts), med ICS-fil per adress.
    id: 'nsr',
    name: 'NSR',
    url: 'https://nsr.se',
    contact: {
      phone: { number: '+46424001340', display: '042-400 13 40' },
      email: 'kundservice@nsr.se',
      page: 'https://nsr.se/privat/kontaktportal/kontakta-kundservice/',
      checked: { url: 'https://nsr.se/privat/kontaktportal/kontakta-kundservice/', date: '2026-11-07' },
    },
    kommuner: [
      { code: '1283', name: 'Helsingborgs kommun' },
      { code: '1292', name: 'Ängelholms kommun' },
      { code: '1284', name: 'Höganäs kommun' },
      { code: '1278', name: 'Båstads kommun' },
      { code: '1260', name: 'Bjuvs kommun' },
      { code: '1277', name: 'Åstorps kommun' },
    ],
    config: { system: 'nsr' },
  },
  {
    // Ingen EDP: söktjänsten på srvatervinning.se (src/server/srv.ts), med kundnumret som id.
    id: 'srv',
    name: 'SRV återvinning',
    url: 'https://www.srvatervinning.se',
    contact: {
      phone: { number: '+46200264600', display: '0200-26 46 00' },
      email: 'kundservice@srvatervinning.se',
      page: 'https://www.srvatervinning.se/kundservice',
      checked: { url: 'https://www.srvatervinning.se/kundservice', date: '2026-11-07' },
    },
    kommuner: [
      { code: '0126', name: 'Huddinge kommun' },
      { code: '0127', name: 'Botkyrka kommun' },
      { code: '0136', name: 'Haninge kommun' },
      { code: '0192', name: 'Nynäshamns kommun' },
      { code: '0128', name: 'Salems kommun' },
    ],
    // SRV skriver postorten. Haninge, Ornö och Utö saknas bland OpenStreetMaps orter, och Norsborg finns också i Nynäshamn.
    postorter: { Haninge: '0136', Ornö: '0136', Utö: '0136', Norsborg: '0127' },
    config: { system: 'srv' },
  },
  {
    // Ingen EDP: Appbolagets plattform (src/server/appbolaget.ts). Unit står på renhallningen-kristianstad.se.
    id: 'kristianstad',
    name: 'Renhållningen Kristianstad',
    url: 'https://renhallningen-kristianstad.se',
    contact: {
      phone: { number: '+4644135400', display: '044-13 54 00' },
      email: 'renhallningen@kristianstad.se',
      page: 'https://renhallningen-kristianstad.se/kontakta-oss/',
      checked: { url: 'https://renhallningen-kristianstad.se/kontakta-oss/', date: '2026-11-07' },
    },
    kommuner: [{ code: '1290', name: 'Kristianstads kommun' }],
    config: { system: 'appbolaget', unit: 'dd905ce7-b16d-4422-be36-564169af4035' },
  },
  {
    // Appbolagets plattform, som Kristianstad. Unit står i tömningskalendern på hassleholmmiljo.se.
    id: 'hassleholm',
    name: 'Hässleholm Miljö',
    url: 'https://hassleholmmiljo.se',
    contact: {
      phone: { number: '+46451268200', display: '0451-26 82 00' },
      page: 'https://hassleholmmiljo.se/kundservice/kontakta-kundservice',
      checked: { url: 'https://hassleholmmiljo.se/kundservice/kontakta-kundservice', date: '2026-11-07' },
    },
    kommuner: [{ code: '1293', name: 'Hässleholms kommun' }],
    config: { system: 'appbolaget', unit: 'e34d7050-1b2a-4917-a921-0ea7742d0a6e' },
  },
  {
    // Ingen EDP: den publika sökningen på uddevallaenergi.se (src/server/uddevalla.ts). Bara nästa tömning per kärl.
    id: 'uddevalla',
    name: 'Uddevalla Energi',
    url: 'https://www.uddevallaenergi.se',
    contact: {
      phone: { number: '+46522580800', display: '0522-58 08 00' },
      email: 'kundservice@uddevallaenergi.se',
      page: 'https://www.uddevallaenergi.se/kundservice/kundservice.html',
      checked: { url: 'https://www.uddevallaenergi.se/kundservice/kundservice.html', date: '2026-11-07' },
    },
    kommuner: [{ code: '1485', name: 'Uddevalla kommun' }],
    config: { system: 'uddevalla' },
  },
  {
    // Ingen EDP: "När kommer sopbilen?" på vakin.se (src/server/vakin.ts), med riktiga datum.
    id: 'vakin',
    name: 'Vakin',
    url: 'https://www.vakin.se',
    contact: {
      phone: { number: '+4690161900', display: '090-16 19 00' },
      email: 'kundservice@vakin.se',
      page: 'https://www.vakin.se/kundserviceochetjanster/kontaktochfelanmalan/kontaktaoss.4.5e3bd7171837c9a20998db.html',
      checked: { url: 'https://www.vakin.se/kundserviceochetjanster/kontaktochfelanmalan/kontaktaoss.4.5e3bd7171837c9a20998db.html', date: '2026-11-07' },
    },
    kommuner: [
      { code: '2480', name: 'Umeå kommun' },
      { code: '2404', name: 'Vindelns kommun' },
      { code: '2401', name: 'Nordmalings kommun' },
    ],
    // OpenStreetMap har de här orterna i flera av källans kommuner.
    postorter: { Holmsund: '2480', Röbäck: '2480', Nyåker: '2401', Olofsfors: '2401' },
    config: { system: 'vakin' },
    emptyScheduleNote: {
      title: 'Vakin visar ingen tömning just nu',
      text: 'Källan har inga planerade tömningar för den här adressen. I flerbostadshus kan soprummet finnas på en annan adress. Väntar du en tömning, kontakta Vakin.',
    },
  },
  {
    // Ingen EDP: Sundsvalls öppna API (src/server/msva.ts). Bara småhus och nästa tömning per kärl. Täcker inte Timrå och Nordanstig.
    id: 'msva',
    name: 'Mittsverige Vatten & Avfall',
    url: 'https://www.msva.se',
    contact: {
      phone: { number: '+46201202500', display: '020-120 25 00' },
      email: 'kundservice@msva.se',
      page: 'https://msva.se/kundservice/',
      checked: { url: 'https://msva.se/kundservice/', date: '2026-11-07' },
    },
    kommuner: [{ code: '2281', name: 'Sundsvalls kommun' }],
    config: { system: 'msva' },
  },
  {
    // Ingen EDP: sopbilsschemat på telge.se (src/server/telge.ts), med riktiga datum ett år framåt. Täcker inte Nykvarn.
    id: 'telge',
    name: 'Telge Återvinning',
    url: 'https://www.telge.se',
    kommuner: [{ code: '0181', name: 'Södertälje kommun' }],
    config: { system: 'telge' },
  },
  {
    // Ingen EDP: den publika sökningen på borlange-energi.se (src/server/borlange.ts). Bara nästa tömning per kärl. Täcker inte Säter.
    id: 'borlange',
    name: 'Borlänge Energi',
    url: 'https://www.borlange-energi.se',
    contact: {
      phone: { number: '+4624373000', display: '0243-730 00' },
      email: 'kund@borlange-energi.se',
      page: 'https://www.borlange-energi.se/kontakta-oss',
      checked: { url: 'https://www.borlange-energi.se/kontakta-oss', date: '2026-11-07' },
    },
    kommuner: [{ code: '2081', name: 'Borlänge kommun' }],
    config: { system: 'borlange' },
    emptyScheduleNote: {
      title: 'Borlänge Energi visar ingen tömning just nu',
      text: 'Källan har inga planerade tömningar för den här adressen. Väntar du en tömning, kontakta Borlänge Energi.',
    },
  },
  {
    // Ingen EDP: hämtningsschemat på roslagsvatten.se (src/server/roslagsvatten.ts). Kommunen krävs i varje anrop, så en källa per kommun.
    id: 'osteraker',
    name: 'Roslagsvatten',
    url: 'https://roslagsvatten.se',
    contact: ROSLAGSVATTEN_CONTACT,
    kommuner: [{ code: '0117', name: 'Österåkers kommun' }],
    config: { system: 'roslagsvatten', municipality: 'osteraker' },
  },
  {
    id: 'ekero',
    name: 'Roslagsvatten',
    url: 'https://roslagsvatten.se',
    contact: ROSLAGSVATTEN_CONTACT,
    kommuner: [{ code: '0125', name: 'Ekerö kommun' }],
    config: { system: 'roslagsvatten', municipality: 'ekero' },
  },
  {
    id: 'vaxholm',
    name: 'Roslagsvatten',
    url: 'https://roslagsvatten.se',
    contact: ROSLAGSVATTEN_CONTACT,
    kommuner: [{ code: '0187', name: 'Vaxholms stad' }],
    config: { system: 'roslagsvatten', municipality: 'vaxholm' },
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

/** Källor som hämtas live genom Vercel-funktionerna (EDP, Stockholm), till skillnad från statiska filer. */
export type LiveSource = Source & { config: Exclude<SourceConfig, { system: 'static' }> }
export const isLive = (s: Source): s is LiveSource => s.config.system !== 'static'

/**
 * Kalenderfilen svarar med fel för ett tomt schema från en live-källa, eftersom det kan vara ett nytt
 * format hos källan: prenumerationer ska behålla det de har i stället för att tömmas. Statiska källor
 * har alltid en fil, som fylls på när nästa års schema läggs in.
 */
export const hasCalendarFile = (source: Source, eventCount: number) => eventCount > 0 || !isLive(source)

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

/** Varningen som en rad text, för kalenderfilen och API:t. */
export const areaNoticeText = (source: Pick<Source, 'areaNotice'> | undefined): string | undefined =>
  source?.areaNotice && `${source.areaNotice.title}. ${source.areaNotice.text}`
