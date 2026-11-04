import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const html = readFileSync(path.join(root, 'index.html'), 'utf8')
const manifest = JSON.parse(readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8')) as Record<string, unknown>

/** Värdet på en token i ett block ur en stilmall, som `:root` eller `.dark`. */
function token(css: string, block: string, name: string): string {
  const start = css.search(new RegExp(`^\\s*${block.replace('.', '\\.')} \\{`, 'm'))
  if (start < 0) throw new Error(`Hittar inte ${block}`)
  const body = css.slice(start, css.indexOf('}', start))
  const match = body.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]+)`))
  if (!match) throw new Error(`${block} saknar --${name}`)
  return match[1]
}

describe('laddningsvyn i index.html', () => {
  const theme = readFileSync(path.join(root, 'src/styles/theme.css'), 'utf8')
  const inline = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
  const parse = () => new DOMParser().parseFromString(html, 'text/html')

  it('visas medan appen är tom och försvinner när React har renderat', () => {
    const doc = parse()
    expect(doc.querySelector('#root:empty ~ .karl-laddar')).not.toBeNull()
    doc.getElementById('root')!.append(doc.createElement('main'))
    expect(doc.querySelector('#root:empty ~ .karl-laddar')).toBeNull()
    expect(inline).toMatch(/#root:empty ~ \.karl-laddar\s*\{[^}]*display: flex/)
  })

  it('lämnar den tomma roten orörd, som prerender-steget letar efter', () => {
    expect(html).toContain('<div id="root"></div>')
  })

  it('har samma bakgrund och fraktionsfärger som temat i både ljust och mörkt läge', () => {
    const names = ['bg', 'surface-2', 'text-2', 'frac-mat', 'frac-mat-bg', 'frac-papper', 'frac-papper-bg', 'frac-plast', 'frac-plast-bg']
    for (const block of [':root', '.dark']) {
      for (const name of names) expect(token(inline, block, name), `${block} --${name}`).toBe(token(theme, block, name))
    }
    expect(inline).toMatch(/html\s*\{[^}]*background: var\(--bg\)/)
  })

  it('säger till skärmläsare att sidan laddar', () => {
    const status = parse().querySelector('.karl-laddar')
    expect(status?.getAttribute('role')).toBe('status')
    expect(status?.getAttribute('aria-label')).toBe('Laddar…')
  })

  it('står stilla för den som har valt minskad rörelse', () => {
    expect(inline).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/)
  })

  it('väntar med att synas, så att en snabb laddning inte blinkar', () => {
    expect(inline).toMatch(/karl-in [^;]*\.3s/)
  })

  it('hämtar inga filer', () => {
    expect(parse().querySelectorAll('.karl-laddar image')).toHaveLength(0)
    expect(inline).not.toMatch(/url\(/)
  })

  describe('de roliga texterna', () => {
    /** Kör textskriptet mot en egen kopia av sidan, som i webbläsaren. */
    function start() {
      const doc = parse()
      const code = doc.querySelector('.karl-laddar + script')!.textContent
      new Function('document', code)(doc)
      const text = doc.querySelector('.karl-text')!
      return { text, next: () => text.dispatchEvent(new Event('animationiteration')) }
    }

    afterEach(() => vi.restoreAllMocks())

    it('har en text redan utan skript, och skärmläsare får bara "Laddar…"', () => {
      const text = parse().querySelector('.karl-text')!
      expect(text.textContent).not.toBe('')
      expect(text.getAttribute('aria-hidden')).toBe('true')
    })

    it('låter texten stå i lugn takt, oberoende av kärlet, och stilla vid minskad rörelse', () => {
      expect(inline).toMatch(/\.karl-text\s*\{[^}]*animation: karl-text 3\.6s/)
      expect(inline).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^}]*\.karl-text[^}]*animation: none/)
    })

    it('slumpar texten', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const low = start().text.textContent
      vi.spyOn(Math, 'random').mockReturnValue(0.999)
      expect(start().text.textContent).not.toBe(low)
    })

    it('visar alla texter innan någon upprepas', () => {
      const { text, next } = start()
      const seen = [text.textContent]
      for (let i = 0; i < 20; i++) {
        next()
        seen.push(text.textContent)
      }
      expect(new Set(seen).size).toBe(21)
    })

    it('fortsätter när alla texter är använda', () => {
      const { text, next } = start()
      for (let i = 0; i < 100; i++) {
        next()
        expect(text.textContent).not.toBe('')
      }
    })
  })
})

describe('appen på hemskärmen', () => {
  it('fyller hela skärmen, så att innehållet kan lägga sig runt notch och hemindikator', () => {
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/)
  })

  it('har ett fast id i manifestet, så att installationen överlever en ändrad start_url', () => {
    expect(manifest.id).toBe('/')
    expect(manifest.display).toBe('standalone')
  })
})
