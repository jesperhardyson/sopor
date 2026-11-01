import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IntegrationCards } from './IntegrationCards'

describe('IntegrationCards', () => {
  it('har ett kort för Homey med installationslänk', () => {
    render(<IntegrationCards />)
    const homey = screen.getByRole('article', { name: 'Homey' })
    expect(within(homey).getByText('Testversion')).toBeInTheDocument()
    expect(within(homey).getByText('Påminnelse kvällen innan, eller på morgonen')).toBeInTheDocument()
    expect(within(homey).getByRole('link', { name: /Installera i Homey/ })).toHaveAttribute('href', 'https://homey.app/a/se.hardyson.sopor/test/')
  })

  it('har ett kort för Home Assistant med installationslänk och inget märke', () => {
    render(<IntegrationCards />)
    const ha = screen.getByRole('article', { name: 'Home Assistant' })
    expect(within(ha).queryByText('Kommer snart')).not.toBeInTheDocument()
    expect(within(ha).getByText('Integrationen Sophämtning · via HACS')).toBeInTheDocument()
    expect(within(ha).getByText('Påminnelse kvällen innan, via kalendern')).toBeInTheDocument()
    expect(within(ha).getByRole('link', { name: /Installera via HACS/ })).toHaveAttribute(
      'href',
      'https://github.com/jesperhardyson/sopor/blob/main/integrations/home-assistant/README.md',
    )
  })
})
