import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, useNavigate } from 'react-router'
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

  it('återställer scrollpositionen när man går tillbaka', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    function Back() {
      const navigate = useNavigate()
      return <button onClick={() => navigate(-1)}>tillbaka</button>
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollManager />
        <Link to="/avesta/x">resultat</Link>
        <Back />
      </MemoryRouter>,
    )
    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true })
    fireEvent.scroll(window)
    await userEvent.click(screen.getByRole('link', { name: 'resultat' }))
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)

    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    await userEvent.click(screen.getByRole('button', { name: 'tillbaka' }))
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640)
  })

  it('väntar in innehåll som laddas och sparar inte den klämda positionen under tiden', async () => {
    // Sidan är för kort först, så webbläsaren klämmer positionen till sidans höjd
    let height = 200
    const setY = (y: number) => Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(((_x: number, y: number) => {
      setY(Math.min(y, height))
      fireEvent.scroll(window)
    }) as typeof window.scrollTo)
    let grow: () => void = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          grow = cb
        }
        observe() {}
        disconnect() {}
      },
    )
    function Nav() {
      const navigate = useNavigate()
      return (
        <>
          <button onClick={() => navigate(-1)}>tillbaka</button>
          <button onClick={() => navigate(1)}>framåt</button>
        </>
      )
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollManager />
        <Link to="/uppsala/x">resultat</Link>
        <Nav />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('link', { name: 'resultat' }))
    height = 2000
    setY(500)
    fireEvent.scroll(window)
    await userEvent.click(screen.getByRole('button', { name: 'tillbaka' }))

    height = 200
    await userEvent.click(screen.getByRole('button', { name: 'framåt' }))
    expect(window.scrollY).toBe(200)

    height = 2000
    grow()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 500)
    expect(window.scrollY).toBe(500)
    vi.unstubAllGlobals()
  })
})
