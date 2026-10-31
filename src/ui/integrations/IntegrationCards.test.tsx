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

  it('har ett kort för Home Assistant som hänvisar till guiden', () => {
    render(<IntegrationCards />)
    const ha = screen.getByRole('article', { name: 'Home Assistant' })
    expect(within(ha).getByText('Kommer snart')).toBeInTheDocument()
    expect(within(ha).getByRole('link', { name: /Så gör du i dag/ })).toHaveAttribute(
      'href',
      'https://github.com/jesperhardyson/sopor/blob/main/docs/api.md#home-assistant',
    )
  })
})
