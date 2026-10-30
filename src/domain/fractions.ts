import type { FractionId } from './types'

export interface FractionInfo {
  id: FractionId
  name: string
  short: string
  /** Lucide-ikonens namn, samma som i designen */
  icon: 'trash-2' | 'apple' | 'package' | 'cup-soda' | 'wine' | 'cylinder'
  order: number
}

/** Fraktionsregistret. Ny fraktion: lägg till här, i FractionId och i temats frac-tokens. */
export const FRACTIONS: Record<FractionId, FractionInfo> = {
  rest: { id: 'rest', name: 'Restavfall', short: 'Rest', icon: 'trash-2', order: 0 },
  mat: { id: 'mat', name: 'Matavfall', short: 'Mat', icon: 'apple', order: 1 },
  papper: { id: 'papper', name: 'Pappersförpackningar', short: 'Papper', icon: 'package', order: 2 },
  plast: { id: 'plast', name: 'Plastförpackningar', short: 'Plast', icon: 'cup-soda', order: 3 },
  glas: { id: 'glas', name: 'Glas', short: 'Glas', icon: 'wine', order: 4 },
  metall: { id: 'metall', name: 'Metall', short: 'Metall', icon: 'cylinder', order: 5 },
}

export function isFractionId(value: string): value is FractionId {
  return Object.hasOwn(FRACTIONS, value)
}

export function sortFractions(ids: FractionId[]): FractionId[] {
  return [...ids].sort((a, b) => FRACTIONS[a].order - FRACTIONS[b].order)
}
