// Skapar statiska kommunsidor, sitemap och 404-sida i dist/ från den byggda index.html.
// Körs sist i `npm run build`. Appen tar över sidorna när JavaScript har laddats.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { SITE } from '../src/config'
import type { KommunPage, KommunSummary } from '../src/data/kommun-pages'
import { embeddedScript } from '../src/ui/kommun/embedded'
import { KommunContent } from '../src/ui/kommun/KommunContent'
import { KommunerContent } from '../src/ui/kommun/KommunerContent'
import { StaticSearch } from '../src/ui/kommun/StaticSearch'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

interface PageMeta {
  path: string
  title: string
  description: string
}

const escapeAttr = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** Ersätter eller stoppar bygget, så att en ändrad mall inte ger 290 sidor med fel innehåll. Funktion som ersättning, så att $ i datan inte tolkas. */
function replaceOrThrow(html: string, pattern: string | RegExp, replacement: (...parts: string[]) => string): string {
  if (typeof pattern === 'string' ? !html.includes(pattern) : !pattern.test(html)) throw new Error(`prerender: mallen saknar ${pattern}`)
  return html.replace(pattern, replacement)
}

function setMeta(html: string, attr: string, value: string): string {
  return replaceOrThrow(html, new RegExp(`(<meta ${attr} content=")[^"]*(")`), (_, start, end) => `${start}${escapeAttr(value)}${end}`)
}

function renderPage(template: string, meta: PageMeta, element: ReactElement, data: unknown): string {
  const url = `${SITE.origin}${meta.path}`
  let html = replaceOrThrow(template, /<title>[^<]*<\/title>/, () => `<title>${escapeAttr(meta.title)}</title>\n    <link rel="canonical" href="${url}" />`)
  html = setMeta(html, 'name="description"', meta.description)
  html = setMeta(html, 'property="og:description"', meta.description)
  html = setMeta(html, 'property="og:title"', meta.title)
  html = setMeta(html, 'property="og:url"', url)
  const content = renderToStaticMarkup(createElement(StaticRouter, { location: meta.path }, element))
  return replaceOrThrow(html, '<div id="root"></div>', () => `<div id="root">${content}</div>\n    ${embeddedScript(meta.path, data)}`)
}

export function renderKommunHtml(template: string, page: KommunPage): string {
  return renderPage(
    template,
    {
      path: `/kommuner/${page.slug}`,
      title: `Sophämtning i ${page.name} – Sopor`,
      description: page.covered
        ? `Se när dina kärl töms i ${page.name} och lägg schemat i kalendern. Inofficiell tjänst.`
        : `Sopor finns inte i ${page.name} än. Tipsa om var kommunen publicerar sitt hämtschema.`,
    },
    createElement(KommunContent, { page, search: createElement(StaticSearch) }),
    page,
  )
}

export function renderKommunerHtml(template: string, pages: KommunPage[]): string {
  const kommuner: KommunSummary[] = pages.map(({ name, slug, covered }) => ({ name, slug, covered }))
  return renderPage(
    template,
    {
      path: '/kommuner',
      title: 'Sophämtning i Sveriges kommuner – Sopor',
      description: `Sopor finns i ${kommuner.filter((k) => k.covered).length} av Sveriges ${kommuner.length} kommuner. Se om din kommun är med.`,
    },
    createElement(KommunerContent, { kommuner }),
    kommuner,
  )
}

export function sitemapXml(origin: string, pages: KommunPage[]): string {
  const paths = ['/', '/om', '/bidra', '/kommuner', ...pages.map((p) => `/kommuner/${p.slug}`)]
  const urls = paths.map((p) => `  <url><loc>${origin}${p}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

function main() {
  const dist = path.join(root, 'dist')
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(dist, file)), { recursive: true })
    fs.writeFileSync(path.join(dist, file), content)
  }
  const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'kommuner.json'), 'utf8')) as KommunPage[]

  write('kommuner/index.html', renderKommunerHtml(template, pages))
  for (const page of pages) write(`kommuner/${page.slug}/index.html`, renderKommunHtml(template, page))
  write('sitemap.xml', sitemapXml(SITE.origin, pages))
  write('404.html', template)
  console.log(`prerender: ${pages.length} kommunsidor`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
