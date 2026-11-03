import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FRACTIONS as FRACTION_REGISTRY } from '@/domain/fractions'
import { FRACTION_CLASS } from '@/ui/components/fraction-style'

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

  it('känns som en app vid tryck: ingen grå blink, ingen fördröjning och kort nedtryckning', () => {
    expect(block('html')).toMatch(/-webkit-tap-highlight-color: transparent/)
    expect(block('html')).toMatch(/touch-action: manipulation/)
    expect(css).toMatch(/@utility tryck \{[\s\S]*:active[\s\S]*scale/)
  })

  it('visar pekhand på allt klickbart, men inte på avstängda knappar (Tailwind v4 har pil som standard)', () => {
    const rule = css.match(/([^{}]*)\{\s*cursor: pointer;\s*\}/)?.[1] ?? ''
    for (const sel of ['button:not(:disabled)', '[role="button"]', 'summary', 'select', 'label:has(input[type="checkbox"])']) {
      expect(rule).toContain(sel)
    }
  })

  it('håller innehållet borta från notch och hemindikator', () => {
    for (const side of ['top', 'right', 'bottom', 'left']) expect(block('.bg-live')).toContain(`env(safe-area-inset-${side})`)
  })

  it('har en kort övergång mellan sidor som stängs av vid minskad rörelse', () => {
    expect(css).toMatch(/::view-transition-new\(\.sida\)\s*\{[^}]*animation:/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*::view-transition-group\(\*\)[\s\S]*animation: none/)
  })

  it('har en levande bakgrund som stängs av vid minskad rörelse', () => {
    expect(css).toMatch(/\.bg-live::before\s*\{[^}]*animation:/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.bg-live::before[\s\S]*animation: none/)
  })

  it.each(Object.values(FRACTION_REGISTRY))('$id har samma färg som sajten visar', (f) => {
    const token = FRACTION_CLASS[f.id].dot.replace(/^bg-/, '') // 'frac-papper', 'text-2'
    expect(f.color).toBe(value(':root', token)?.toUpperCase())
  })
})
