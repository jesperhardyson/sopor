import { createHash } from 'node:crypto'
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

  it('cachar byggets filer för alltid, eftersom namnen byts när innehållet ändras', () => {
    expect(header('/assets/(.*)', 'Cache-Control')).toBe('public, max-age=31536000, immutable')
  })

  it('skickar appens sidor till index.html men inte data, ics eller assets', () => {
    const rewrite = config.rewrites.find((r) => r.destination === '/index.html')!
    const re = new RegExp(`^${rewrite.source}$`)
    for (const p of ['/avesta/krylbo-storgatan-12b', '/om', '/']) expect(re.test(p)).toBe(true)
    for (const p of ['/ics/avesta/x.ics', '/data/avesta/addresses.json', '/assets/x.js', '/api/sok', '/api/v1/kallor']) {
      expect(re.test(p)).toBe(false)
    }
  })

  it('skickar kommunsidorna till sina statiska filer, före regeln till index.html', () => {
    const index = (source: string, destination: string) => config.rewrites.findIndex((r) => r.source === source && r.destination === destination)
    const app = config.rewrites.findIndex((r) => r.destination === '/index.html')
    expect(index('/kommuner', '/kommuner/index.html')).toBeGreaterThanOrEqual(0)
    expect(index('/kommuner', '/kommuner/index.html')).toBeLessThan(app)
    expect(index('/kommuner/:slug', '/kommuner/:slug/index.html')).toBeGreaterThanOrEqual(0)
    expect(index('/kommuner/:slug', '/kommuner/:slug/index.html')).toBeLessThan(app)
  })

  it('låter en okänd kommun ge 404, genom att inte fånga den i regeln till index.html', () => {
    const app = config.rewrites.find((r) => r.destination === '/index.html')!
    expect(new RegExp(`^${app.source}$`).test('/kommuner/finns-inte')).toBe(false)
  })

  it('håller adressidor borta från sökmotorerna men inte kommunsidorna', () => {
    const rule = config.headers.find((h) => h.headers?.some((x) => x.key === 'X-Robots-Tag' && x.value === 'noindex'))!
    const re = new RegExp(`^${rule.source}$`)
    expect(re.test('/uppsala/storgatan-2_uppsala-4004688')).toBe(true)
    for (const p of ['/kommuner/uppsala-kommun', '/kommuner', '/om', '/', '/api/v1/kallor', '/ics/uppsala/x.ics', '/data/gator/st.json', '/assets/x.js']) {
      expect(re.test(p), p).toBe(false)
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

  it('skickar säkerhetsheaders för alla svar', () => {
    expect(header('/(.*)', 'X-Content-Type-Options')).toBe('nosniff')
    expect(header('/(.*)', 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(header('/(.*)', 'Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()')
  })

  describe('Content-Security-Policy', () => {
    const rule = config.headers.find((h) => h.headers?.some((x) => x.key === 'Content-Security-Policy'))!
    const csp = rule.headers!.find((h) => h.key === 'Content-Security-Policy')!.value

    it('gäller appens sidor men inte API-dokumentationen, som hämtar Scalar från ett CDN', () => {
      const re = new RegExp(`^${rule.source}$`)
      for (const p of ['/', '/om', '/uppsala/storgatan-2_uppsala-4004688']) expect(re.test(p)).toBe(true)
      for (const p of ['/api/v1/docs/', '/api/v1/kallor', '/ics/uppsala/x.ics', '/data/orter.json']) expect(re.test(p)).toBe(false)
    })

    it('tillåter tema- och textskriptet i index.html, och bara dem, med deras hashar', () => {
      const html = readFileSync(path.resolve(import.meta.dirname, '../index.html'), 'utf8')
      const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
      expect(inline).toHaveLength(2)
      const hashes = inline.map((code) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`)
      expect(csp).toContain(`script-src 'self' ${hashes.join(' ')};`)
      expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
    })

    it('tillåter typsnitt som Vite bäddar in som data:-adresser', () => {
      expect(csp).toContain("font-src 'self' data:")
    })

    it('låser sidan till egna filer och kan inte bäddas in', () => {
      for (const part of ["default-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"]) {
        expect(csp).toContain(part)
      }
    })
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
