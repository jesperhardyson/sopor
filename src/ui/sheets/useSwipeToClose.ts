import { useCallback, useEffect, useRef } from 'react'

/** Från md och uppåt är arket en centrerad dialog, som inte ska gå att svepa bort. */
const DIALOG_WIDTH = '(min-width: 48rem)'
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const CLOSE_DISTANCE_PX = 100
const CLOSE_SHARE = 0.25
/** En snabb rörelse stänger också, om den inte bara är en darrning. */
const FLICK_PX_PER_MS = 0.5
const FLICK_MIN_PX = 30
const ANIMATION_MS = 200

const matches = (query: string) => window.matchMedia?.(query).matches ?? false

/**
 * Svep nedåt stänger bottenarket: arket följer fingret och går tillbaka om svepet var för kort.
 * Gesten startar bara när arket är scrollat högst upp, annars är det innehållet som ska scrolla.
 * Lyssnarna läggs direkt på elementet, eftersom Reacts touchmove inte kan hindra sidan från att scrolla.
 */
export function useSwipeToClose(onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])

  return useCallback((sheet: HTMLElement | null) => {
    if (!sheet) return

    let start: { x: number; y: number; time: number } | null = null
    let dragged = 0
    let dragging = false
    let timer: ReturnType<typeof setTimeout> | undefined

    function reset() {
      start = null
      dragging = false
      dragged = 0
    }

    function animateTo(transform: string, done: () => void) {
      sheet!.style.transition = `transform ${ANIMATION_MS}ms ease-out`
      sheet!.style.transform = transform
      timer = setTimeout(done, ANIMATION_MS)
    }

    function goBack() {
      animateTo('', () => {
        sheet!.style.transition = ''
      })
    }

    function dismiss() {
      // Arket är redan borta, så stängningsanimationen får inte hoppa tillbaka det.
      sheet!.style.animation = 'none'
      if (matches(REDUCED_MOTION)) close.current()
      else animateTo('translateY(100%)', () => close.current())
    }

    function onStart(e: TouchEvent) {
      clearTimeout(timer)
      reset()
      const fromField = (e.target as Element).closest('input, textarea, select, [contenteditable="true"]')
      if (e.touches.length !== 1 || fromField || sheet!.scrollTop > 0 || matches(DIALOG_WIDTH)) return
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: e.timeStamp }
    }

    function onMove(e: TouchEvent) {
      if (!start) return
      if (e.touches.length !== 1) {
        if (dragging) goBack()
        reset()
        return
      }
      const dy = e.touches[0].clientY - start.y
      const dx = e.touches[0].clientX - start.x
      if (!dragging) {
        // Första rörelsen avgör: uppåt eller åt sidan lämnar gesten åt webbläsaren.
        if (dy <= 0 || Math.abs(dx) >= dy) {
          if (dy !== 0 || dx !== 0) start = null
          return
        }
        dragging = true
        sheet!.style.transition = 'none'
      }
      e.preventDefault()
      dragged = Math.max(0, dy)
      sheet!.style.transform = dragged > 0 ? `translateY(${dragged}px)` : ''
    }

    function onEnd(e: TouchEvent) {
      if (!dragging || !start) return reset()
      const speed = dragged / Math.max(1, e.timeStamp - start.time)
      const far = dragged >= Math.max(CLOSE_DISTANCE_PX, sheet!.offsetHeight * CLOSE_SHARE)
      const flick = speed >= FLICK_PX_PER_MS && dragged >= FLICK_MIN_PX
      reset()
      if (far || flick) dismiss()
      else goBack()
    }

    function onCancel() {
      if (dragging) goBack()
      reset()
    }

    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: false })
    sheet.addEventListener('touchend', onEnd, { passive: true })
    sheet.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      clearTimeout(timer)
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
      sheet.removeEventListener('touchend', onEnd)
      sheet.removeEventListener('touchcancel', onCancel)
    }
  }, [])
}
