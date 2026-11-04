import { pageview } from '@vercel/analytics'
import { describe, expect, it, vi } from 'vitest'
import { redactUrl, reportMissingKommun } from './analytics'

vi.mock('@vercel/analytics', () => ({ pageview: vi.fn() }))

describe('redactUrl', () => {
  it('döljer adress-id i resultatsidans URL', () => {
    expect(redactUrl('https://sopor.hardyson.se/avesta/krylbo-storgatan-12b')).toBe(
      'https://sopor.hardyson.se/avesta/[adress]',
    )
    expect(redactUrl('https://sopor.hardyson.se/avesta/krylbo-storgatan-12b?x=1#y')).toBe(
      'https://sopor.hardyson.se/avesta/[adress]',
    )
  })

  it('lämnar övriga sidor orörda', () => {
    expect(redactUrl('https://sopor.hardyson.se/')).toBe('https://sopor.hardyson.se/')
    expect(redactUrl('https://sopor.hardyson.se/om')).toBe('https://sopor.hardyson.se/om')
  })

  it('lämnar kommunsidorna orörda, de innehåller ingen adress', () => {
    expect(redactUrl('https://sopor.hardyson.se/kommuner/uppsala-kommun')).toBe('https://sopor.hardyson.se/kommuner/uppsala-kommun')
  })

  it('lämnar sidvisningarna för saknade kommuner orörda', () => {
    expect(redactUrl('https://sopor.hardyson.se/saknas/stockholms-kommun')).toBe(
      'https://sopor.hardyson.se/saknas/stockholms-kommun',
    )
  })
})

describe('reportMissingKommun', () => {
  it('skickar en sidvisning per kommun, med bara kommunens namn', () => {
    reportMissingKommun(['Stockholms kommun', 'Region Gotland', 'Älvkarleby kommun'])
    expect(vi.mocked(pageview).mock.calls).toEqual([
      [{ route: '/saknas/[kommun]', path: '/saknas/stockholms-kommun' }],
      [{ route: '/saknas/[kommun]', path: '/saknas/region-gotland' }],
      [{ route: '/saknas/[kommun]', path: '/saknas/alvkarleby-kommun' }],
    ])
  })

  it('räknar varje kommun en gång per sidbesök', () => {
    vi.mocked(pageview).mockClear()
    reportMissingKommun(['Hedemora kommun'])
    reportMissingKommun(['Hedemora kommun'])
    reportMissingKommun(['Stockholms kommun'])
    expect(vi.mocked(pageview).mock.calls).toEqual([[{ route: '/saknas/[kommun]', path: '/saknas/hedemora-kommun' }]])
  })
})
