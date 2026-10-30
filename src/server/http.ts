export const USER_AGENT = 'Sopor/1.0 (+https://sopor.hardyson.se)'

/** Källan svarade inte, svarade med fel eller med något annat än JSON. */
export class SourceError extends Error {
  name = 'SourceError'
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  { timeoutMs = 3000, fetchFn = fetch }: { timeoutMs?: number; fetchFn?: typeof fetch } = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('User-Agent', USER_AGENT)
  headers.set('Accept', 'application/json')
  let res: Response
  try {
    res = await fetchFn(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    throw new SourceError(`Ingen kontakt med ${new URL(url).host}: ${(error as Error).message}`)
  }
  if (!res.ok) throw new SourceError(`${new URL(url).host} svarade ${res.status}`)
  if (!res.headers.get('Content-Type')?.includes('json')) throw new SourceError(`${new URL(url).host} svarade inte med JSON`)
  try {
    return (await res.json()) as T
  } catch {
    throw new SourceError(`${new URL(url).host} svarade med ogiltig JSON`)
  }
}
