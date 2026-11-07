import type { Area } from './types.js'

/** Hämtdagen och, om källan har en, etiketten: "Tisdag, jämn vecka · Område 7". */
export function areaDetail({ day, label }: { day: string; label?: string }): string {
  return label ? `${day} · ${label}` : day
}

export type AreaForDate =
  | { kind: 'found'; area: Area; previous: string[]; next: string | null }
  | { kind: 'none' }
  | { kind: 'outside' }

export type AreaMatch = { area: Area; previous: string[]; next: string | null }

export type AreasForDate = { kind: 'found'; matches: AreaMatch[] } | { kind: 'none' } | { kind: 'outside' }

/**
 * Vilka områden som har hämtning ett visst datum. `previous` är högst två datum med det valda
 * sist, `next` områdets nästa. Datum före det tidigaste eller efter det senaste bland områdena
 * ligger `outside` schemat, och ett datum däremellan utan hämtning ger `none`.
 */
export function areasForDate(date: string, areas: Area[]): AreasForDate {
  const all = areas.flatMap((a) => a.dates).sort()
  if (all.length === 0 || date < all[0] || date > all[all.length - 1]) return { kind: 'outside' }
  const matches = areas
    .filter((a) => a.dates.includes(date))
    .map((area) => {
      const i = area.dates.indexOf(date)
      return { area, previous: area.dates.slice(Math.max(0, i - 1), i + 1), next: area.dates[i + 1] ?? null }
    })
  return matches.length > 0 ? { kind: 'found', matches } : { kind: 'none' }
}

/** Webbens ark visar ett område. Ingen källa har delade datum i dag; får en det behöver arket ett eget läge. */
export function areaForDate(date: string, areas: Area[]): AreaForDate {
  const result = areasForDate(date, areas)
  return result.kind === 'found' ? { kind: 'found', ...result.matches[0] } : result
}
