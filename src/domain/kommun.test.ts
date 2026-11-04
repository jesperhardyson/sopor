import { describe, expect, it } from 'vitest'
import { kommunInText } from './kommun'

describe('kommunInText', () => {
  it('kortar namn utan genitiv', () => {
    expect(kommunInText('Avesta kommun')).toBe('Avesta')
    expect(kommunInText('Hedemora kommun')).toBe('Hedemora')
  })

  it('behåller hela namnet när det slutar på s, eftersom genitiv och Borås inte går att skilja åt', () => {
    expect(kommunInText('Säters kommun')).toBe('Säters kommun')
    expect(kommunInText('Borås kommun')).toBe('Borås kommun')
  })

  it('lämnar andra namn orörda', () => {
    expect(kommunInText('Region Gotland')).toBe('Region Gotland')
  })
})
