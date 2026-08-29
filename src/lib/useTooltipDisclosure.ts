import { useEffect, useId, useRef, useState } from 'react'

/**
 * The open/closed behaviour shared by every tooltip in the app.
 *
 * Two ways in, tracked separately, because one state cannot serve both: a
 * pointer *peeks* — open while hovering, gone when it leaves — and a click
 * *pins*, so the tip survives the mouse moving away and touch has any way in at
 * all. Folded into one flag, a click landing on an already-hovered trigger
 * reads as closing it.
 *
 * Pinned closes on Escape and on a click anywhere else, the two ways out every
 * dismissible thing in a browser offers.
 */
export function useTooltipDisclosure<T extends HTMLElement>() {
  const [pinned, setPinned] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const id = useId()
  const wrapRef = useRef<T>(null)

  useEffect(() => {
    if (!pinned) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPinned(false)
    }
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [pinned])

  return {
    open: pinned || peeking,
    id,
    wrapRef,
    /** Spread onto the element that opens the tooltip. */
    triggerProps: {
      onClick: () => setPinned((p) => !p),
      onMouseEnter: () => setPeeking(true),
      onMouseLeave: () => setPeeking(false),
      onFocus: () => setPeeking(true),
      onBlur: () => setPeeking(false),
    },
  }
}
