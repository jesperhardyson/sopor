// Sajtens egna statiska filer (public/), hämtade från anropets origin.

import { SourceError, USER_AGENT } from './http.js'

/** 404 ger null. Nätverksfel, andra felstatus och ogiltig JSON ger SourceError. */
export async function siteJson<T>(
  origin: string,
  path: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<T | null> {
  const url = `${origin}${path}`
  let res: Response
  try {
    res = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    throw new SourceError(`Ingen kontakt med ${path}: ${(error as Error).message}`)
  }
  if (res.status === 404) return null
  if (!res.ok) throw new SourceError(`${path} svarade ${res.status}`)
  try {
    return (await res.json()) as T
  } catch {
    throw new SourceError(`${path} svarade med ogiltig JSON`)
  }
}

/** Ort → kommun per källa (orter.json). Fel ger en tom tabell: orten faller då tillbaka på källans namn. */
export async function loadServerPlaces(
  origin: string,
  fetchFn?: typeof fetch,
): Promise<Record<string, Record<string, string>>> {
  try {
    return (await siteJson<Record<string, Record<string, string>>>(origin, '/data/orter.json', fetchFn)) ?? {}
  } catch {
    return {}
  }
}
