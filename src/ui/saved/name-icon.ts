import { Briefcase, House, MapPin, Trees, type LucideIcon } from 'lucide-react'

/** Ikon efter namnet, som i designen: Hemma → hus, Stugan → träd, Jobbet → portfölj. */
export function nameIcon(name: string): LucideIcon {
  const n = name.trim().toLowerCase()
  if (n === 'hemma' || n === 'hem') return House
  if (n === 'stugan' || n === 'stuga' || n === 'sommarstugan') return Trees
  if (n === 'jobbet' || n === 'jobb' || n === 'kontoret') return Briefcase
  return MapPin
}
