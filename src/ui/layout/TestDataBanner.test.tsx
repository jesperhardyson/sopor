import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Source } from '@/sources'
import { TestDataBanner } from './TestDataBanner'

const m = (testData: boolean): Source => ({
  id: 'avesta',
  name: 'Avesta Vatten och Avfall',
  url: 'https://www.avestavatten.se',
  kommuner: [{ code: '2084', name: 'Avesta kommun' }],
  config: { system: 'static' },
  testData,
})

const live: Source = { ...m(false), id: 'uppsala', kommuner: [{ code: '0380', name: 'Uppsala kommun' }] }

function renderAt(path: string, sources: Source[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TestDataBanner sources={sources} />
    </MemoryRouter>,
  )
}

describe('TestDataBanner', () => {
  it('säger vilka kommuner som har påhittade data', () => {
    renderAt('/', [m(true), live])
    expect(screen.getByRole('status')).toHaveTextContent(
      'Testversion – datumen för Avesta kommun är påhittade och gäller inte. Kolla alltid din kommuns hämtschema.',
    )
    expect(screen.queryByText(/Avesta Vatten och Avfall/)).toBeNull()
  })

  it('syns inte på resultatsidor för källor med riktiga data', () => {
    const { container } = renderAt('/uppsala/storgatan-2_uppsala-1', [m(true), live])
    expect(container).toBeEmptyDOMElement()
  })

  it('syns på resultatsidor för källor med testdata', () => {
    renderAt('/avesta/krylbo-storgatan-12b', [m(true), live])
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('syns inte när ingen källa har testdata', () => {
    const { container } = renderAt('/', [m(false)])
    expect(container).toBeEmptyDOMElement()
  })
})
