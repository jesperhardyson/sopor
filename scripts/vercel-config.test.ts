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
    for (const p of ['/ics/avesta/x.ics', '/data/avesta/addresses.json', '/assets/x.js', '/api/sok']) {
      expect(re.test(p)).toBe(false)
    }
  })

  it('skickar kalenderfiler som inte finns statiskt till api/ics', () => {
    const rewrite = config.rewrites.find((r) => r.source === '/ics/:source/:file')
    expect(rewrite?.destination).toBe('/api/ics?source=:source&file=:file')
  })
})

describe('Vercel-funktionernas importer', () => {
  it('använder bara relativa sökvägar i kod som funktionerna når (Vercel känner inte till @/)', async () => {
    const { readdirSync } = await import('node:fs')
    const root = path.resolve(import.meta.dirname, '..')
    const dirs = ['api', 'src/server', 'src/domain', 'src/sources']
    const offenders = dirs.flatMap((d) =>
      readdirSync(path.join(root, d))
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .filter((f) => readFileSync(path.join(root, d, f), 'utf8').includes("from '@/"))
        .map((f) => `${d}/${f}`),
    )
    expect(offenders).toEqual([])
  })

  it('har filändelsen .js på relativa importer (Node ESM på Vercel kräver det)', async () => {
    const { readdirSync } = await import('node:fs')
    const root = path.resolve(import.meta.dirname, '..')
    const dirs = ['api', 'src/server', 'src/domain', 'src/sources']
    const offenders = dirs.flatMap((d) =>
      readdirSync(path.join(root, d))
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .flatMap((f) =>
          [...readFileSync(path.join(root, d, f), 'utf8').matchAll(/from '(\.{1,2}\/[^']+)'/g)]
            .map((m) => m[1])
            .filter((spec) => !spec.endsWith('.js'))
            .map((spec) => `${d}/${f}: ${spec}`),
        ),
    )
    expect(offenders).toEqual([])
  })
})
