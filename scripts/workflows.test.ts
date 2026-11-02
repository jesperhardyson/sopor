import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = path.resolve(import.meta.dirname, '../.github/workflows')
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml'))

/** Jobbens namn: rader med två blanksteg, namn och kolon direkt under `jobs:`. */
function jobNames(yaml: string): string[] {
  const block = yaml.match(/^jobs:\n((?:[ \t].*\n|\n)*)/m)?.[1] ?? ''
  return [...block.matchAll(/^ {2}([\w-]+):/gm)].map((m) => m[1])
}

// `test` är den obligatoriska checken för main. Ett jobb med samma namn i ett annat arbetsflöde
// skulle kunna uppfylla kravet utan att sajtens tester har körts.
describe('arbetsflödena', () => {
  it.each(files)('%s har inget jobb som heter test, utom ci.yml', (file) => {
    const jobs = jobNames(fs.readFileSync(path.join(dir, file), 'utf8'))
    expect(jobs.length).toBeGreaterThan(0)
    if (file === 'ci.yml') expect(jobs).toContain('test')
    else expect(jobs).not.toContain('test')
  })
})
