// Klient mot Soporas publika API v1. Bara det som appen behöver av svaren är typat.

export const BASE_URL = 'https://sopor.hardyson.se/api/v1'

export interface SoporAddress {
  id: string
  street: string
  locality: string
  kommun: string
  source: string
  detail: string | null
}

export interface SoporSearchHit extends SoporAddress {
  url: string
}

export interface SoporSearch {
  addresses: SoporSearchHit[]
  failed: string[]
}

export interface SoporEvent {
  date: string
  fractions: string[]
  estimated: boolean
  deviation: { originalDate: string | null; reason: string } | null
  warning: string | null
}

export interface SoporFraction {
  name: string
  short: string
  color: string
  icon: string
}

export interface SoporSchedule {
  apiVersion: string
  today: string
  address: SoporAddress
  events: SoporEvent[]
  fractions: Record<string, SoporFraction>
  links: { ics: string; web: string }
}

/** `status` 0 betyder nätfel eller timeout. `code` är API:ts felkod. */
export class SoporError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SoporError'
  }
}

interface ClientOptions {
  fetch: typeof globalThis.fetch
  userAgent: string
  timeoutMs?: number
}

export function createClient({ fetch, userAgent, timeoutMs = 15_000 }: ClientOptions) {
  async function get<T>(url: string): Promise<T> {
    let res: Response
    try {
      res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      throw new SoporError(0, 'network', `Sopor svarar inte (${(error as Error).message})`)
    }
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    if (res.ok && body) return body as T
    const fallback = res.status === 502 ? 'source_unavailable' : 'unknown'
    throw new SoporError(res.status, body?.error?.code ?? fallback, body?.error?.message ?? `Sopor svarade ${res.status}`)
  }

  return {
    search: (q: string) => get<SoporSearch>(`${BASE_URL}/sok?${new URLSearchParams({ q })}`),
    schedule: (url: string) => get<SoporSchedule>(url),
  }
}

export type SoporClient = ReturnType<typeof createClient>
