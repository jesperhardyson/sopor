// Filformatet för den statiska providern: källfilerna i data/<kommun>/<år>/
// och de genererade filerna i public/. Används av build-skriptet och providern.

import { isValidDate } from '@/domain/dates'
import { isFractionId } from '@/domain/fractions'
import { buildIcs } from '@/domain/ics'
import { mergeParts } from '@/domain/schedule'
import type { Bin, PickupEvent, SchedulePart } from '@/domain/types'
import type { Municipality } from '@/municipalities'

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

/** public/data/<kommun>/addresses.json */
export interface AddressIndexFile {
  municipalityId: string
  updatedAt: string
  addresses: [id: string, street: string, locality: string, scheduleRefs: string[]][]
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

  for (const [name, schedule] of Object.entries(data.schedules)) {
    if (!Array.isArray(schedule.events)) fail(file, `schema "${name}" saknar "events"`)
    for (const event of schedule.events) {
      if (!isValidDate(event.date)) fail(file, `schema "${name}": ogiltigt datum "${event.date}"`)
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

export function buildMunicipality(
  years: { year: number; schedules: SchedulesFile; addresses: AddressRow[] }[],
  municipality: Municipality,
): {
  index: AddressIndexFile
  scheduleFiles: ScheduleFile[]
  ics: { addressId: string; content: string }[]
} {
  const sorted = [...years].sort((a, b) => a.year - b.year)
  const scheduleFiles = new Map<string, ScheduleFile>()
  const addresses = new Map<string, { street: string; locality: string; refs: string[] }>()

  for (const { year, schedules, addresses: rows } of sorted) {
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
  }

  const index: AddressIndexFile = {
    municipalityId: municipality.id,
    updatedAt: sorted.map((y) => y.schedules.updatedAt).sort().at(-1) ?? '',
    addresses: [...addresses.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, a]) => [id, a.street, a.locality, a.refs]),
  }

  const ics = [...addresses.entries()].map(([id, a]) => ({
    addressId: id,
    content: buildIcs({
      address: { id, street: a.street, locality: a.locality, municipalityId: municipality.id },
      municipalityName: municipality.name,
      schedule: mergeParts(a.refs.map((ref) => scheduleFiles.get(ref)!)),
    }),
  }))

  return { index, scheduleFiles: [...scheduleFiles.values()], ics }
}
