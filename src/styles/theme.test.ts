import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.resolve(import.meta.dirname, 'theme.css'), 'utf8')

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`Hittar inte ${selector}`)
  return css.slice(start, css.indexOf('}', start))
}

function value(selector: string, token: string): string | undefined {
  return block(selector).match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1].trim()
}

const FRACTIONS = ['rest', 'mat', 'papper', 'plast', 'glas', 'metall']
const TOKENS = [
  'bg', 'bg-2', 'surface', 'surface-2', 'border', 'text', 'text-2', 'primary', 'on-primary',
  'brand', 'brand-soft', 'brand-text', 'earth', 'earth-soft', 'warn', 'warn-bg', 'card-overlay',
  ...FRACTIONS.flatMap((f) => [`frac-${f}`, `frac-${f}-bg`]),
]

describe('theme.css', () => {
  it.each(TOKENS)('definierar --%s i både ljust och mörkt läge', (token) => {
    expect(value(':root', token)).toBeDefined()
    expect(value('.dark', token)).toBeDefined()
  })

  it('använder designens primärfärg', () => {
    expect(value(':root', 'primary')?.toUpperCase()).toBe('#157A46')
    expect(value('.dark', 'primary')?.toUpperCase()).toBe('#4CC384')
  })

  it('har en levande bakgrund som stängs av vid minskad rörelse', () => {
    expect(css).toMatch(/\.bg-live::before\s*\{[^}]*animation:/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.bg-live::before[\s\S]*animation: none/)
  })
})
