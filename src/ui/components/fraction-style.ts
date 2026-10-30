import { Apple, CupSoda, Cylinder, Package, Trash2, Wine, type LucideIcon } from 'lucide-react'
import type { FractionId } from '@/domain/types'

export const FRACTION_ICON: Record<FractionId, LucideIcon> = {
  rest: Trash2,
  mat: Apple,
  papper: Package,
  plast: CupSoda,
  glas: Wine,
  metall: Cylinder,
}

// Hela klassnamn så att Tailwind hittar dem.
export const FRACTION_CLASS: Record<FractionId, { fg: string; bg: string; dot: string }> = {
  rest: { fg: 'text-frac-rest', bg: 'bg-frac-rest-bg', dot: 'bg-frac-rest' },
  mat: { fg: 'text-frac-mat', bg: 'bg-frac-mat-bg', dot: 'bg-frac-mat' },
  papper: { fg: 'text-frac-papper', bg: 'bg-frac-papper-bg', dot: 'bg-frac-papper' },
  plast: { fg: 'text-frac-plast', bg: 'bg-frac-plast-bg', dot: 'bg-frac-plast' },
  glas: { fg: 'text-frac-glas', bg: 'bg-frac-glas-bg', dot: 'bg-frac-glas' },
  metall: { fg: 'text-frac-metall', bg: 'bg-frac-metall-bg', dot: 'bg-frac-metall' },
}
