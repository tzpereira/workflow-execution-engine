import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ResizeHandle } from './ResizeHandle'

describe('ResizeHandle', () => {
  it('reports horizontal movement only while pointer-down (axis="x")', () => {
    const onDelta = vi.fn()
    render(<ResizeHandle axis="x" onDelta={onDelta} />)
    const handle = screen.getByRole('separator')

    // Movement before pointerdown is ignored.
    fireEvent.pointerMove(handle, { movementX: 10, movementY: 3 })
    expect(onDelta).not.toHaveBeenCalled()

    fireEvent.pointerDown(handle, { pointerId: 1 })
    fireEvent.pointerMove(handle, { movementX: 10, movementY: 3 })
    fireEvent.pointerMove(handle, { movementX: -4, movementY: 3 })
    expect(onDelta).toHaveBeenNthCalledWith(1, 10)
    expect(onDelta).toHaveBeenNthCalledWith(2, -4)

    fireEvent.pointerUp(handle, { pointerId: 1 })
    onDelta.mockClear()
    fireEvent.pointerMove(handle, { movementX: 99, movementY: 99 })
    expect(onDelta).not.toHaveBeenCalled()
  })

  it('reports vertical movement (axis="y")', () => {
    const onDelta = vi.fn()
    render(<ResizeHandle axis="y" onDelta={onDelta} />)
    const handle = screen.getByRole('separator')

    fireEvent.pointerDown(handle, { pointerId: 1 })
    fireEvent.pointerMove(handle, { movementX: 5, movementY: 20 })
    expect(onDelta).toHaveBeenCalledWith(20)
  })
})
