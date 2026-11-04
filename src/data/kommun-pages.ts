// Kommunsidorna (/kommuner/<slug>): en sida per kommun i Sverige, med eller utan källa.
// Byggs av scripts/build-data.ts från data/sverige/orter.json och SOURCES.

import type { Source } from '@/sources'
import { DataError } from './static-format'
import { placeNames, type SwedenPlacesFile } from './sweden-places'

export interface KommunPage {
  code: string
  name: string
  slug: string
  covered: boolean
  sources: { name: string; url: string }[]
  orter: string[]
}

export type KommunSummary = Pick<KommunPage, 'name' | 'slug' | 'covered'>

/** Håbo och Habo skulle annars få samma slug. En kommun som byter namn behåller sin slug här. */
const SLUG_OVERRIDES: Record<string, string> = { '0305': 'haabo-kommun' }

/** Adressen till kommunens sida. Får aldrig ändras när den är publicerad (kommun-slugs.json vakar). */
export function kommunSlug(code: string, name: string): string {
  return (
    SLUG_OVERRIDES[code] ??
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  )
}

/** Orten med kommunens namn först, "Göteborgs kommun" → Göteborg, sedan resten i bokstavsordning. */
function sortOrter(orter: string[], kommun: string): string[] {
  const base = kommun.replace(/ kommun$/, '').replace(/^Region /, '')
  const main = orter.includes(base) ? base : base.endsWith('s') && orter.includes(base.slice(0, -1)) ? base.slice(0, -1) : undefined
  const rest = orter.filter((o) => o !== main).sort((a, b) => a.localeCompare(b, 'sv'))
  return main ? [main, ...rest] : rest
}

export function buildKommunPages(file: SwedenPlacesFile, sources: Source[]): KommunPage[] {
  for (const source of sources) {
    if (source.id === 'kommuner') throw new DataError('Källan får inte heta "kommuner": /kommuner är en sida på sajten')
    for (const { code, name } of source.kommuner) {
      if (!file.kommuner[code]) throw new DataError(`${source.id}: ${name} (${code}) saknas i data/sverige/orter.json`)
    }
  }

  const orterByCode = new Map<string, string[]>()
  for (const [label, codes] of Object.entries(file.orter)) {
    for (const code of codes) orterByCode.set(code, [...(orterByCode.get(code) ?? []), ...placeNames(label)])
  }

  const pages = Object.entries(file.kommuner)
    .map(([code, name]): KommunPage => {
      const covering = sources.filter((s) => s.kommuner.some((k) => k.code === code))
      return {
        code,
        name,
        slug: kommunSlug(code, name),
        covered: covering.length > 0,
        sources: covering.map((s) => ({ name: s.name, url: s.url })),
        orter: sortOrter([...new Set(orterByCode.get(code))], name),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))

  const seen = new Map<string, string>()
  for (const { slug, name } of pages) {
    const other = seen.get(slug)
    if (other) throw new DataError(`${other} och ${name} får samma slug: ${slug}`)
    seen.set(slug, name)
  }
  return pages
}
