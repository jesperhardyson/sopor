import { describe, expect, it } from 'vitest'
import { streetAndLocality } from './address'

describe('streetAndLocality', () => {
  it('skriver gata och ort', () => {
    expect(streetAndLocality({ street: 'Storgatan 1', locality: 'Slite' })).toBe('Storgatan 1, Slite')
  })

  it('skriver bara gatan när orten saknas', () => {
    expect(streetAndLocality({ street: 'Storgatan 11', locality: '' })).toBe('Storgatan 11')
  })
})
