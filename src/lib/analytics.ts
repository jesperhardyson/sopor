import type { BeforeSendEvent } from '@vercel/analytics/react'

/**
 * Döljer adressen i resultatsidans URL innan den skickas till Vercel Web Analytics,
 * så att statistiken inte visar vilka adresser som slås upp. Query och hash tas bort.
 */
export function redactUrl(url: string): string {
  const u = new URL(url)
  const parts = u.pathname.split('/').filter(Boolean)
  const path = parts.length === 2 && parts[0] !== 'om' ? `/${parts[0]}/[adress]` : u.pathname
  return `${u.origin}${path}`
}

export function beforeSend(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: redactUrl(event.url) }
}
