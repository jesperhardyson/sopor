import { Briefcase, House, MapPin, Trees } from 'lucide-react'

/** Ikon efter namnet på en sparad adress, som i designen: Hemma → hus, Stugan → träd, Jobbet → portfölj. */
export function NameIcon({ name, className }: { name: string; className?: string }) {
  const n = name.trim().toLowerCase()
  if (n === 'hemma' || n === 'hem') return <House className={className} aria-hidden />
  if (n === 'stugan' || n === 'stuga' || n === 'sommarstugan') return <Trees className={className} aria-hidden />
  if (n === 'jobbet' || n === 'jobb' || n === 'kontoret') return <Briefcase className={className} aria-hidden />
  return <MapPin className={className} aria-hidden />
}
