import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { KommunPage } from '@/data/kommun-pages'
import { embeddedData } from '@/ui/kommun/embedded'
import { renderKommunerHtml, renderKommunHtml, renderPrivacyHtml, sitemapXml } from './prerender'

const root = path.resolve(import.meta.dirname, '..')
const template = readFileSync(path.join(root, 'index.html'), 'utf8')

const uppsala: KommunPage = {
  code: '0380',
  name: 'Uppsala kommun',
  slug: 'uppsala-kommun',
  covered: true,
  sources: [{ name: 'Uppsala Vatten', url: 'https://www.uppsalavatten.se' }],
  orter: ['Uppsala', 'Storvreta'],
}
const goteborg: KommunPage = { code: '1480', name: 'Göteborgs kommun', slug: 'goteborgs-kommun', covered: false, sources: [], orter: ['Göteborg'] }

const meta = (html: string, attr: string) => html.match(new RegExp(`<meta ${attr} content="([^"]*)"`))?.[1]
const rootContent = (html: string) => html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script type="application\/json"/)?.[1] ?? ''

describe('renderKommunHtml', () => {
  const html = renderKommunHtml(template, uppsala)

  it('sätter titel och beskrivning för en kommun som finns', () => {
    expect(html).toContain('<title>Sophämtning i Uppsala kommun – Sopor</title>')
    expect(meta(html, 'property="og:title"')).toBe('Sophämtning i Uppsala kommun – Sopor')
    const description = 'Se när dina kärl töms i Uppsala kommun och lägg schemat i kalendern. Inofficiell tjänst.'
    expect(meta(html, 'name="description"')).toBe(description)
    expect(meta(html, 'property="og:description"')).toBe(description)
  })

  it('anger sidans egen adress', () => {
    const url = 'https://sopor.hardyson.se/kommuner/uppsala-kommun'
    expect(meta(html, 'property="og:url"')).toBe(url)
    expect(html).toContain(`<link rel="canonical" href="${url}" />`)
  })

  it('har innehållet i HTML:en och ett vilande sökfält', () => {
    const content = rootContent(html)
    expect(content).toContain('Sophämtning i Uppsala kommun')
    expect(content).toContain('Storvreta')
    expect(content).toMatch(/<input[^>]*disabled/)
  })

  it('har en annan beskrivning för en kommun som saknas', () => {
    expect(meta(renderKommunHtml(template, goteborg), 'name="description"')).toBe(
      'Sopor finns inte i Göteborgs kommun än. Tipsa om var kommunen publicerar sitt hämtschema.',
    )
  })

  it('behåller mallens skript oförändrade', () => {
    const scripts = (s: string) => [...s.matchAll(/<script(?! type="application\/json")[\s\S]*?<\/script>/g)].map((m) => m[0])
    expect(scripts(html)).toEqual(scripts(template))
  })

  it('tål dollartecken och skripttaggar i datan', () => {
    const page = { ...uppsala, orter: ['$& Ort', '</script><b>x'] }
    const out = renderKommunHtml(template, page)
    expect(out).toContain('$&amp; Ort')
    expect(out).not.toContain('</script><b>')
  })
})

describe('en mall som ändrats', () => {
  it.each([
    ['rotelementet', '<div id="root"></div>', '<div id="root" />'],
    ['titeln', /<title>[^<]*<\/title>/, ''],
    ['beskrivningen', /<meta name="description"[^>]*>/, ''],
    ['delningstiteln', /<meta property="og:title"[^>]*>/, ''],
  ])('stoppar bygget när %s saknas', (_, from, to) => {
    expect(() => renderKommunHtml(template.replace(from, to), uppsala)).toThrow(/mallen/i)
  })
})

describe('CSP', () => {
  it('tillåter temaskriptet i en färdig kommunsida', () => {
    const config = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] }
    const csp = config.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value
    const inline = renderKommunHtml(template, uppsala).match(/<script>([\s\S]*?)<\/script>/)![1]
    expect(csp).toContain(`'sha256-${createHash('sha256').update(inline).digest('base64')}'`)
  })
})

describe('inbäddad data', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('läses tillbaka av appen', () => {
    const html = renderKommunHtml(template, uppsala)
    document.body.innerHTML = html.match(/<script type="application\/json"[\s\S]*?<\/script>/)![0]
    expect(embeddedData('/kommuner/uppsala-kommun')).toEqual(uppsala)
  })
})

describe('renderKommunerHtml', () => {
  const html = renderKommunerHtml(template, [uppsala, goteborg])

  it('sätter titel, beskrivning och antal som räknas fram', () => {
    expect(html).toContain('<title>Sophämtning i Sveriges kommuner – Sopor</title>')
    expect(meta(html, 'name="description"')).toBe('Sopor finns i 1 av Sveriges 2 kommuner. Se om din kommun är med.')
    expect(html).toContain('<link rel="canonical" href="https://sopor.hardyson.se/kommuner" />')
  })

  it('länkar till alla kommuner, utan orterna i den inbäddade datan', () => {
    expect(rootContent(html)).toContain('href="/kommuner/goteborgs-kommun"')
    expect(html).not.toContain('Storvreta')
  })
})

describe('renderPrivacyHtml', () => {
  const html = renderPrivacyHtml(template)

  it('har eget innehåll, som reservsidan saknar', () => {
    expect(rootContent(html)).toContain('Integritetspolicy')
    expect(rootContent(html)).toContain('Dina rättigheter')
    expect(template).not.toContain('Dina rättigheter')
  })

  it('sätter titel, beskrivning och kanonisk adress', () => {
    expect(html).toContain('<title>Integritetspolicy – Sopor</title>')
    expect(meta(html, 'name="description"')).toContain('Sophämtning')
    expect(html).toContain('<link rel="canonical" href="https://sopor.hardyson.se/integritet" />')
  })

  it('stänger inte av indexering', () => {
    expect(html).not.toContain('noindex')
  })
})

describe('sitemapXml', () => {
  const xml = sitemapXml('https://sopor.hardyson.se', [uppsala, goteborg])

  it('listar sajtens sidor och alla kommuner', () => {
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
    expect(urls).toEqual(
      ['/', '/om', '/integritet', '/bidra', '/kommuner', '/kommuner/uppsala-kommun', '/kommuner/goteborgs-kommun'].map((p) => `https://sopor.hardyson.se${p}`),
    )
  })

  it('är giltig XML utan lastmod, som skulle ändras vid varje bygge', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).not.toContain('lastmod')
  })
})

describe('robots.txt', () => {
  it('pekar ut sitemapen', () => {
    expect(readFileSync(path.join(root, 'public/robots.txt'), 'utf8')).toBe(
      'User-agent: *\nAllow: /\nSitemap: https://sopor.hardyson.se/sitemap.xml\n',
    )
  })
})
