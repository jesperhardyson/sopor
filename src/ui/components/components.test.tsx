import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { Footer } from '../layout/Footer'
import { Deviation } from './Deviation'
import { FractionChip } from './FractionChip'
import { ThemeToggle } from './ThemeToggle'

describe('FractionChip', () => {
  it('visar fraktionens namn och ikon', () => {
    const { container } = render(<FractionChip fraction="papper" />)
    expect(screen.getByText('Pappersförpackningar')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-package')).not.toBeNull()
  })
})

describe('Deviation', () => {
  it('visar standardtexten för helgdag', () => {
    render(<Deviation />)
    expect(screen.getByText('Flyttad · helgdag')).toBeInTheDocument()
  })
})

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    localStorage.clear()
  })

  it('växlar mörkt läge och kommer ihåg valet', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button', { name: /mörkt läge/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('sopor.theme')).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: /ljust läge/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

describe('Footer', () => {
  it('har friskrivning, Om, Kontakt och länk till avfallsbolaget', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    )
    expect(screen.getByText('Inofficiell tjänst. Vid avvikelser gäller kommunens information.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Om' })).toHaveAttribute('href', '/om')
    expect(screen.getByRole('link', { name: 'Kontakt' })).toHaveAttribute('href', 'mailto:support@hardyson.se')
    expect(screen.getByRole('link', { name: 'Avesta Vatten och Avfall' })).toHaveAttribute(
      'href',
      'https://www.avestavatten.se',
    )
  })
})
