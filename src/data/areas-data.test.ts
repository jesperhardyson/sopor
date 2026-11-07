import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AreasFile } from './static-format'

const files = readdirSync('data', { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('omraden.json'))
  .map((f) => ({ file: f, data: JSON.parse(readFileSync(`data/${f}`, 'utf8')) as AreasFile }))

describe('områdesfilerna', () => {
  it('kallar etiketten område, som webben och API:t gör', () => {
    for (const { file, data } of files) {
      for (const a of data.areas) if (a.label !== undefined) expect(a.label, `${file}: ${a.id}`).toMatch(/^Område \S+$/)
    }
  })

  it('behåller Avestas id och låter Avestas eget ord trakt gå att söka på', () => {
    const avesta = files.find((f) => f.file.startsWith('avesta'))!.data.areas
    expect(avesta.length).toBeGreaterThan(0)
    for (const a of avesta) {
      const n = a.id.replace('trakt-', '')
      expect(a.id).toMatch(/^trakt-\d+$/)
      expect(a.searchTerms).toContain(`trakt ${n}`)
    }
  })
})
