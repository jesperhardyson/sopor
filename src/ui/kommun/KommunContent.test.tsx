import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, StaticRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { KommunPage } from '@/data/kommun-pages'
import { KommunContent } from './KommunContent'
import { KommunerContent } from './KommunerContent'
import { StaticSearch } from './StaticSearch'

const uppsala: KommunPage = {
  code: '0380',
  name: 'Uppsala kommun',
  slug: 'uppsala-kommun',
  covered: true,
  sources: [{ name: 'Uppsala Vatten', url: 'https://www.uppsalavatten.se' }],
  orter: ['Uppsala', 'Storvreta'],
}
const goteborg: KommunPage = { code: '1480', name: 'Göteborgs kommun', slug: 'goteborgs-kommun', covered: false, sources: [], orter: ['Göteborg'] }

const show = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('KommunContent för en kommun som finns', () => {
  it('visar rubrik, sökfält, källa, orter och länk till alla kommuner', () => {
    show(<KommunContent page={uppsala} search={<input aria-label="Sök" />} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Sophämtning i Uppsala kommun' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Sök' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Uppsala Vatten' })).toHaveAttribute('href', 'https://www.uppsalavatten.se')
    expect(screen.getByText('Uppsala, Storvreta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se alla kommuner' })).toHaveAttribute('href', '/kommuner')
  })

  it('nämner alla källor när kommunen har flera', () => {
    const page = { ...uppsala, sources: [...uppsala.sources, { name: 'Annat bolag', url: 'https://example.se' }] }
    show(<KommunContent page={page} search={null} />)
    expect(screen.getByRole('link', { name: 'Annat bolag' })).toBeInTheDocument()
  })
})

describe('KommunContent för en kommun som saknas', () => {
  it('berättar att Sopor inte finns där än och länkar till Bidra, utan sökfält', () => {
    show(<KommunContent page={goteborg} search={<input aria-label="Sök" />} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Sophämtning i Göteborgs kommun' })).toBeInTheDocument()
    expect(screen.getByText(/Sopor finns inte i Göteborgs kommun än\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tipsa om din kommun' })).toHaveAttribute('href', '/bidra')
    expect(screen.queryByRole('textbox', { name: 'Sök' })).not.toBeInTheDocument()
  })

  it('utelämnar orterna när datan saknar dem', () => {
    show(<KommunContent page={{ ...goteborg, orter: [] }} search={null} />)
    expect(screen.queryByRole('heading', { name: 'Orter i kommunen' })).not.toBeInTheDocument()
  })
})

describe('KommunerContent', () => {
  it('delar upp kommunerna i två räknade listor med länkar', () => {
    show(<KommunerContent kommuner={[uppsala, goteborg]} />)
    expect(screen.getByRole('heading', { name: 'Här finns Sopor (1)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Inte än (1)' })).toBeInTheDocument()
    expect(screen.getByText(/Sopor finns i 1 av Sveriges 2 kommuner/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Uppsala kommun' })).toHaveAttribute('href', '/kommuner/uppsala-kommun')
  })
})

describe('StaticSearch', () => {
  it('ser ut som sökfältet men går inte att använda förrän appen tagit över', () => {
    render(<StaticSearch />)
    expect(screen.getByRole('textbox', { name: 'Din adress' })).toBeDisabled()
    expect(screen.getByPlaceholderText('Skriv din adress, t.ex. Storgatan 12')).toBeInTheDocument()
  })
})

describe('utan webbläsare', () => {
  it('renderas till HTML, som bygget gör', () => {
    const kommun = renderToStaticMarkup(
      <StaticRouter location="/kommuner/uppsala-kommun">
        <KommunContent page={uppsala} search={null} />
      </StaticRouter>,
    )
    expect(kommun).toContain('Sophämtning i Uppsala kommun')
    const alla = renderToStaticMarkup(
      <StaticRouter location="/kommuner">
        <KommunerContent kommuner={[uppsala]} />
      </StaticRouter>,
    )
    expect(alla).toContain('Sophämtning i Sveriges kommuner')
  })
})
