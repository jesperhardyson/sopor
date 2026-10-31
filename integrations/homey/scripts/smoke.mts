// npm run smoke: kör appens egen klient mot produktions-API:t, så att en ändring i API:t
// som bryter appen märks direkt. En källa som inte svarar är en varning, inte ett fel.

import { createClient, SoporError, type SoporSchedule } from '../lib/api.mjs'
import { todayInStockholm } from '../lib/dates.mjs'
import { parseQuery, searchOutcome } from '../lib/pairing.mjs'
import { summary } from '../lib/schedule.mjs'
import { widgetRows } from '../lib/widget.mjs'

/** En EDP-källa (Uppsala) och en statisk (Borås). */
const QUERIES = ['Storgatan 2, Uppsala', 'Storgatan 3, Dalsjöfors']
const DATE = /^\d{4}-\d{2}-\d{2}$/

const client = createClient({ fetch, userAgent: 'Sopor-Homey/smoke (+https://sopor.hardyson.se)' })
const errors: string[] = []

function rowCount(s: SoporSchedule): string {
  const n = widgetRows(s, todayInStockholm()).length
  return `${n} ${n === 1 ? 'rad' : 'rader'} i widgeten`
}

function shapeProblems(s: SoporSchedule): string[] {
  const problems: string[] = []
  if (s.apiVersion !== '1') problems.push(`apiVersion är ${s.apiVersion}`)
  if (!DATE.test(s.today)) problems.push(`today är ${s.today}`)
  if (!Array.isArray(s.events)) return [...problems, 'events saknas']
  for (const e of s.events) {
    if (!DATE.test(e.date) || !Array.isArray(e.fractions)) problems.push(`trasig händelse ${JSON.stringify(e)}`)
  }
  for (const [id, f] of Object.entries(s.fractions ?? {})) {
    if (!f.name || !f.short || !f.color || !f.icon) problems.push(`fraktionen ${id} saknar fält`)
  }
  return problems
}

for (const input of QUERIES) {
  try {
    const { q, place } = parseQuery(input)
    const outcome = searchOutcome(await client.search(q), place)
    if (outcome.result === 'failed') {
      console.log(`::warning::${input}: källan svarade inte`)
      continue
    }
    if (outcome.result !== 'found') {
      errors.push(`${input}: sökningen gav ${outcome.result}`)
      continue
    }
    const schedule = await client.schedule(outcome.hits[0].url)
    const problems = shapeProblems(schedule)
    if (problems.length) errors.push(...problems.map((p) => `${input}: ${p}`))
    else console.log(`✓ ${input}: ${summary(schedule, todayInStockholm())}, ${rowCount(schedule)}`)
  } catch (error) {
    if (error instanceof SoporError && (error.status === 502 || error.status === 0)) console.log(`::warning::${input}: ${error.message}`)
    else errors.push(`${input}: ${(error as Error).message}`)
  }
}

for (const error of errors) console.error(`✖ ${error}`)
if (errors.length) process.exit(1)
