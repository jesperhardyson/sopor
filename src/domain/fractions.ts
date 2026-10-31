import type { FractionId } from './types.js'

export interface FractionInfo {
  id: FractionId
  name: string
  short: string
  /** Lucide-ikonens namn, samma som i designen */
  icon: 'trash-2' | 'apple' | 'package' | 'cup-soda' | 'wine' | 'cylinder' | 'newspaper' | 'container'
  /** Färgen i ljust tema, hex i versaler (samma som temats frac-token) */
  color: string
  order: number
}

/**
 * Fraktionsregistret. Ny fraktion: lägg till här, i FractionId och i temats frac-tokens.
 * `order` styr ordningen inom en tömning: matavfall sist, som i designen ("Papper + Mat").
 */
export const FRACTIONS: Record<FractionId, FractionInfo> = {
  rest: { id: 'rest', name: 'Restavfall', short: 'Rest', icon: 'trash-2', color: '#474C48', order: 0 },
  mat: { id: 'mat', name: 'Matavfall', short: 'Mat', icon: 'apple', color: '#7A4A1E', order: 7 },
  papper: { id: 'papper', name: 'Pappersförpackningar', short: 'Papper', icon: 'package', color: '#2E5E86', order: 1 },
  plast: { id: 'plast', name: 'Plastförpackningar', short: 'Plast', icon: 'cup-soda', color: '#A8431F', order: 2 },
  glas: { id: 'glas', name: 'Glas', short: 'Glas', icon: 'wine', color: '#1F6A7A', order: 3 },
  metall: { id: 'metall', name: 'Metall', short: 'Metall', icon: 'cylinder', color: '#6B4F7A', order: 4 },
  tidningar: { id: 'tidningar', name: 'Tidningar', short: 'Tidn.', icon: 'newspaper', color: '#2E5E86', order: 5 },
  /** Kärl med flera fraktioner (fyrfack m.m.). Visas med källans egen text. */
  karl: { id: 'karl', name: 'Kärl', short: 'Kärl', icon: 'container', color: '#526158', order: 6 },
}

export function isFractionId(value: string): value is FractionId {
  return Object.hasOwn(FRACTIONS, value)
}

export function sortFractions(ids: FractionId[]): FractionId[] {
  return [...ids].sort((a, b) => FRACTIONS[a].order - FRACTIONS[b].order)
}
