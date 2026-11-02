import { pageview } from '@vercel/analytics'
import type { BeforeSendEvent } from '@vercel/analytics/react'

/**
 * Döljer adressen i resultatsidans URL innan den skickas till Vercel Web Analytics,
 * så att statistiken inte visar vilka adresser som slås upp. Query och hash tas bort.
 */
export function redactUrl(url: string): string {
  const u = new URL(url)
  const parts = u.pathname.split('/').filter(Boolean)
  const path = parts.length === 2 && !['om', 'saknas'].includes(parts[0]) ? `/${parts[0]}/[adress]` : u.pathname
  return `${u.origin}${path}`
}

export function beforeSend(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: redactUrl(event.url) }
}

const reported = new Set<string>()

/**
 * Räknar sökningar på orter i kommuner som Sopor saknar, som sidvisningar av /saknas/<kommun>.
 * Egna händelser (track) kräver Vercels Pro-plan; sidvisningar ingår i Hobby. Bara kommunens
 * namn skickas, aldrig adressen, och varje kommun räknas en gång per sidbesök.
 */
export function reportMissingKommun(kommuner: string[]) {
  for (const kommun of kommuner) {
    if (reported.has(kommun)) continue
    reported.add(kommun)
    pageview({ route: '/saknas/[kommun]', path: `/saknas/${slug(kommun)}` })
  }
}

/** "Älvkarleby kommun" → alvkarleby-kommun */
const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
