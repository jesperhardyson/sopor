import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScrollManager } from './ScrollManager'

describe('ScrollManager', () => {
  afterEach(() => vi.restoreAllMocks())

  it('scrollar till toppen vid sidbyte och till ankaret när det finns', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(
      <MemoryRouter initialEntries={['/om']}>
        <ScrollManager />
        <div id="mina-adresser" />
        <Link to="/avesta/x">resultat</Link>
        <Link to="/#mina-adresser">mina</Link>
      </MemoryRouter>,
    )
    scrollTo.mockClear()
    await userEvent.click(screen.getByRole('link', { name: 'resultat' }))
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    await userEvent.click(screen.getByRole('link', { name: 'mina' }))
    expect(scrollIntoView).toHaveBeenCalled()
  })
})
