import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Municipality } from '@/municipalities'
import { TestDataBanner } from './TestDataBanner'

const m = (testData: boolean): Municipality => ({
  id: 'avesta',
  name: 'Avesta kommun',
  shortName: 'Avesta',
  operator: { name: 'Avesta Vatten och Avfall', url: 'https://www.avestavatten.se' },
  provider: { type: 'static' },
  testData,
})

describe('TestDataBanner', () => {
  it('varnar när en kommun har påhittade data', () => {
    render(<TestDataBanner municipalities={[m(true)]} />)
    expect(screen.getByRole('status')).toHaveTextContent('Testversion – datumen är påhittade och gäller inte.')
    expect(screen.getByRole('link', { name: /Avesta Vatten och Avfall/ })).toHaveAttribute('href', 'https://www.avestavatten.se')
  })

  it('syns inte när datan är riktig', () => {
    const { container } = render(<TestDataBanner municipalities={[m(false)]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
