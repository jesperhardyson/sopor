import type { Address } from './types.js'

const KEEP: Record<string, string> = { å: '\u0001', ä: '\u0002', ö: '\u0003' }
const RESTORE = Object.fromEntries(Object.entries(KEEP).map(([k, v]) => [v, k]))

/** Gemener, ett mellanslag, "12 b" → "12b", diakriter bort utom å/ä/ö. */
export function normalize(s: string, joinHouseLetter = true): string {
  const base = s
    .toLowerCase()
    .replace(/[åäö]/g, (c) => KEEP[c])
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    // eslint-disable-next-line no-control-regex -- platshållarna för å/ä/ö är avsiktliga styrtecken
    .replace(/[\u0001-\u0003]/g, (c) => RESTORE[c])
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return joinHouseLetter ? base.replace(/(\d) (\p{L})\b/gu, '$1$2') : base
}

function haystack(a: Address): string[] {
  return normalize(`${a.street} ${a.locality}`).split(' ')
}

export function searchAddresses(query: string, addresses: Address[], limit = 8): Address[] {
  const q = normalize(query)
  if (q.length < 2) return []
  const hits = match(q, addresses, limit)
  // "storgatan 12 k" kan vara husbokstav eller början på orten (Krylbo).
  const split = normalize(query, false)
  return hits.length === 0 && split !== q ? match(split, addresses, limit) : hits
}

/**
 * Adressen som Enter öppnar utan att man valt en rad: den enda träffen, eller den enda som är just
 * det man skrev. "Hornsgatan 1" får inte öppna Hornsgatan 10 eller gissa mellan Borås och Kalmar.
 */
export function enterTarget(query: string, addresses: Address[]): Address | undefined {
  if (addresses.length === 1) return addresses[0]
  const q = normalize(query)
  const exact = addresses.filter((a) => normalize(a.street) === q || normalize(`${a.street} ${a.locality}`) === q)
  return exact.length === 1 ? exact[0] : undefined
}

function match(q: string, addresses: Address[], limit: number): Address[] {
  const tokens = q.split(' ')
  return addresses
    .filter((a) => {
      const words = haystack(a)
      return tokens.every((t) => words.some((w) => w.startsWith(t)))
    })
    .map((a) => ({ a, starts: normalize(a.street).startsWith(q) ? 0 : 1 }))
    .sort(
      (x, y) =>
        x.starts - y.starts ||
        x.a.street.localeCompare(y.a.street, 'sv') ||
        x.a.locality.localeCompare(y.a.locality, 'sv'),
    )
    .slice(0, limit)
    .map((x) => x.a)
}

/** Damerau-Levenshtein (optimal string alignment) */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

/** Delar "storgatan 12b" i gatunamn och husnummer. */
function splitStreet(normalized: string): { name: string; number?: string } {
  const m = normalized.match(/^(.*?)\s*(\d\S*)?(?:\s.*)?$/)
  return { name: (m?.[1] ?? normalized).trim(), number: m?.[2] }
}

/** Förslag för "Menade du:" när sökningen inte gav träff. */
export function suggest(query: string, addresses: Address[], limit = 3): Address[] {
  const q = splitStreet(normalize(query))
  if (q.name.length < 3) return []
  return addresses
    .map((a) => {
      const s = splitStreet(normalize(a.street))
      return { a, s, dist: distance(q.name, s.name) }
    })
    .filter((x) => x.dist <= 2 && (!q.number || x.s.number === q.number))
    .sort((x, y) => x.dist - y.dist || x.a.street.localeCompare(y.a.street, 'sv'))
    .slice(0, limit)
    .map((x) => x.a)
}

export interface KommunGroup {
  kommun: string
  addresses: Address[]
}

/**
 * Träffarna per kommun. Grupperna kommer i den ordning kommunen först dyker upp, så att en
 * live-källa som svarar sent hamnar sist i stället för att knuffa listan medan man tittar.
 */
export function groupByKommun(addresses: Address[]): KommunGroup[] {
  const groups = new Map<string, Address[]>()
  for (const a of addresses) groups.set(a.kommun, [...(groups.get(a.kommun) ?? []), a])
  return [...groups].map(([kommun, list]) => ({ kommun, addresses: list }))
}

/**
 * Högst `limit` träffar, fördelade per kommun i tur och ordning. Annars tar den källa som svarar
 * först alla platser. Träffarnas inbördes ordning behålls.
 */
export function fairShare(addresses: Address[], limit: number): Address[] {
  if (addresses.length <= limit) return addresses
  const groups = groupByKommun(addresses)
  const quota = new Map(groups.map((g) => [g.kommun, 0]))
  for (let given = 0; given < limit; ) {
    for (const g of groups) {
      const n = quota.get(g.kommun)!
      if (given < limit && n < g.addresses.length) {
        quota.set(g.kommun, n + 1)
        given++
      }
    }
  }
  return addresses.filter((a) => {
    const n = quota.get(a.kommun)!
    quota.set(a.kommun, n - 1)
    return n > 0
  })
}

/**
 * Slår ihop listan som redan syns med ett nytt svar, så att raderna inte hoppar medan källorna
 * svarar och medan man skriver vidare: rader som syns och finns kvar står still, nya läggs sist.
 * Samma adress känns igen på `sourceId` och `id`.
 */
export function stableMerge(shown: Address[], incoming: Address[]): Address[] {
  const key = (a: Address) => `${a.sourceId}/${a.id}`
  const fresh = new Map(incoming.map((a) => [key(a), a]))
  const kept = shown.flatMap((a) => fresh.get(key(a)) ?? [])
  const keptKeys = new Set(kept.map(key))
  return [...kept, ...incoming.filter((a) => !keptKeys.has(key(a)))]
}
