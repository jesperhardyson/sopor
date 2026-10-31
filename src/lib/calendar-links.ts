import { SITE } from '@/config'

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
