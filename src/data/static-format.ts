// Filformatet för den statiska providern: källfilerna i data/<kommun>/<år>/
// och de genererade filerna i public/. Används av build-skriptet och providern.

import { isValidDate } from '@/domain/dates'
import { isFractionId } from '@/domain/fractions'
import { buildIcs } from '@/domain/ics'
import { mergeParts } from '@/domain/schedule'
import type { Area, Bin, PickupEvent, SchedulePart } from '@/domain/types'
import type { Source } from '@/sources'

export class DataError extends Error {
  name = 'DataError'
}

export interface SchedulesFile {
  year: number
  source: string
  validFrom: string
  validTo: string
  updatedAt: string
  note?: string
  schedules: Record<string, { name: string; bins?: Bin[]; events: PickupEvent[] }>
}

export interface AddressRow {
  id: string
  street: string
  locality: string
  schedule: string
}

/** Ett område i data/<kommun>/<år>/omraden.json */
export interface AreaRow {
  id: string
  name: string
  day: string
  label: string
  schedule: string
  places: string[]
  streets: string[]
  searchTerms: string[]
  otherDays: string[]
}

/** data/<kommun>/<år>/omraden.json */
export interface AreasFile {
  explanation: string
  help: string
  areas: AreaRow[]
}

/** public/data/<kommun>/omraden.json */
export interface AreasIndexFile {
  explanation: string
  help: string
  areas: Area[]
}

/** public/data/<kommun>/addresses.json. Ett område är en rad med tom ort och ett femte element. */
export interface AddressIndexFile {
  sourceId: string
  updatedAt: string
  addresses: [
    id: string,
    street: string,
    locality: string,
    scheduleRefs: string[],
    area?: { detail: string; searchTerms: string[] },
  ][]
}

/** public/data/<kommun>/schedules/<ref>.json */
export type ScheduleFile = SchedulePart & { id: string }

const ADDRESS_COLUMNS = ['id', 'street', 'locality', 'schedule'] as const

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (c === '"') quoted = false
      else current += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      fields.push(current)
      current = ''
    } else current += c
  }
  fields.push(current)
  return fields.map((f) => f.trim())
}

export function parseAddressesCsv(text: string, file: string): AddressRow[] {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line, i) => ({ line, no: i + 1 }))
    .filter(({ line }) => line.trim() !== '' && !line.startsWith('#'))
  if (lines.length === 0) throw new DataError(`${file}: filen är tom`)

  const header = parseCsvLine(lines[0].line)
  for (const col of ADDRESS_COLUMNS) {
    if (!header.includes(col)) throw new DataError(`${file}: kolumnen "${col}" saknas`)
  }

  return lines.slice(1).map(({ line, no }) => {
    const fields = parseCsvLine(line)
    const row = Object.fromEntries(ADDRESS_COLUMNS.map((col) => [col, fields[header.indexOf(col)] ?? '']))
    for (const col of ADDRESS_COLUMNS) {
      if (!row[col]) throw new DataError(`${file} rad ${no}: "${col}" är tom`)
    }
    return row as unknown as AddressRow
  })
}

function fail(file: string, message: string): never {
  throw new DataError(`${file}: ${message}`)
}

export function parseSchedulesFile(json: unknown, file: string): SchedulesFile {
  const data = json as SchedulesFile
  if (typeof data !== 'object' || data === null) fail(file, 'ogiltig JSON')
  for (const key of ['validFrom', 'validTo', 'updatedAt'] as const) {
    if (typeof data[key] !== 'string' || !isValidDate(data[key])) fail(file, `"${key}" saknas eller är inget giltigt datum`)
  }
  if (typeof data.schedules !== 'object' || data.schedules === null) fail(file, '"schedules" saknas')
  if (data.validFrom > data.validTo) fail(file, `validFrom (${data.validFrom}) ligger efter validTo (${data.validTo})`)

  for (const [name, schedule] of Object.entries(data.schedules)) {
    if (!Array.isArray(schedule.events)) fail(file, `schema "${name}" saknar "events"`)
    if (schedule.events.length === 0) fail(file, `schema "${name}" har inga tömningar`)
    for (const event of schedule.events) {
      if (!isValidDate(event.date)) fail(file, `schema "${name}": ogiltigt datum "${event.date}"`)
      if (event.date < data.validFrom || event.date > data.validTo) {
        fail(file, `schema "${name}": ${event.date} ligger utanför giltighetsperioden ${data.validFrom}–${data.validTo}`)
      }
      if (!Array.isArray(event.fractions) || event.fractions.length === 0) {
        fail(file, `schema "${name}" ${event.date}: inga fraktioner`)
      }
      for (const f of event.fractions) {
        if (!isFractionId(f)) fail(file, `schema "${name}" ${event.date}: okänd fraktion "${f}"`)
      }
      if (event.deviation?.originalDate && !isValidDate(event.deviation.originalDate)) {
        fail(file, `schema "${name}" ${event.date}: ogiltigt originalDate`)
      }
    }
    for (const bin of schedule.bins ?? []) {
      if (!isFractionId(bin.fraction)) fail(file, `schema "${name}": okänd fraktion "${bin.fraction}" i bins`)
    }
  }
  return data
}

const AREA_LISTS = ['places', 'streets', 'searchTerms', 'otherDays'] as const

export function parseAreasFile(json: unknown, file: string): AreasFile {
  const data = json as AreasFile
  if (typeof data !== 'object' || data === null) fail(file, 'ogiltig JSON')
  for (const key of ['explanation', 'help'] as const) {
    if (typeof data[key] !== 'string' || data[key].trim() === '') fail(file, `"${key}" saknas`)
  }
  if (!Array.isArray(data.areas) || data.areas.length === 0) fail(file, '"areas" saknas eller är tom')

  const seen = new Set<string>()
  for (const [i, area] of data.areas.entries()) {
    const who = typeof area?.id === 'string' && area.id ? `område "${area.id}"` : `område nr ${i + 1}`
    if (typeof area?.id !== 'string' || area.id.trim() === '') fail(file, `${who}: "id" saknas`)
    // Samma namn som filen med områdena, så att id:t aldrig krockar med en adress-URL.
    if (area.id === 'omraden') fail(file, `${who}: "omraden" är reserverat`)
    if (seen.has(area.id)) fail(file, `dubblett av område-id "${area.id}"`)
    seen.add(area.id)
    for (const key of ['name', 'day', 'label', 'schedule'] as const) {
      if (typeof area[key] !== 'string' || area[key].trim() === '') fail(file, `${who}: "${key}" saknas eller är tom`)
    }
    for (const key of AREA_LISTS) {
      if (!Array.isArray(area[key]) || area[key].some((v) => typeof v !== 'string')) {
        fail(file, `${who}: "${key}" ska vara en lista med text`)
      }
    }
  }
  return data
}

const unique = (values: string[]) => [...new Set(values)]

export function buildMunicipality(
  years: { year: number; schedules: SchedulesFile; addresses: AddressRow[]; areas?: AreasFile }[],
  source: Source,
): {
  index: AddressIndexFile
  areas?: AreasIndexFile
  scheduleFiles: ScheduleFile[]
  ics: { addressId: string; content: string }[]
} {
  const sorted = [...years].sort((a, b) => a.year - b.year)
  const scheduleFiles = new Map<string, ScheduleFile>()
  const addresses = new Map<
    string,
    { street: string; locality: string; refs: string[]; area?: { detail: string; searchTerms: string[] } }
  >()
  const areas = new Map<string, Area>()
  let areasText: Pick<AreasFile, 'explanation' | 'help'> | undefined

  for (const { year, schedules, addresses: rows, areas: areaFile } of sorted) {
    for (const [name, s] of Object.entries(schedules.schedules)) {
      const id = `${year}-${name}`
      scheduleFiles.set(id, {
        id,
        validFrom: schedules.validFrom,
        validTo: schedules.validTo,
        updatedAt: schedules.updatedAt,
        note: schedules.note,
        bins: s.bins ?? [],
        events: s.events,
      })
    }

    const seen = new Set<string>()
    for (const row of rows) {
      if (seen.has(row.id)) throw new DataError(`${year}/addresses.csv: dubblett av adress-id "${row.id}"`)
      seen.add(row.id)
      if (!schedules.schedules[row.schedule]) {
        throw new DataError(`${year}/addresses.csv: "${row.id}" pekar på schemat "${row.schedule}" som saknas`)
      }
      const existing = addresses.get(row.id)
      addresses.set(row.id, {
        street: row.street,
        locality: row.locality,
        refs: [...(existing?.refs ?? []), `${year}-${row.schedule}`],
      })
    }

    if (areaFile) {
      areasText = { explanation: areaFile.explanation, help: areaFile.help }
      const owner = new Map<string, string>()
      for (const row of areaFile.areas) {
        const schedule = schedules.schedules[row.schedule]
        if (!schedule) {
          throw new DataError(`${year}/omraden.json: "${row.id}" pekar på schemat "${row.schedule}" som saknas`)
        }
        for (const { date } of schedule.events) {
          const other = owner.get(date)
          if (other && other !== row.id) {
            throw new DataError(`${year}/omraden.json: ${date} finns i både "${other}" och "${row.id}"`)
          }
          owner.set(date, row.id)
        }
        const searchTerms = unique([...row.places, ...row.streets, ...row.searchTerms])
        const existing = areas.get(row.id)
        areas.set(row.id, {
          id: row.id,
          name: row.name,
          day: row.day,
          label: row.label,
          places: row.places,
          otherDays: row.otherDays,
          searchTerms,
          dates: [...(existing?.dates ?? []), ...schedule.events.map((e) => e.date)].sort(),
        })
        const prev = addresses.get(row.id)
        addresses.set(row.id, {
          street: row.name,
          locality: '',
          refs: [...(prev?.refs ?? []), `${year}-${row.schedule}`],
          area: { detail: `${row.day} · ${row.label}`, searchTerms },
        })
      }
    }
  }

  const index: AddressIndexFile = {
    sourceId: source.id,
    updatedAt: sorted.map((y) => y.schedules.updatedAt).sort().at(-1) ?? '',
    addresses: [...addresses.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, a]) => (a.area ? [id, a.street, a.locality, a.refs, a.area] : [id, a.street, a.locality, a.refs])),
  }

  const ics = [...addresses.entries()].map(([id, a]) => ({
    addressId: id,
    content: buildIcs({
      address: { id, street: a.street, locality: a.locality, sourceId: source.id, kommun: source.kommuner[0]?.name ?? source.name },
      kommunName: source.kommuner[0]?.name ?? source.name,
      schedule: mergeParts(a.refs.map((ref) => scheduleFiles.get(ref)!)),
    }),
  }))

  return {
    index,
    ...(areasText && { areas: { ...areasText, areas: [...areas.values()].sort((a, b) => a.id.localeCompare(b.id)) } }),
    scheduleFiles: [...scheduleFiles.values()],
    ics,
  }
}
