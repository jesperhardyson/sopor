import type { FractionId } from '../domain/types.js'

/** Ordningen spelar roll: "matavfall" ska inte fångas av något bredare mönster först. */
const PATTERNS: [RegExp, FractionId][] = [
  [/^rest/, 'rest'],
  [/^mat/, 'mat'],
  [/^papp/, 'papper'],
  [/^plast/, 'plast'],
  [/^glas/, 'glas'],
  [/^metall/, 'metall'],
  [/^tidning/, 'tidningar'],
]

const SKIP = [/^slam/, /^latrin/, /^fett/]

/**
 * Översätter en källas avfallstyp ("Pappersförp.", "RESTAVFALL", "Fyrfack 1" …) till Sopors
 * fraktioner. Okända typer och kärl med flera fraktioner blir `karl` med källans egen text.
 */
export function mapWasteType(text: string, frequencyText = ''): { fraction: FractionId; label?: string } | null {
  const t = text.trim().toLowerCase()
  if (SKIP.some((p) => p.test(t))) return null
  for (const [pattern, fraction] of PATTERNS) if (pattern.test(t)) return { fraction }
  const label = text.trim().replace(/\s+/g, ' ')
  const fyrfack = /fyrfack/i.test(frequencyText) && !/fyrfack/i.test(label)
  return { fraction: 'karl', label: fyrfack ? `${label} – fyrfack` : label }
}
