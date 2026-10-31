import { SITE } from '@/config'
import type { Address } from '@/domain/types'

/** I produktion används sajtens egen adress så att preview-deployer pekar på sig själva. */
export function defaultOrigin(): string {
  return import.meta.env.PROD && typeof window !== 'undefined' ? window.location.origin : SITE.origin
}

export function absoluteIcsUrl(icsPath: string, origin: string = SITE.origin): string {
  return new URL(icsPath, origin).toString()
}

export function webcalUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https?:\/\//, 'webcal://')
}

export function googleCalendarUrl(webcal: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`
}

export function isAndroid(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /android/i.test(userAgent)
}

/** Adressens svar i det publika API:t, för hemautomation och andra integrationer. */
export function apiUrl(address: Address, origin: string = SITE.origin): string {
  return new URL(`/api/v1/adress/${encodeURIComponent(address.sourceId)}/${encodeURIComponent(address.id)}`, origin).toString()
}
