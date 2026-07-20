import { useRef } from 'react'

// ResizeHandle is a thin drag bar for a resizable panel (M1.14b). `axis="x"`
// drags horizontally (the Inspector sidebar's width); `axis="y"` drags
// vertically (the Timeline panel's height, dragging up growing it since it's
// anchored to the bottom). onDelta receives the raw pointer movement each
// frame; the caller (which owns the actual size via usePersistedSize) decides
// the sign and clamping — this component only reports movement.
export function ResizeHandle({ axis, onDelta }: { axis: 'x' | 'y'; onDelta: (deltaPx: number) => void }) {
  const dragging = useRef(false)

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true
    // jsdom (the test environment) doesn't implement pointer capture; real
    // browsers do, and it's what keeps the drag tracking correctly if the
    // cursor moves off the thin handle mid-drag.
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return
    onDelta(axis === 'x' ? e.movementX : e.movementY)
  }

  function onPointerUp(e: React.PointerEvent) {
    dragging.current = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={
        axis === 'x'
          ? 'w-1 shrink-0 cursor-col-resize bg-neutral-200 hover:bg-neutral-400'
          : 'h-1 shrink-0 cursor-row-resize bg-neutral-200 hover:bg-neutral-400'
      }
    />
  )
}
