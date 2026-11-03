export const USER_AGENT = 'Sopor/1.0 (+https://sopor.hardyson.se)'

/** Källan svarade inte, svarade med fel eller med något annat än JSON. */
export class SourceError extends Error {
  name = 'SourceError'
}

type FetchOptions = { timeoutMs?: number; fetchFn?: typeof fetch }

/** Anropet med Sopors User-Agent. Ingen kontakt, en felkod eller fel innehållstyp ger SourceError. */
async function request(url: string, init: RequestInit, accept: string, kind: string, { timeoutMs = 3000, fetchFn = fetch }: FetchOptions): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('User-Agent', USER_AGENT)
  headers.set('Accept', accept)
  let res: Response
  try {
    res = await fetchFn(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    throw new SourceError(`Ingen kontakt med ${new URL(url).host}: ${(error as Error).message}`)
  }
  if (!res.ok) throw new SourceError(`${new URL(url).host} svarade ${res.status}`)
  if (!res.headers.get('Content-Type')?.includes(accept.split('/')[1])) throw new SourceError(`${new URL(url).host} svarade inte med ${kind}`)
  return res
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, opts: FetchOptions = {}): Promise<T> {
  const res = await request(url, init, 'application/json', 'JSON', opts)
  try {
    return (await res.json()) as T
  } catch {
    throw new SourceError(`${new URL(url).host} svarade med ogiltig JSON`)
  }
}

/** En kalenderfil (ICS) som text, med samma fel som fetchJson. */
export async function fetchCalendar(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await request(url, {}, 'text/calendar', 'ICS', opts)
  return res.text()
}
