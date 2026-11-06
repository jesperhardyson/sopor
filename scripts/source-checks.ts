// Kontrollerna i bevakningen av källorna (docs/specs/2026-11-02-bevakning-av-kallor.md).
// Samma anrop som sajten gör, så att det som kontrolleras är det som körs i produktion.

import { addDays } from '../src/domain/dates.js'
import { edpAddressId, edpSchedule, edpSearch, queryFromAddressId } from '../src/server/edp.js'
import { fetchJson, SourceError } from '../src/server/http.js'
import { isKnownBin, mapWasteType } from '../src/server/fractions-map.js'
import { vasydRule, vasydSchedule, vasydSearch, VASYD_URL } from '../src/server/vasyd.js'
import { NSR_URL, nsrSchedule, nsrSearch } from '../src/server/nsr.js'
import { APPBOLAGET_URL, appbolagetFind, appbolagetSearch, appbolagetServices, isFee, scheduleFromServices, serviceType } from '../src/server/appbolaget.js'
import { ROSLAGSVATTEN_URL, roslagsvattenFind, roslagsvattenPickups, roslagsvattenSchedule, roslagsvattenSearch } from '../src/server/roslagsvatten.js'
import { BORLANGE_URL, borlangeFind, borlangePickups, borlangeSchedule, borlangeSearch } from '../src/server/borlange.js'
import { MSVA_URL, msvaFind, msvaSchedule, msvaSearch, msvaWasteType } from '../src/server/msva.js'
import { TELGE_URL, telgeFind, telgePickups, telgeSchedule, telgeSearch } from '../src/server/telge.js'
import { VAKIN_URL, vakinFind, vakinPickups, vakinSchedule, vakinSearch } from '../src/server/vakin.js'
import { UDDEVALLA_URL, uddevallaFind, uddevallaPickups, uddevallaSchedule, uddevallaSearch, uddevallaWasteType } from '../src/server/uddevalla.js'
import { isKnownSrvJob, SRV_URL, srvFind, srvSchedule, srvSearch, srvWasteType } from '../src/server/srv.js'
import { parseSvoaAddress, sameSvoaAddress, svoaAddressId, SVOA_URL, svoaFractions, svoaSchedule, svoaSearch, svoaStep } from '../src/server/svoa.js'
import type { Source } from '../src/sources/index.js'
import { classifyWasteTypes } from './check-source.js'

export type SourceState = 'fungerar' | 'svarar-inte' | 'nytt-format' | 'tom' | 'inga-tomningar' | 'schemat-tar-slut'

export interface SourceResult {
  sourceId: string
  name: string
  state: SourceState
  baseUrl?: string
  probe?: string
  /** Felet som det kom, t.ex. "futureweb.lidkoping.se svarade 502" */
  error?: string
  /** undefined = schemat hämtades inte, så avfallstyperna är okända */
  unknownWasteTypes?: string[]
  /** 'sajten' = källan nåddes inte härifrån men fungerar från sajtens servrar */
  via?: 'sajten'
}

export const SITE_URL = 'https://sopor.hardyson.se'

const TIMEOUT_MS = 10000
/** Så långt fram som tömningar och statiska scheman ska räcka. */
const HORIZON_DAYS = 60

/**
 * Ingen kontakt, 5xx och spärrar (403, 408, 429) är avbrott; kommunernas sajter stoppar ibland anrop
 * från molnet. Allt annat (404, HTML, trasig JSON) tyder på ett nytt format.
 */
function stateForError(error: unknown): SourceState {
  const message = (error as Error).message ?? ''
  return error instanceof SourceError && /Ingen kontakt|svarade (5\d\d|403|408|429)/.test(message) ? 'svarar-inte' : 'nytt-format'
}

export async function checkEdpSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  if (source.config.system !== 'edp') throw new Error(`${source.id} är inte en EDP-källa`)
  const baseUrl = source.config.baseUrl
  const base = { sourceId: source.id, name: source.name, baseUrl, probe }

  // Råsvaren fångas på vägen: edpSearch gör om ett saknat Buildings till en tom lista.
  let raw: Record<string, unknown> | null = null
  const spy: typeof fetch = async (input, init) => {
    const res = await fetchFn(input, init)
    raw = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null
    return res
  }

  try {
    const buildings = await edpSearch(baseUrl, probe, spy, TIMEOUT_MS)
    const listed = (raw as { Buildings?: unknown } | null)?.Buildings
    if (!Array.isArray(listed)) return { ...base, state: 'nytt-format', error: 'Svaret saknar Buildings' }
    if (listed.length === 0) return { ...base, state: 'tom' }
    if (buildings.length === 0) return { ...base, state: 'nytt-format', error: `Ingen adress gick att tolka, t.ex. "${listed[0]}"` }

    const schedule = await edpSchedule(baseUrl, buildings[0].raw, spy, new Date(`${today}T12:00:00Z`), TIMEOUT_MS)
    const services = (raw as { RhServices?: unknown } | null)?.RhServices
    if (!Array.isArray(services)) return { ...base, state: 'nytt-format', error: 'Svaret saknar RhServices' }

    const unknownWasteTypes = classifyWasteTypes(services)
      .filter((w) => w.status === 'okänd')
      .map((w) => w.wasteType)
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = schedule.events.some((e) => e.date >= today && e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/** Gruppen och frekvensen i SVOA:s svar, i dagens form eller den äldre. */
function svoaRows(raw: unknown): { group: string; frequency: string }[] {
  if (Array.isArray(raw)) return raw.map((r) => ({ group: String(r?.group ?? ''), frequency: String(r?.fetchFrequency ?? '') }))
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw).map(([group, list]) => ({ group, frequency: String((Array.isArray(list) ? list[0] : undefined)?.FetchFrequency ?? '') }))
}

/** Stockholm: adressökningen och schemat, som checkEdpSource. Okända frekvenser räknas med bland avfallstyperna. */
export async function checkSvoaSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, baseUrl: SVOA_URL, probe }
  let raw: unknown = null
  const spy: typeof fetch = async (input, init) => {
    const res = await fetchFn(input, init)
    raw = await res.clone().json().catch(() => null)
    return res
  }
  try {
    const found = await svoaSearch(probe.split(',')[0], spy, TIMEOUT_MS)
    if (found.length === 0) return { ...base, state: 'tom' }
    // Samma matchning som uppslaget gör: ändrar SVOA hur adresserna skrivs ska bevakningen larma.
    const probeAddress = parseSvoaAddress(probe)
    const address = probeAddress && found.find((a) => sameSvoaAddress(svoaAddressId(probeAddress), a))
    if (!address) return { ...base, state: 'nytt-format', error: `Kontrolladressen ${probe} hittades inte, bara t.ex. ${found[0].raw}` }
    const schedule = await svoaSchedule(address.raw, spy, TIMEOUT_MS)
    const rows = svoaRows(raw)
    const unknownWasteTypes = [
      ...rows.filter((r) => svoaFractions(r.group).fractions.includes('karl') && r.group !== 'Trädgårdsavfall, villa').map((r) => r.group),
      ...rows.filter((r) => !svoaStep(r.frequency)).map((r) => `Frekvens: ${r.frequency}`),
    ]
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = schedule.events.some((e) => e.date >= today && e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/** Malmö och Burlöv: som checkSvoaSource. Kontrolladressen matchas på hela adressen, som sökningen skriver den. */
export async function checkVasydSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, baseUrl: VASYD_URL, probe }
  let raw: unknown = null
  const spy: typeof fetch = async (input, init) => {
    const res = await fetchFn(input, init)
    raw = await res.clone().json().catch(() => null)
    return res
  }
  try {
    const found = await vasydSearch(probe, spy, TIMEOUT_MS)
    if (found.length === 0) return { ...base, state: 'tom' }
    const building = found.find((b) => b.raw === probe)
    if (!building) return { ...base, state: 'nytt-format', error: `Kontrolladressen ${probe} hittades inte, bara t.ex. ${found[0].raw}` }
    const schedule = await vasydSchedule(building, spy, TIMEOUT_MS)
    const items = (raw as { items?: { wasteType?: unknown; wastePickupFrequency?: unknown }[] } | null)?.items ?? []
    const rows = items.map((r) => ({ wasteType: String(r.wasteType ?? ''), frequency: String(r.wastePickupFrequency ?? '').trim() }))
    // Kända kärl med egen text (trädgårdsavfall) har säsong i frekvensen och visas med bara källans datum.
    const unknownWasteTypes = [
      ...classifyWasteTypes(rows.map((r) => ({ WasteType: r.wasteType, WastePickupFrequency: r.frequency })))
        .filter((w) => w.status === 'okänd')
        .map((w) => w.wasteType),
      ...rows.filter((r) => !vasydRule(r.frequency) && !isKnownBin(r.wasteType)).map((r) => `Frekvens: ${r.frequency}`),
    ]
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = schedule.events.some((e) => e.date >= today && e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/**
 * NSR: kontrolladressen är ett adress-id. NSR:s id ingår i alla sparade adresser och
 * kalenderprenumerationer, så ett nytt id hos NSR är ett nytt format, inte en småsak.
 */
export async function checkNsrSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, baseUrl: NSR_URL, probe }
  try {
    const street = queryFromAddressId(probe)?.query.split(',')[0].trim() ?? probe
    const hits = await nsrSearch(street, fetchFn, TIMEOUT_MS)
    if (hits.length === 0) return { ...base, state: 'tom' }
    const hit = hits.find((h) => edpAddressId(h.building) === probe)
    if (!hit) return { ...base, state: 'nytt-format', error: `Kontrolladressen ${probe} hittades inte (nytt id hos NSR?), bara t.ex. ${edpAddressId(hits[0].building)}` }
    const schedule = await nsrSchedule(hit, fetchFn, TIMEOUT_MS, today)
    const types = [...new Set(hit.pickups.map((p) => p.type))]
    const unknownWasteTypes = classifyWasteTypes(types.map((t) => ({ WasteType: t, Description: /^kärl \d+$/i.test(t) ? 'fyrfack' : '' })))
      .filter((w) => w.status === 'okänd')
      .map((w) => w.wasteType)
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = schedule.events.some((e) => e.date >= today && e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/**
 * SRV: kontrolladressen är ett adress-id med kundnumret. Okända jobb rapporteras också, så att en
 * ny sorts tömning inte försvinner tyst (bara jobb med "tömning" i namnet blir tömningar).
 */
export async function checkSrvSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, baseUrl: SRV_URL, probe }
  try {
    const found = await srvFind(probe, fetchFn, TIMEOUT_MS)
    if (!found) {
      const street = queryFromAddressId(probe)?.query.split(',')[0].trim() ?? probe
      const hits = await srvSearch(street, fetchFn, TIMEOUT_MS)
      if (hits.length === 0) return { ...base, state: 'tom' }
      return { ...base, state: 'nytt-format', error: `Kontrolladressen ${probe} hittades inte (nytt kundnummer hos SRV?), bara t.ex. ${edpAddressId(hits[0].building)}` }
    }
    const types = found.containers.flatMap((c) => {
      const mapped = srvWasteType(c)
      const unknown = mapped?.fractions.includes('karl') && !isKnownBin(mapped.label ?? '')
      if (!unknown) return []
      // "Kärl 2" säger ingenting utan kärltypen.
      return [/^kärl \d+$/i.test(c.contentType.trim()) ? `${c.contentType} (${c.containerType})` : c.contentType]
    })
    const jobs = found.containers.flatMap((c) => c.calendars.map((cal) => cal.jobTemplate)).filter((j) => !isKnownSrvJob(j))
    const unknownWasteTypes = [...new Set([...types, ...jobs.map((j) => `Jobb: ${j}`)])]
    const schedule = srvSchedule(found.containers, today)
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = schedule.events.some((e) => e.date >= today && e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/** Appbolaget: kontrolladressen är ett adress-id med adressens uuid, och kunden anges med sitt Unit. */
export async function checkAppbolagetSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, baseUrl: APPBOLAGET_URL, probe }
  if (source.config.system !== 'appbolaget') throw new Error(`${source.id} är ingen Appbolaget-källa`)
  const { unit } = source.config
  try {
    const found = await appbolagetFind(unit, probe, fetchFn, TIMEOUT_MS)
    if (!found) {
      const street = queryFromAddressId(probe)?.query.split(',')[0].trim() ?? probe
      const hits = await appbolagetSearch(unit, street, fetchFn, TIMEOUT_MS)
      if (hits.length === 0) return { ...base, state: 'tom' }
      return { ...base, state: 'nytt-format', error: `Kontrolladressen ${probe} hittades inte (nytt uuid hos Appbolaget?), bara t.ex. ${edpAddressId(hits[0].building)}` }
    }
    const services = await appbolagetServices(unit, found.propertyIds, fetchFn, TIMEOUT_MS)
    const types = services.filter((s) => !isFee(s)).map(serviceType)
    const unknownWasteTypes = [...new Set(classifyWasteTypes(types.map((t) => ({ WasteType: t.type, Description: t.description }))).filter((w) => w.status === 'okänd').map((w) => w.wasteType))]
    const schedule = scheduleFromServices(services, today)
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = schedule.events.some((e) => e.date >= today && e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/** Borlänge: kontrolladressen är ett adress-id. Ändrade Sitevision-id:n ger 404 från sökningen. Tomma svar blir "inga tömningar". */
export async function checkBorlangeSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, baseUrl: BORLANGE_URL, probe }
  try {
    const found = await borlangeFind(probe, fetchFn, TIMEOUT_MS)
    if (!found) {
      const street = queryFromAddressId(probe)?.query ?? probe
      const hits = await borlangeSearch(street, fetchFn, TIMEOUT_MS)
      if (hits.length === 0) return { ...base, state: 'tom' }
      return { ...base, state: 'nytt-format', error: `Kontrolladressen ${probe} hittades inte (nytt id hos Borlänge Energi?), bara t.ex. ${edpAddressId(hits[0])}` }
    }
    const pickups = await borlangePickups(found.raw, today, fetchFn, TIMEOUT_MS)
    const unknownWasteTypes = [
      ...new Set(
        pickups
          .filter((p) => {
            const mapped = mapWasteType(p.type)
            return mapped?.fractions.includes('karl') && !isKnownBin(mapped.label ?? '')
          })
          .map((p) => p.type),
      ),
    ]
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = borlangeSchedule(pickups, today).events.some((e) => e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/** MSVA: kontrolladressen är ett adress-id. Tomma svar blir "inga tömningar", eftersom källan bara har nästa tömning. */
export async function checkMsvaSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, baseUrl: MSVA_URL, probe }
  try {
    const found = await msvaFind(probe, fetchFn, TIMEOUT_MS)
    if (!found) {
      const street = (queryFromAddressId(probe)?.query ?? probe).split(',')[0]
      const hits = await msvaSearch(street, fetchFn, TIMEOUT_MS)
      if (hits.length === 0) return { ...base, state: 'tom' }
      return { ...base, state: 'nytt-format', error: `Kontrolladressen ${probe} hittades inte (nytt format hos MSVA?), bara t.ex. ${edpAddressId(hits[0].building)}` }
    }
    const unknownWasteTypes = [
      ...new Set(
        found.pickups
          .filter((p) => {
            const mapped = msvaWasteType(p.type)
            return mapped?.fractions.includes('karl') && !isKnownBin(mapped.label ?? '')
          })
          .map((p) => p.type),
      ),
    ]
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = msvaSchedule(found.pickups, today).events.some((e) => e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/** Vakin: kontrolladressen är ett adress-id. Ändrade Sitevision-id:n ger 404 från sökningen. */
export async function checkVakinSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, baseUrl: VAKIN_URL, probe }
  try {
    const found = await vakinFind(probe, fetchFn, TIMEOUT_MS)
    if (!found) {
      const street = queryFromAddressId(probe)?.query ?? probe
      const hits = await vakinSearch(street, fetchFn, TIMEOUT_MS)
      if (hits.length === 0) return { ...base, state: 'tom' }
      return { ...base, state: 'nytt-format', error: `Kontrolladressen ${probe} hittades inte (nytt postnummer hos Vakin?), bara t.ex. ${edpAddressId(hits[0].building)}` }
    }
    const pickups = await vakinPickups(found.params, today, fetchFn, TIMEOUT_MS)
    const unknownWasteTypes = [
      ...new Set(
        pickups
          .flatMap((p) => p.types)
          .filter((type) => {
            const mapped = mapWasteType(type)
            return mapped?.fractions.includes('karl') && !isKnownBin(mapped.label ?? '')
          }),
      ),
    ]
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = vakinSchedule(pickups, today).events.some((e) => e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/** Telge: kontrolladressen är ett adress-id. Fyrfackskärlen är kända, trots att de visas som kärl. */
export async function checkTelgeSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, baseUrl: TELGE_URL, probe }
  try {
    const found = await telgeFind(probe, fetchFn, TIMEOUT_MS)
    if (!found) {
      const street = (queryFromAddressId(probe)?.query ?? probe).split(',')[0]
      const hits = await telgeSearch(street, fetchFn, TIMEOUT_MS)
      if (hits.length === 0) return { ...base, state: 'tom' }
      return { ...base, state: 'nytt-format', error: `Kontrolladressen ${probe} hittades inte (ny text hos Telge?), bara t.ex. ${edpAddressId(hits[0])}` }
    }
    const pickups = await telgePickups(found.raw, fetchFn, TIMEOUT_MS)
    const unknownWasteTypes = [
      ...new Set(
        pickups
          .filter((p) => {
            const mapped = mapWasteType(p.type, '', p.description)
            return !p.description && mapped?.fractions.includes('karl') && !isKnownBin(mapped.label ?? '')
          })
          .map((p) => p.type),
      ),
    ]
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = telgeSchedule(pickups, today).events.some((e) => e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/** Uddevalla: kontrolladressen är ett adress-id. Tomma svar blir "inga tömningar", eftersom källan bara har nästa tömning. */
export async function checkUddevallaSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, baseUrl: UDDEVALLA_URL, probe }
  try {
    const found = await uddevallaFind(probe, fetchFn, TIMEOUT_MS)
    if (!found) {
      const street = queryFromAddressId(probe)?.query ?? probe
      const hits = await uddevallaSearch(street, fetchFn, TIMEOUT_MS)
      if (hits.length === 0) return { ...base, state: 'tom' }
      return { ...base, state: 'nytt-format', error: `Kontrolladressen ${probe} hittades inte (nytt värde hos Uddevalla Energi?), bara t.ex. ${edpAddressId(hits[0].building)}` }
    }
    const pickups = await uddevallaPickups(found.plantNumber, fetchFn, TIMEOUT_MS)
    const unknownWasteTypes = [
      ...new Set(
        pickups
          .filter((p) => {
            const mapped = uddevallaWasteType(p.type)
            return mapped?.fractions.includes('karl') && !mapped.label?.startsWith('Fyrfackskärl') && !isKnownBin(mapped.label ?? '')
          })
          .map((p) => p.type),
      ),
    ]
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = uddevallaSchedule(pickups, today).events.some((e) => e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/** Roslagsvatten: kontrolladressen är ett adress-id. Tomma svar blir "tom", eftersom sökningen svarar likadant vid fel som utan träffar. */
export async function checkRoslagsvattenSource(source: Source, probe: string, today: string, fetchFn: typeof fetch = fetch): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, baseUrl: ROSLAGSVATTEN_URL, probe }
  if (source.config.system !== 'roslagsvatten') return { ...base, state: 'nytt-format', error: 'Fel källtyp' }
  const { municipality } = source.config
  try {
    const found = await roslagsvattenFind(municipality, probe, fetchFn, TIMEOUT_MS)
    if (!found) {
      const street = queryFromAddressId(probe)?.query ?? probe
      const hits = await roslagsvattenSearch(municipality, street, fetchFn, TIMEOUT_MS)
      if (hits.length === 0) return { ...base, state: 'tom' }
      return { ...base, state: 'nytt-format', error: `Kontrolladressen ${probe} hittades inte (nytt värde hos Roslagsvatten?), bara t.ex. ${edpAddressId(hits[0].building)}` }
    }
    const pickups = await roslagsvattenPickups(municipality, found.buildingId, fetchFn, TIMEOUT_MS)
    const unknownWasteTypes = [
      ...new Set(
        pickups
          .filter((p) => {
            const mapped = mapWasteType(p.type, p.frequency)
            return mapped?.fractions.includes('karl') && !mapped.label?.startsWith('Fyrfackskärl') && !isKnownBin(mapped.label ?? '')
          })
          .map((p) => p.type),
      ),
    ]
    const end = addDays(today, HORIZON_DAYS)
    const upcoming = roslagsvattenSchedule(pickups, today).events.some((e) => e.date <= end)
    return { ...base, state: upcoming ? 'fungerar' : 'inga-tomningar', unknownWasteTypes }
  } catch (error) {
    return { ...base, state: stateForError(error), error: (error as Error).message }
  }
}

/**
 * Fel som kan bero på varifrån anropet görs. Vissa kommuners brandväggar stänger ute GitHubs
 * datacenter, antingen helt eller med en spärrsida i HTML, men släpper fram sajten.
 */
export function unreachableFromHere(r: SourceResult): boolean {
  return r.state === 'svarar-inte' || (r.state === 'nytt-format' && /svarade inte med (JSON|ICS)/.test(r.error ?? ''))
}

/**
 * Samma kontroll via sajtens publika API, alltså från sajtens servrar. En unik parameter går förbi
 * CDN-cachen, så att svaret är färskt. Sajten visar inte källans råa svar, så avfallstyperna är okända.
 */
export async function checkViaSite(
  source: Source,
  probe: string,
  today: string,
  fetchFn: typeof fetch = fetch,
  siteUrl = SITE_URL,
): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name, via: 'sajten' as const }
  const kontroll = String(Date.now())
  try {
    const search = new URL('/api/v1/sok', siteUrl)
    search.search = new URLSearchParams({ q: probe, kalla: source.id, kontroll }).toString()
    const found = await fetchJson<{ addresses: { url: string }[]; failed: string[] }>(search.toString(), {}, { fetchFn, timeoutMs: TIMEOUT_MS })
    if (found.failed.includes(source.id)) return { ...base, state: 'svarar-inte', error: 'Sajten fick inget svar från källan' }
    if (found.addresses.length === 0) return { ...base, state: 'tom' }

    const address = new URL(found.addresses[0].url)
    address.searchParams.set('kontroll', kontroll)
    const { events } = await fetchJson<{ events: { date: string }[] }>(address.toString(), {}, { fetchFn, timeoutMs: TIMEOUT_MS })
    const end = addDays(today, HORIZON_DAYS)
    return { ...base, state: events.some((e) => e.date >= today && e.date <= end) ? 'fungerar' : 'inga-tomningar' }
  } catch (error) {
    return { ...base, state: 'svarar-inte', error: (error as Error).message }
  }
}

/** Statiska källor anropar ingenting; det som kan gå fel är att datafilerna tar slut. */
export function checkStaticSource(source: Source, validTo: string[], today: string): SourceResult {
  const last = [...validTo].sort().at(-1)
  const ending = !last || last < addDays(today, HORIZON_DAYS)
  return {
    sourceId: source.id,
    name: source.name,
    state: ending ? 'schemat-tar-slut' : 'fungerar',
    ...(ending && { error: last ? `Schemat gäller till ${last}` : 'Inga datafiler' }),
  }
}
