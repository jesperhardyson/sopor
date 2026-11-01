import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Address } from '@/domain/types'
import { homeySearchText } from '@/lib/homey'
import { SmartHomeBox } from './SmartHomeBox'

const address: Address = {
  id: 'östra-ågatan-13_uppsala-4001005',
  street: 'Östra Ågatan 13',
  locality: 'Uppsala',
  sourceId: 'uppsala',
  kommun: 'Uppsala kommun',
}
const apiUrl = 'https://sopor.hardyson.se/api/v1/adress/uppsala/%C3%B6stra-%C3%A5gatan-13_uppsala-4001005'

describe('homeySearchText', () => {
  it('är "gata, ort", som appen förstår', () => {
    expect(homeySearchText(address)).toBe('Östra Ågatan 13, Uppsala')
  })

  it('tar kommunen när orten saknas', () => {
    expect(homeySearchText({ ...address, locality: '' })).toBe('Östra Ågatan 13, Uppsala kommun')
  })
})

describe('SmartHomeBox', () => {
  it('visar Homey och Home Assistant med länkar', () => {
    render(<SmartHomeBox address={address} />)
    expect(screen.getByRole('heading', { name: 'Smarta hem' })).toBeInTheDocument()
    expect(screen.getByText('Få en påminnelse kvällen innan, i Homey eller Home Assistant.')).toBeInTheDocument()
    expect(screen.getByText('Testversion')).toBeInTheDocument()
    expect(screen.getByText('Kommer snart')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Installera Sophämtning i Homey/ })).toHaveAttribute('href', 'https://homey.app/a/se.hardyson.sopor/test/')
    expect(screen.getByRole('link', { name: /Guide för Home Assistant/ })).toHaveAttribute(
      'href',
      'https://github.com/jesperhardyson/sopor/blob/main/docs/api.md#home-assistant',
    )
    expect(screen.getByText('Östra Ågatan 13, Uppsala')).toBeInTheDocument()
  })

  it('kopierar söktexten för Homey', async () => {
    const user = userEvent.setup()
    render(<SmartHomeBox address={address} />)
    await user.click(screen.getByRole('button', { name: 'Kopiera söktexten' }))
    expect(await navigator.clipboard.readText()).toBe('Östra Ågatan 13, Uppsala')
  })

  it('kopierar API-länken för utvecklare', async () => {
    const user = userEvent.setup()
    render(<SmartHomeBox address={address} origin="https://sopor.hardyson.se" />)
    await user.click(screen.getByRole('button', { name: 'Kopiera API-länken' }))
    expect(await navigator.clipboard.readText()).toBe(apiUrl)
    expect(screen.getByRole('link', { name: /API-länk för utvecklare/ })).toHaveAttribute('href', apiUrl)
  })
})
