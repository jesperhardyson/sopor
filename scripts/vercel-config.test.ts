import { readdirSync, readFileSync } from 'node:fs'
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
  it('hoppar över Vercel-bygget för Dependabots grenar men bygger allt annat', async () => {
    const { execFileSync } = await import('node:child_process')
    const cmd = (config as unknown as { ignoreCommand: string }).ignoreCommand
    // Vercel: exit 0 = hoppa över bygget, exit 1 = bygg
    const skips = (ref: string) => {
      try {
        execFileSync('sh', ['-c', cmd], { env: { ...process.env, VERCEL_GIT_COMMIT_REF: ref } })
        return true
      } catch {
        return false
      }
    }
    expect(skips('dependabot/npm_and_yarn/beroenden-1')).toBe(true)
    expect(skips('main')).toBe(false)
    expect(skips('ci-skydd')).toBe(false)
  })

  it('kör testerna innan bygget så att röda tester aldrig når produktion', () => {
    expect((config as unknown as { buildCommand: string }).buildCommand).toBe('npm test && npm run build')
  })

  it('kör funktionerna i Stockholm, nära källorna', () => {
    expect((config as unknown as { regions: string[] }).regions).toEqual(['arn1'])
  })

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
    for (const p of ['/ics/avesta/x.ics', '/data/avesta/addresses.json', '/assets/x.js', '/api/sok', '/api/v1/kallor']) {
      expect(re.test(p)).toBe(false)
    }
  })

  it('skickar kalenderfiler som inte finns statiskt till api/ics', () => {
    const rewrite = config.rewrites.find((r) => r.source === '/ics/:source/:file')
    expect(rewrite?.destination).toBe('/api/ics?source=:source&file=:file')
  })

  it('skickar v1-adresser till api/v1/adress och okända v1-sökvägar till api/v1/okand', () => {
    const adress = config.rewrites.findIndex(
      (r) => r.source === '/api/v1/adress/:source/:id' && r.destination === '/api/v1/adress?source=:source&id=:id',
    )
    const okand = config.rewrites.findIndex((r) => r.source === '/api/v1/:path*' && r.destination === '/api/v1/okand')
    expect(adress).toBeGreaterThanOrEqual(0)
    expect(okand).toBeGreaterThan(adress)
  })

  it('tillåter alla ursprung för API-beskrivningen', () => {
    expect(header('/api/v1/openapi.json', 'Access-Control-Allow-Origin')).toBe('*')
  })
})

/** Kod som Vercel-funktionerna når: hela kataloger plus enstaka filer. */
const root = path.resolve(import.meta.dirname, '..')
const dirs = ['api', 'api/v1', 'src/server', 'src/domain', 'src/sources']
const extraFiles = ['src/data/street-index.ts']
const functionFiles = () =>
  [
    ...dirs.flatMap((d) =>
      readdirSync(path.join(root, d))
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .map((f) => `${d}/${f}`),
    ),
    ...extraFiles,
  ].map((file) => ({ file, text: readFileSync(path.join(root, file), 'utf8') }))

describe('Vercel-funktionernas importer', () => {
  it('använder bara relativa sökvägar i kod som funktionerna når (Vercel känner inte till @/)', () => {
    const offenders = functionFiles()
      .filter(({ text }) => text.includes("from '@/"))
      .map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  it('har filändelsen .js på relativa importer (Node ESM på Vercel kräver det)', () => {
    const offenders = functionFiles().flatMap(({ file, text }) =>
      [...text.matchAll(/from '(\.{1,2}\/[^']+)'/g)]
        .map((m) => m[1])
        .filter((spec) => !spec.endsWith('.js'))
        .map((spec) => `${file}: ${spec}`),
    )
    expect(offenders).toEqual([])
  })
})
