import type { FractionId } from '../domain/types.js'

/** Ordningen spelar roll: "matavfall" ska inte fångas av något bredare mönster först. */
const PATTERNS: [RegExp, FractionId][] = [
  [/^rest/, 'rest'],
  // Kungälv kallar restavfallet "Osorterat", Boden "Brännbart" (matavfallet har eget kärl där).
  [/^osorterat/, 'rest'],
  [/^brännbart/, 'rest'],
  [/^mat/, 'mat'],
  [/^papp/, 'papper'],
  [/^plast/, 'plast'],
  [/^glas/, 'glas'],
  // NSR: "Färgat glas", "Ofärgat glas", "Blandglas"
  [/^(?:o?färgat |bland)glas/, 'glas'],
  // "Metal" i Danderyds "Glas/Glas/Metal"
  [/^metal/, 'metall'],
  // "Tidn." i NSR:s "Tidn./glas/metall"
  [/^tidn/, 'tidningar'],
]

const SKIP = [/^slam/, /^latrin/, /^fett/]

/** Kärl som visas med källans egen text utan att vara okända: trädgårdsavfall (Danderyd), batteriholkar (Lycksele) och miljöboxar (NSR). */
const KNOWN_BINS = [/^trädgård/i, /^batteri/i, /^miljöfarlig/i]

export const isKnownBin = (label: string) => KNOWN_BINS.some((p) => p.test(label.trim()))

const fractionFor = (t: string) => PATTERNS.find(([pattern]) => pattern.test(t))?.[1]

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
  const label = text.trim().replace(/\s+/g, ' ')
  // Lund skriver "4-fackskärl" och kallar kärl 1 "Rest/matavfall", fast det har fler fack.
  const multi = /fyrfack|flerfack|4-fack/i.test(`${label} ${frequencyText} ${description}`)
  // Ale skriver det delade kärlet "Plast,Papp", Lidingö "PlastPapper". Ett komma kan också följas av en volym, så bara hela träffar räknas.
  const joined = label.split(/\s*,\s*|(?<=[a-zåäö])(?=[A-ZÅÄÖ])/).map((p) => fractionFor(p.toLowerCase()))
  if (!multi && joined.length > 1 && joined.every((f) => f !== undefined)) return { fractions: [...new Set(joined)] }
  // NSR skriver det delade kärlet "Mat + Rest", SRV "Papper och Plast".
  const parts = t.split(/[/+]|\soch\s/).map((p) => p.trim())
  if (parts.length === 1) {
    const fraction = fractionFor(t)
    if (fraction) return { fractions: [fraction] }
  } else if (!multi) {
    // Ett delat kärl ("Papper/Plast", "Mat-/Restavfall"): varje del för sig, eller ingen gissning.
    const fractions = parts.map(fractionFor)
    if (fractions.every((f) => f !== undefined)) return { fractions: [...new Set(fractions)] }
  }
  const coded = fractionsFromCodes(description)
  if (coded) return { fractions: coded }
  // VIVAB kallar restavfallskärlet "Hushåll" ("190l restavfallskärl", "… separat matavfallskärl").
  if (/^hushåll/.test(t) && !multi) return { fractions: ['rest'] }
  if (!multi) return { fractions: ['karl'], label }
  // Fastighetsägaren vet vad som ligger i facken; numret säger vilket kärl som ska ut.
  const number = label.match(/(\d+)\s*$/)?.[1] ?? description.match(/kärl\s*(\d+)/i)?.[1]
  return { fractions: ['karl'], label: number ? `Fyrfackskärl ${number}` : 'Fyrfackskärl' }
}
