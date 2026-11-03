import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/** Scrollpositionen per historikpost, så att Tillbaka hamnar där man var */
const positions = new Map<string, number>()

/** Så länge en återställning väntar på att sidan ska bli hög nog (schemat laddas) */
const RESTORE_MS = 2000

/**
 * Scrollar till y och fortsätter när sidan växer, tills den når dit, tiden går ut eller man
 * själv tar över. Ger en funktion som avbryter.
 */
function restore(y: number, onDone: () => void): () => void {
  window.scrollTo(0, y)
  if (Math.abs(window.scrollY - y) < 1 || typeof ResizeObserver === 'undefined') {
    onDone()
    return () => {}
  }
  const userEvents = ['wheel', 'touchstart', 'keydown'] as const
  const stop = () => {
    observer.disconnect()
    clearTimeout(timer)
    for (const e of userEvents) removeEventListener(e, stop)
    onDone()
  }
  const observer = new ResizeObserver(() => {
    window.scrollTo(0, y)
    if (Math.abs(window.scrollY - y) < 1) stop()
  })
  observer.observe(document.body)
  const timer = setTimeout(stop, RESTORE_MS)
  for (const e of userEvents) addEventListener(e, stop, { passive: true })
  return stop
}

/**
 * Till toppen vid sidbyte, till ankaret (t.ex. /#mina-adresser) när det finns, och till den
 * sparade positionen när man går tillbaka eller framåt.
 */
export function ScrollManager() {
  const { pathname, hash, key } = useLocation()
  const navigationType = useNavigationType()
  const current = useRef(key)
  // Medan en återställning pågår är positionen klämd av en för kort sida och ska inte sparas.
  const restoring = useRef(false)
  const stopRestore = useRef<() => void>(undefined)

  useEffect(() => {
    try {
      history.scrollRestoration = 'manual'
    } catch {
      // Webbläsaren sköter det själv
    }
    const remember = () => {
      if (!restoring.current) positions.set(current.current, window.scrollY)
    }
    addEventListener('scroll', remember, { passive: true })
    return () => removeEventListener('scroll', remember)
  }, [])

  // Före målningen, så att sidan inte hinner synas på fel ställe
  useLayoutEffect(() => {
    stopRestore.current?.()
    current.current = key
    const saved = positions.get(key)
    if (navigationType === 'POP' && saved !== undefined) {
      restoring.current = true
      stopRestore.current = restore(saved, () => (restoring.current = false))
    } else if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: 'smooth' })
    } else {
      window.scrollTo(0, 0)
    }
  }, [pathname, hash, key, navigationType])
  return null
}
