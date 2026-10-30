import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

interface Rule {
  source: string
  headers?: { key: string; value: string }[]
  destination?: string
}

const config = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../vercel.json'), 'utf8')) as {
  headers: Rule[]
  rewrites: Rule[]
}

const header = (source: string, key: string) =>
  config.headers.find((h) => h.source === source)?.headers?.find((h) => h.key === key)?.value

describe('vercel.json', () => {
  it('serverar kalenderfiler som text/calendar med cache', () => {
    expect(header('/ics/(.*)', 'Content-Type')).toBe('text/calendar; charset=utf-8')
    expect(header('/ics/(.*)', 'Cache-Control')).toBe('public, max-age=3600, s-maxage=86400')
  })

  it('cachar datafiler kort', () => {
    expect(header('/data/(.*)', 'Cache-Control')).toBe('public, max-age=300, s-maxage=3600')
  })

  it('skickar appens sidor till index.html men inte data, ics eller assets', () => {
    const rewrite = config.rewrites.find((r) => r.destination === '/index.html')!
    const re = new RegExp(`^${rewrite.source}$`)
    for (const p of ['/avesta/krylbo-storgatan-12b', '/om', '/']) expect(re.test(p)).toBe(true)
    for (const p of ['/ics/avesta/x.ics', '/data/avesta/addresses.json', '/assets/x.js']) expect(re.test(p)).toBe(false)
  })
})
