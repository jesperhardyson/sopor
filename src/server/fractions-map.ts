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

/** Koderna Uppsala Vatten skriver i flerfackskärlens beskrivning: "Kärl 2, RE PL GF GO. 370L …". */
const CODES: Record<string, FractionId> = {
  RE: 'rest',
  MA: 'mat',
  PA: 'papper',
  PL: 'plast',
  GF: 'glas',
  GO: 'glas',
  ME: 'metall',
  TI: 'tidningar',
}

/** Fraktionerna ur beskrivningens koder, eller null om någon kod är okänd (då gissar vi inte). */
function fractionsFromCodes(description: string): FractionId[] | null {
  const m = description.match(/,\s*((?:[A-Z]{2}\s+)*[A-Z]{2})\s*\./)
  if (!m) return null
  const codes = m[1].split(/\s+/)
  if (!codes.every((c) => c in CODES)) return null
  return [...new Set(codes.map((c) => CODES[c]))]
}

/**
 * Översätter en källas avfallstyp ("Pappersförp.", "RESTAVFALL", "Fyrfack 1" …) till Sopors
 * fraktioner. Kärl med flera fraktioner läses ur beskrivningens koder när källan har sådana.
 * Annars blir de `karl` med texten "Fyrfackskärl 1", eller källans egen text för okända kärl.
 */
export function mapWasteType(
  text: string,
  frequencyText = '',
  description = '',
): { fractions: FractionId[]; label?: string } | null {
  const t = text.trim().toLowerCase()
  if (SKIP.some((p) => p.test(t))) return null
  for (const [pattern, fraction] of PATTERNS) if (pattern.test(t)) return { fractions: [fraction] }
  const coded = fractionsFromCodes(description)
  if (coded) return { fractions: coded }
  const label = text.trim().replace(/\s+/g, ' ')
  if (!/fyrfack|flerfack/i.test(`${label} ${frequencyText} ${description}`)) return { fractions: ['karl'], label }
  // Fastighetsägaren vet vad som ligger i facken; numret säger vilket kärl som ska ut.
  const number = label.match(/(\d+)\s*$/)?.[1]
  return { fractions: ['karl'], label: number ? `Fyrfackskärl ${number}` : 'Fyrfackskärl' }
}
