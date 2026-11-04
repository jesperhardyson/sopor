import type { Area } from './types.js'

/** Hämtdagen och, om källan har en, etiketten: "Tisdag, jämn vecka · Trakt 7". */
export function areaDetail({ day, label }: { day: string; label?: string }): string {
  return label ? `${day} · ${label}` : day
}

export type AreaForDate =
  | { kind: 'found'; area: Area; previous: string[]; next: string | null }
  | { kind: 'none' }
  | { kind: 'outside' }

/**
 * Vilket område som har hämtning ett visst datum. `previous` är högst två datum med det valda
 * sist, `next` områdets nästa. Datum före det tidigaste eller efter det senaste bland områdena
 * ligger `outside` schemat, och ett datum däremellan utan hämtning ger `none`.
 */
export function areaForDate(date: string, areas: Area[]): AreaForDate {
  const all = areas.flatMap((a) => a.dates).sort()
  if (all.length === 0 || date < all[0] || date > all[all.length - 1]) return { kind: 'outside' }
  const area = areas.find((a) => a.dates.includes(date))
  if (!area) return { kind: 'none' }
  const i = area.dates.indexOf(date)
  return { kind: 'found', area, previous: area.dates.slice(Math.max(0, i - 1), i + 1), next: area.dates[i + 1] ?? null }
}
