import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')
const config = JSON.parse(read('vercel.json')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
  rewrites: { source: string; destination: string }[]
}
const headers = (source: string) => Object.fromEntries(config.headers.find((h) => h.source === source)?.headers.map((h) => [h.key, h.value]) ?? [])

// Inbjudningarna till ett hushåll i appen Sophämtning. Delen efter # är hemlig, och ingen kod på sidan får kunna läsa den.
describe('Länkar till hushåll', () => {
  it('öppnar appen bara för /hushall', () => {
    const file = JSON.parse(read('public/.well-known/apple-app-site-association'))
    expect(file).toEqual({ applinks: { details: [{ appIDs: ['4WZU5V58ZG.se.hardyson.sophamtning'], components: [{ '/': '/hushall' }, { '/': '/hushall/' }] }] } })
    expect(headers('/.well-known/apple-app-site-association')['Content-Type']).toBe('application/json')
  })

  it('har en sida utan skript, som bara får ladda sin egen stil', () => {
    const html = read('public/hushall/index.html')
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/\son[a-z]+=/i)
    expect(html).not.toMatch(/<(img|link|iframe|form)\b/i)
    expect(headers('/hushall')['Content-Security-Policy']).toBe("default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
    expect(headers('/hushall')['Referrer-Policy']).toBe('no-referrer')
    expect(headers('/hushall')['X-Robots-Tag']).toBe('noindex')
  })

  it('säger att det är en inbjudan och att länken öppnas igen i appen', () => {
    const html = read('public/hushall/index.html')
    expect(html).toContain('<html lang="sv">')
    expect(html).toContain('Du är inbjuden till ett hushåll')
    expect(html).toContain('öppna sedan länken i inbjudan igen')
    expect(html).toContain('https://apps.apple.com/')
  })

  it('skickas till sin statiska fil, före regeln till index.html', () => {
    const index = config.rewrites.findIndex((r) => r.source === '/hushall' && r.destination === '/hushall/index.html')
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(config.rewrites.findIndex((r) => r.destination === '/index.html'))
    expect(existsSync(path.join(root, 'public/hushall/index.html'))).toBe(true)
  })

  it('får inte den vanliga CSP:n, eftersom två regler annars slås ihop', () => {
    const general = config.headers.find((h) => h.source.startsWith('/((?!api/|ics/|data/'))!
    const re = new RegExp(`^${general.source}$`)
    expect(re.test('/hushall')).toBe(false)
    for (const p of ['/', '/om', '/uppsala/storgatan-2', '/kommuner']) expect(re.test(p), p).toBe(true)
  })
})
