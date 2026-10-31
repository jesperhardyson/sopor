import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { MobileMenu } from './MobileMenu'

function renderMenu() {
  return render(
    <MemoryRouter>
      <MobileMenu />
      <Routes>
        <Route path="/" element={<p>Startsidan</p>} />
        <Route path="/om" element={<p>Om-sidan</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MobileMenu', () => {
  it('öppnas från menyknappen och visar alla länkar', async () => {
    renderMenu()
    const button = screen.getByRole('button', { name: 'Öppna menyn' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    const dialog = screen.getByRole('dialog', { name: 'Meny' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mina adresser' })).toHaveAttribute('href', '/#mina-adresser')
    expect(screen.getByRole('link', { name: 'Om' })).toHaveAttribute('href', '/om')
    expect(screen.getByRole('link', { name: 'Bidra' })).toHaveAttribute('href', '/bidra')
    expect(screen.getByRole('link', { name: 'Kontakt' })).toHaveAttribute('href', 'mailto:support@hardyson.se')
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/jesperhardyson/sopor')
  })

  it('stängs och navigerar när man väljer en sida', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Öppna menyn' }))
    await userEvent.click(screen.getByRole('link', { name: 'Om' }))
    expect(screen.getByText('Om-sidan')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stängs med Stäng-knappen', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Öppna menyn' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
