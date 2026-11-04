/** Sidans data i den statiska HTML-filen, så att appen kan ta över utan att innehållet blinkar bort. */
export const EMBEDDED_ID = 'sopor-sidans-data'

/** Datablocket för en statisk sida. "<" escapas, så att inget i datan kan avsluta blocket. */
export function embeddedScript(path: string, data: unknown): string {
  const json = JSON.stringify({ path, data }).replace(/</g, '\\u003c')
  return `<script type="application/json" id="${EMBEDDED_ID}">${json}</script>`
}

/** Datan i filen, bara om den hör till sökvägen. Efter en navigering i appen gör den inte det. */
export function embeddedData<T>(pathname: string): T | undefined {
  const text = document.getElementById(EMBEDDED_ID)?.textContent
  if (!text) return undefined
  try {
    const { path, data } = JSON.parse(text) as { path: string; data: T }
    return path === pathname.replace(/\/+$/, '') ? data : undefined
  } catch {
    return undefined
  }
}
