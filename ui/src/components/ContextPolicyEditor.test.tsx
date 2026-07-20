import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ContextPolicyEditor } from './ContextPolicyEditor'

describe('ContextPolicyEditor', () => {
  it('shows the Worker default read-only and no mode select when the node has no override', () => {
    render(
      <ContextPolicyEditor
        policy={undefined}
        workerDefault={{ mode: 'diff-only' }}
        availableNodeIds={['fetch-diff']}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('diff-only')).toBeInTheDocument()
    expect(screen.queryByLabelText('Context policy mode')).not.toBeInTheDocument()
  })

  it('clicking "override for this node" starts the override from the Worker default', () => {
    const onChange = vi.fn()
    render(
      <ContextPolicyEditor policy={undefined} workerDefault={{ mode: 'diff-only' }} availableNodeIds={[]} onChange={onChange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'override for this node' }))
    expect(onChange).toHaveBeenCalledWith({ mode: 'diff-only' })
  })

  it('override carries over the Worker default\'s params.artifacts too, not just its mode', () => {
    const onChange = vi.fn()
    render(
      <ContextPolicyEditor
        policy={undefined}
        workerDefault={{ mode: 'artifacts', params: { artifacts: ['fetch-diff'] } }}
        availableNodeIds={['fetch-diff']}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'override for this node' }))
    expect(onChange).toHaveBeenCalledWith({ mode: 'artifacts', params: { artifacts: ['fetch-diff'] } })
  })

  it('switching to "artifacts" mode reveals the node picker', () => {
    const onChange = vi.fn()
    render(
      <ContextPolicyEditor policy={{ mode: 'diff-only' }} workerDefault={undefined} availableNodeIds={['fetch-diff']} onChange={onChange} />,
    )
    fireEvent.change(screen.getByLabelText('Context policy mode'), { target: { value: 'artifacts' } })
    expect(onChange).toHaveBeenCalledWith({ mode: 'artifacts', params: { artifacts: [] } })
  })

  it('toggling a checkbox adds/removes that node from params.artifacts', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ContextPolicyEditor
        policy={{ mode: 'artifacts', params: { artifacts: [] } }}
        workerDefault={undefined}
        availableNodeIds={['fetch-diff', 'reviewer-a']}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByLabelText('fetch-diff'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'artifacts', params: { artifacts: ['fetch-diff'] } })

    rerender(
      <ContextPolicyEditor
        policy={{ mode: 'artifacts', params: { artifacts: ['fetch-diff'] } }}
        workerDefault={undefined}
        availableNodeIds={['fetch-diff', 'reviewer-a']}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByLabelText('fetch-diff'))
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'artifacts', params: { artifacts: [] } })
  })

  it('"clear" removes the node-level override entirely', () => {
    const onChange = vi.fn()
    render(<ContextPolicyEditor policy={{ mode: 'full' }} workerDefault={{ mode: 'diff-only' }} availableNodeIds={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })
})
