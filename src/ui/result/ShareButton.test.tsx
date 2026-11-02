import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from './ShareButton'

const url = 'https://sopor.hardyson.se/uppsala/svartb%C3%A4cksgatan-10_uppsala-4000999'

describe('ShareButton', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('öppnar telefonens delningsmeny med adressen och länken', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, share })
    render(<ShareButton title="Svartbäcksgatan 10, Uppsala" url={url} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dela' }))
    expect(share).toHaveBeenCalledWith({ title: 'Svartbäcksgatan 10, Uppsala – Sopor', url })
  })

  it('kopierar länken när det inte finns någon delningsmeny', async () => {
    const user = userEvent.setup()
    render(<ShareButton title="Svartbäcksgatan 10, Uppsala" url={url} />)
    await user.click(screen.getByRole('button', { name: 'Dela' }))
    expect(await navigator.clipboard.readText()).toBe(url)
    expect(screen.getByRole('status')).toHaveTextContent('Länken är kopierad')
  })

  it('kraschar inte när man avbryter delningen', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn(async () => Promise.reject(new DOMException('', 'AbortError'))) })
    render(<ShareButton title="Svartbäcksgatan 10, Uppsala" url={url} />)
    await userEvent.click(screen.getByRole('button', { name: 'Dela' }))
    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})
