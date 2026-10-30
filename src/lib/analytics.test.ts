import { describe, expect, it } from 'vitest'
import { redactUrl } from './analytics'

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
})
