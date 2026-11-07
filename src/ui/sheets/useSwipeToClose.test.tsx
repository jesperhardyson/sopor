import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSwipeToClose } from './useSwipeToClose'

function Ark({ onClose }: { onClose: () => void }) {
  const ref = useSwipeToClose(onClose)
  return (
    <div ref={ref} data-testid="ark">
      <input aria-label="Namn" />
      <p>Innehåll</p>
    </div>
  )
}

const pause = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)))
const touch = (clientX: number, clientY: number) => ({ touches: [{ clientX, clientY }], changedTouches: [{ clientX, clientY }] })

function setup() {
  const onClose = vi.fn()
  render(<Ark onClose={onClose} />)
  const sheet = screen.getByTestId('ark')
  Object.defineProperty(sheet, 'offsetHeight', { value: 400 })
  return { onClose, sheet }
}

/** Sveper från y = 100 till y = 100 + dy, med en paus så att farten blir låg. */
async function swipe(target: Element, dy: number, { dx = 0, slow = true } = {}) {
  fireEvent.touchStart(target, touch(50, 100))
  if (slow) await pause(150)
  fireEvent.touchMove(target, touch(50 + dx, 100 + dy))
  if (slow) await pause(150)
  fireEvent.touchEnd(target, { touches: [], changedTouches: [{ clientX: 50 + dx, clientY: 100 + dy }] })
}

describe('useSwipeToClose', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('följer fingret och stänger arket efter ett långt svep nedåt', async () => {
    const { onClose, sheet } = setup()
    fireEvent.touchStart(sheet, touch(50, 100))
    fireEvent.touchMove(sheet, touch(50, 220))
    expect(sheet.style.transform).toBe('translateY(120px)')
    fireEvent.touchEnd(sheet, { touches: [], changedTouches: [{ clientX: 50, clientY: 220 }] })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('går tillbaka efter ett kort, långsamt svep', async () => {
    const { onClose, sheet } = setup()
    await swipe(sheet, 40)
    await pause(260)
    expect(onClose).not.toHaveBeenCalled()
    expect(sheet.style.transform).toBe('')
  })

  it('stänger efter en snabb nedåtrörelse, även om den är kort', async () => {
    const { onClose, sheet } = setup()
    await swipe(sheet, 50, { slow: false })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('hindrar sidan från att scrolla medan arket dras', () => {
    const { sheet } = setup()
    fireEvent.touchStart(sheet, touch(50, 100))
    expect(fireEvent.touchMove(sheet, touch(50, 130))).toBe(false)
  })

  it('låter innehållet scrolla när arket inte är högst upp', async () => {
    const { onClose, sheet } = setup()
    sheet.scrollTop = 40
    fireEvent.touchStart(sheet, touch(50, 100))
    expect(fireEvent.touchMove(sheet, touch(50, 300))).toBe(true)
    fireEvent.touchEnd(sheet, { touches: [], changedTouches: [{ clientX: 50, clientY: 300 }] })
    await pause(260)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('reagerar inte på svep uppåt eller åt sidan', async () => {
    const { onClose, sheet } = setup()
    await swipe(sheet, -200)
    await swipe(sheet, 40, { dx: 200 })
    await pause(260)
    expect(onClose).not.toHaveBeenCalled()
    expect(sheet.style.transform).toBe('')
  })

  it('startar inte från ett textfält', async () => {
    const { onClose } = setup()
    await swipe(screen.getByLabelText('Namn'), 300)
    await pause(260)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('reagerar inte på två fingrar', async () => {
    const { onClose, sheet } = setup()
    fireEvent.touchStart(sheet, { touches: [{ clientX: 0, clientY: 0 }, { clientX: 9, clientY: 9 }] })
    fireEvent.touchMove(sheet, touch(50, 400))
    fireEvent.touchEnd(sheet, { touches: [], changedTouches: [{ clientX: 50, clientY: 400 }] })
    await pause(260)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('går tillbaka när webbläsaren avbryter gesten', async () => {
    const { onClose, sheet } = setup()
    fireEvent.touchStart(sheet, touch(50, 100))
    fireEvent.touchMove(sheet, touch(50, 300))
    fireEvent.touchCancel(sheet, { touches: [], changedTouches: [] })
    await pause(260)
    expect(onClose).not.toHaveBeenCalled()
    expect(sheet.style.transform).toBe('')
  })

  it('är avstängd där arket är en centrerad dialog', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width') }))
    const { onClose, sheet } = setup()
    await swipe(sheet, 300)
    await pause(260)
    expect(onClose).not.toHaveBeenCalled()
    expect(sheet.style.transform).toBe('')
  })
})
