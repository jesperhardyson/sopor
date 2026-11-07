// Sajtens egna statiska filer (public/), hämtade från anropets origin.

import { SourceError, USER_AGENT } from './http.js'

/** Filerna ändras bara vid driftsättning, så de sparas under funktionens livstid. Fel sparas inte. */
const saved = new Map<string, Promise<unknown>>()
const MAX_SAVED = 2000

/** 404 ger null. Nätverksfel, andra felstatus och ogiltig JSON ger SourceError. */
export function siteJson<T>(origin: string, path: string, fetchFn?: typeof fetch, timeoutMs?: number): Promise<T | null> {
  if (fetchFn) return readSiteJson<T>(origin, path, fetchFn, timeoutMs)
  const key = `${origin}${path}`
  let file = saved.get(key) as Promise<T | null> | undefined
  if (!file) {
    if (saved.size >= MAX_SAVED) saved.clear()
    file = readSiteJson<T>(origin, path, fetch, timeoutMs)
    file.catch(() => saved.delete(key))
    saved.set(key, file)
  }
  return file
}

async function readSiteJson<T>(origin: string, path: string, fetchFn: typeof fetch, timeoutMs = 3000): Promise<T | null> {
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

/** Ort → kommun per källa (orter.json). Fel ger en tom tabell: orten visas då som den är. */
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
