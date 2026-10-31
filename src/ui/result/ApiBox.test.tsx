import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Address } from '@/domain/types'
import { ApiBox } from './ApiBox'

const address: Address = {
  id: 'östra-ågatan-13_uppsala-4001005',
  street: 'Östra Ågatan 13',
  locality: 'Uppsala',
  sourceId: 'uppsala',
  kommun: 'Uppsala kommun',
}
const url = 'https://sopor.hardyson.se/api/v1/adress/uppsala/%C3%B6stra-%C3%A5gatan-13_uppsala-4001005'

describe('ApiBox', () => {
  it('visar adressens API-adress och länkar till dokumentationen', () => {
    render(<ApiBox address={address} />)
    expect(screen.getByRole('heading', { name: 'API' })).toBeInTheDocument()
    expect(screen.getByText('Hämta adressens schema som JSON, till exempel i Home Assistant eller Homey.')).toBeInTheDocument()
    expect(screen.getByText(url)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /API-dokumentation/ })).toHaveAttribute(
      'href',
      'https://github.com/jesperhardyson/sopor/blob/main/docs/api.md',
    )
  })

  it('kopierar adressen', async () => {
    const user = userEvent.setup()
    render(<ApiBox address={address} />)
    await user.click(screen.getByRole('button', { name: 'Kopiera' }))
    expect(await navigator.clipboard.readText()).toBe(url)
    expect(screen.getByRole('button', { name: 'Kopierad' })).toBeInTheDocument()
  })
})
