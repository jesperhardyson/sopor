import { describe, expect, it } from 'vitest'
import { absoluteIcsUrl, apiUrl, googleCalendarUrl, webcalUrl } from './calendar-links'

describe('kalenderlänkar', () => {
  it('gör en absolut https-adress av ics-sökvägen', () => {
    expect(absoluteIcsUrl('/ics/avesta/a.ics')).toBe('https://sopor.hardyson.se/ics/avesta/a.ics')
    expect(absoluteIcsUrl('/ics/avesta/a.ics', 'https://sopor-git-x.vercel.app')).toBe(
      'https://sopor-git-x.vercel.app/ics/avesta/a.ics',
    )
  })

  it('byter https mot webcal', () => {
    expect(webcalUrl('https://sopor.hardyson.se/ics/avesta/a.ics')).toBe('webcal://sopor.hardyson.se/ics/avesta/a.ics')
  })

  it('bygger Google Kalenders prenumerationslänk', () => {
    expect(googleCalendarUrl('webcal://sopor.hardyson.se/ics/avesta/a.ics')).toBe(
      'https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fsopor.hardyson.se%2Fics%2Favesta%2Fa.ics',
    )
  })

  it('bygger adressens API-länk med kodat id', () => {
    const address = { id: 'östra-ågatan-13_uppsala-4001005', street: 'Östra Ågatan 13', locality: 'Uppsala', sourceId: 'uppsala', kommun: 'Uppsala kommun' }
    expect(apiUrl(address)).toBe('https://sopor.hardyson.se/api/v1/adress/uppsala/%C3%B6stra-%C3%A5gatan-13_uppsala-4001005')
    expect(apiUrl(address, 'https://sopor-git-x.vercel.app')).toMatch(/^https:\/\/sopor-git-x\.vercel\.app\/api\/v1\/adress\/uppsala\//)
  })
})
